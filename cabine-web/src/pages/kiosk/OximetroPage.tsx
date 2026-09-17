import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { deviceSocket, fetchPersonOximeter, saveOximeterReading } from '../../api';
import { OximeterGuideIllustration } from '../../components/OximeterGuideIllustration';
import { OximeterPulseGraph } from '../../components/OximeterPulseGraph';
import { AfterStepScreen } from '../../components/AfterStepScreen';
import { useKiosk } from '../../kiosk/KioskContext';
import { KioskLayout } from '../../kiosk/KioskLayout';
import { loadOximeterAddress, saveOximeterAddress } from '../../session/oximeterDevice';
import { newVisitId } from '../../session/visitId';
import type { OximeterLive, OximeterReading } from '../../types/oximeter';

export function OximetroPage() {
    const navigate = useNavigate();
    const { session, setLastOximeter } = useKiosk();
    const person = session.person;

    const [status, setStatus] = useState('Procurando o oxímetro… coloque o dedo no sensor.');
    const [spo2, setSpo2] = useState<number | null>(null);
    const [pulse, setPulse] = useState<number | null>(null);
    const [fingerOn, setFingerOn] = useState(false);
    const [stable, setStable] = useState(false);
    const [listening, setListening] = useState(false);
    const [wave, setWave] = useState<number[]>([]);
    const [graphKey, setGraphKey] = useState(0);
    const [done, setDone] = useState(false);
    const [stableHits, setStableHits] = useState(0);
    const [stableNeeded, setStableNeeded] = useState(4);
    const [elapsedSec, setElapsedSec] = useState(0);

    const wsRef = useRef<WebSocket | null>(null);
    const personIdRef = useRef(person?.id ?? '');
    const genRef = useRef(0);
    const reconnectTimer = useRef(0);
    const mountedRef = useRef(true);
    const savedRef = useRef(false);
    const waveRef = useRef<number[]>([]);
    const latestRef = useRef<{
        spo2_pct: number | null;
        pulse_bpm: number | null;
        pi_pct: number | null;
        device_name?: string;
        device_address?: string | null;
    }>({ spo2_pct: null, pulse_bpm: null, pi_pct: null });

    personIdRef.current = person?.id ?? '';

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            window.clearTimeout(reconnectTimer.current);
            genRef.current += 1;
            const socket = wsRef.current;
            wsRef.current = null;
            socket?.close();
        };
    }, []);

    const persistReading = useCallback(
        async (reading: {
            spo2_pct: number;
            pulse_bpm: number;
            pi_pct?: number | null;
            device_name?: string;
            device_address?: string | null;
        }): Promise<OximeterReading | null> => {
            if (!person) return null;
            const waveform = waveRef.current.slice(-220);
            const local: OximeterReading = {
                id: newVisitId(),
                person_id: person.id,
                device_name: reading.device_name ?? 'PC-60NW',
                device_address: reading.device_address ?? null,
                spo2_pct: reading.spo2_pct,
                pulse_bpm: reading.pulse_bpm,
                pi_pct: reading.pi_pct ?? null,
                stable: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                waveform,
            };
            setLastOximeter(local);
            try {
                const saved = await saveOximeterReading({
                    person_id: person.id,
                    device_name: local.device_name,
                    device_address: local.device_address,
                    spo2_pct: local.spo2_pct,
                    pulse_bpm: local.pulse_bpm,
                    pi_pct: local.pi_pct,
                    stable: true,
                    waveform,
                    visit_id: session.visitId,
                });
                const withWave = { ...saved, waveform: saved.waveform?.length ? saved.waveform : waveform };
                setLastOximeter(withWave);
                return withWave;
            } catch {
                try {
                    const rows = await fetchPersonOximeter(person.id);
                    if (rows[0]) {
                        const withWave = { ...rows[0], waveform };
                        setLastOximeter(withWave);
                        return withWave;
                    }
                } catch {
                    /* sessão local já gravada */
                }
                return local;
            }
        },
        [person, session.visitId, setLastOximeter],
    );

    const finish = useCallback(
        (reading?: Partial<OximeterReading>) => {
            if (savedRef.current) return;
            const spo2Pct = reading?.spo2_pct ?? latestRef.current.spo2_pct;
            const pulseBpm = reading?.pulse_bpm ?? latestRef.current.pulse_bpm;
            if (spo2Pct == null || pulseBpm == null || !person) return;
            savedRef.current = true;
            setDone(true);
            setListening(false);
            genRef.current += 1;
            window.clearTimeout(reconnectTimer.current);
            const socket = wsRef.current;
            wsRef.current = null;
            if (socket) {
                socket.onmessage = null;
                socket.onerror = null;
                socket.onclose = null;
                try {
                    socket.close();
                } catch {
                    /* já fechado */
                }
            }
            void persistReading({
                spo2_pct: spo2Pct,
                pulse_bpm: pulseBpm,
                pi_pct: reading?.pi_pct ?? latestRef.current.pi_pct,
                device_name: reading?.device_name ?? latestRef.current.device_name,
                device_address: reading?.device_address ?? latestRef.current.device_address,
            });
        },
        [persistReading, person],
    );

    const start = useCallback(
        (force = false) => {
            const pid = personIdRef.current;
            if (!pid || savedRef.current) return;

            const existing = wsRef.current;
            if (
                !force
                && existing
                && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)
            ) {
                return;
            }

            window.clearTimeout(reconnectTimer.current);
            genRef.current += 1;
            const gen = genRef.current;
            const prev = wsRef.current;
            wsRef.current = null;
            prev?.close();

            setSpo2(null);
            setPulse(null);
            setStable(false);
            setFingerOn(false);
            setWave([]);
            waveRef.current = [];
            setGraphKey((value) => value + 1);
            setListening(true);
            setStableHits(0);
            setElapsedSec(0);
            setStatus('Ligando o oxímetro. Encaixe o dedo indicador no clipe — a espera faz parte.');

            const params = new URLSearchParams({ person_id: pid });
            if (session.visitId) params.set('visit_id', session.visitId);
            const known = loadOximeterAddress();
            if (known) params.set('address', known);
            const socket = deviceSocket('/ws/oximeter', params);
            wsRef.current = socket;

            socket.onopen = () => {
                socket.send(JSON.stringify({
                    type: 'PERSON',
                    person_id: pid,
                    visit_id: session.visitId,
                }));
            };

            socket.onmessage = (event) => {
                const payload = JSON.parse(event.data) as OximeterLive;
                if (payload.type === 'STATUS' && payload.msg) {
                    setStatus(payload.msg);
                    return;
                }
                if (payload.type !== 'OXIMETER') return;
                if (payload.device_address) saveOximeterAddress(payload.device_address);
                if (payload.waveform?.length) {
                    setWave(payload.waveform);
                    waveRef.current = waveRef.current.concat(payload.waveform).slice(-480);
                }
                if (payload.spo2_pct != null) setSpo2(payload.spo2_pct);
                if (payload.pulse_bpm != null) setPulse(payload.pulse_bpm);
                if (payload.finger_on != null) setFingerOn(Boolean(payload.finger_on));
                if (payload.stable != null) setStable(Boolean(payload.stable));
                if (payload.stable_hits != null) setStableHits(payload.stable_hits);
                if (payload.stable_needed != null) setStableNeeded(payload.stable_needed);
                latestRef.current = {
                    spo2_pct: payload.spo2_pct ?? latestRef.current.spo2_pct,
                    pulse_bpm: payload.pulse_bpm ?? latestRef.current.pulse_bpm,
                    pi_pct: payload.pi_pct ?? latestRef.current.pi_pct,
                    device_name: payload.device_name ?? latestRef.current.device_name,
                    device_address: payload.device_address ?? latestRef.current.device_address,
                };

                if (payload.finger_on && payload.spo2_pct && payload.pulse_bpm) {
                    setStatus(
                        payload.stable
                            ? 'Leitura confirmada. Avançando…'
                            : 'Confirmando o sinal. Fique parado — a cabine espera estabilidade, não um tempo fixo.',
                    );
                }

                if (payload.stable && payload.spo2_pct != null && payload.pulse_bpm != null) {
                    finish({
                        spo2_pct: payload.spo2_pct,
                        pulse_bpm: payload.pulse_bpm,
                        pi_pct: payload.pi_pct ?? null,
                        device_name: payload.device_name,
                        device_address: payload.device_address ?? null,
                    });
                }
            };

            socket.onerror = () => {
                /* onclose reconecta */
            };

            socket.onclose = () => {
                if (!mountedRef.current || gen !== genRef.current || wsRef.current !== socket) return;
                if (savedRef.current) return;
                wsRef.current = null;
                setListening(false);
                setFingerOn(false);
                setStatus('Reconectando. Mantenha o dedo no clipe — está sob controle.');
                reconnectTimer.current = window.setTimeout(() => {
                    if (mountedRef.current && genRef.current === gen && !savedRef.current) start(true);
                }, 2500);
            };
        },
        [finish, session.visitId],
    );

    useEffect(() => {
        if (!person?.id) return;
        start();
    }, [person?.id, start]);

    useEffect(() => {
        if (done || !listening) return;
        const id = window.setInterval(() => {
            setElapsedSec((value) => value + 1);
        }, 1000);
        return () => window.clearInterval(id);
    }, [done, listening]);

    function goBack() {
        const latest = latestRef.current;
        if (!savedRef.current && latest.spo2_pct != null && latest.pulse_bpm != null) {
            savedRef.current = true;
            void persistReading({
                spo2_pct: latest.spo2_pct,
                pulse_bpm: latest.pulse_bpm,
                pi_pct: latest.pi_pct,
                device_name: latest.device_name,
                device_address: latest.device_address,
            });
        }
        navigate('/menu');
    }

    if (!person) return <Navigate to="/matricula" replace />;

    if (done) {
        return (
            <KioskLayout>
                <AfterStepScreen
                    justFinished="oximetro"
                    title="Oximetria concluída"
                    description="Sua oxigenação e pulso foram registrados."
                />
            </KioskLayout>
        );
    }

    const guideStep = stable
        ? 'done'
        : fingerOn
            ? 'reading'
            : listening
                ? 'finger'
                : 'searching';
    const meterPct = Math.min(100, Math.round((stableHits / Math.max(stableNeeded, 1)) * 100));

    return (
        <KioskLayout>
            <div className="kiosk-center-card kiosk-oximeter-card">
                <p className="kiosk-step-label">4 · Passo</p>
                <h1 className="kiosk-title">Oximetria</h1>
                <p className="kiosk-oximeter-status" role="status" aria-live="polite">
                    {status}
                </p>

                <OximeterGuideIllustration step={guideStep} spo2={spo2} pulse={pulse} />

                <p className="kiosk-oxi-hint">
                    {stable
                        ? 'Sinal confirmado. Aguarde um instante.'
                        : fingerOn
                            ? 'A leitura espera o oxigênio e o pulso se repetirem quatro vezes seguidas. Demorar um pouco é esperado.'
                            : 'Pode levar uns segundos para o clipe ligar. Fique à vontade — o totem continua tentando.'}
                </p>

                <div className="kiosk-oxi-timer">
                    <span>{elapsedSec}s nesta etapa</span>
                    <span>
                        {stable
                            ? 'Estável'
                            : fingerOn
                                ? `Estabilidade ${stableHits}/${stableNeeded}`
                                : 'Aguardando o dedo'}
                    </span>
                </div>
                <div className="kiosk-oxi-meter" role="progressbar" aria-valuenow={meterPct} aria-valuemin={0} aria-valuemax={100}>
                    <span style={{ width: `${stable ? 100 : meterPct}%` }} />
                </div>

                <div className="cabine-oxi-vitals">
                    <article>
                        <p className="cabine-kicker">Oxigenação</p>
                        <strong>{spo2 != null ? `${spo2}%` : '—'}</strong>
                        <span>SpO₂</span>
                    </article>
                    <article>
                        <p className="cabine-kicker">Pulso</p>
                        <strong>{pulse != null ? pulse : '—'}</strong>
                        <span>bpm</span>
                    </article>
                </div>

                <div className="cabine-oxi-wave">
                    <OximeterPulseGraph
                        key={graphKey}
                        samples={wave}
                        bpm={pulse}
                        active={listening || fingerOn}
                    />
                </div>

                {stable ? (
                    <p className="kiosk-done-pill" style={{ justifySelf: 'center' }}>
                        Leitura estável
                    </p>
                ) : null}

                <button type="button" className="kiosk-back" onClick={goBack}>
                    ← Voltar ao menu
                </button>
            </div>
        </KioskLayout>
    );
}
