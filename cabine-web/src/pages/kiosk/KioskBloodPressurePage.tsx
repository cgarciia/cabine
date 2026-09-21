import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { deviceSocket, fetchPersonBloodPressure, saveBloodPressureReading } from '../../api';
import { AfterStepScreen } from '../../components/AfterStepScreen';
import { BpGuideIllustration, type BpGuideStep } from '../../components/BpGuideIllustration';
import { HeartbeatMonitor } from '../../components/HeartbeatMonitor';
import { KioskBackButton } from '../../components/KioskIcon';
import { useKiosk } from '../../kiosk/KioskContext';
import { KioskLayout } from '../../kiosk/KioskLayout';
import { loadBloodPressureAddress, saveBloodPressureAddress } from '../../session/bloodPressureDevice';
import { newVisitId } from '../../session/visitId';
import type { BloodPressureLive, BloodPressureReading } from '../../types/bloodPressure';
import { useHem7530EcgMic } from '../../utils/hem7530EcgMic';

const STABLE_MS = 5000;
const RECORD_MS = 30000;

const GUIDE: Array<{ id: BpGuideStep; title: string; detail: string }> = [
    {
        id: 'cuff',
        title: 'Coloque o manguito',
        detail: 'No braço, na altura do coração. Ajuste sem apertar demais.',
    },
    {
        id: 'sensors',
        title: 'Dedos nos sensores',
        detail: 'Encoste os indicadores nos sensores metálicos e fique parado.',
    },
    {
        id: 'start',
        title: 'Aperte START/STOP',
        detail: 'Só no Complete. Esta tela já está ouvindo — não precisa iniciar aqui.',
    },
    {
        id: 'stabilize',
        title: 'Sinal encontrado',
        detail: 'Espere o ritmo estabilizar. Mantenha os dedos e o tablet encostados.',
    },
    {
        id: 'record',
        title: 'Medindo 30 segundos',
        detail: 'Respire normalmente. Não fale e não mexa os braços.',
    },
    {
        id: 'pause',
        title: 'Sinal fraco',
        detail: 'Mantenha os dedos nos sensores e o tablet encostado no aparelho.',
    },
    {
        id: 'wait_bp',
        title: 'Aguarde o visor',
        detail: 'O ECG já foi gravado. Quando a pressão aparecer no Complete, entra no relatório.',
    },
];

type GuidePhase = 'prep' | 'stabilize' | 'record' | 'pause' | 'wait_bp';

export function KioskBloodPressurePage() {
    const navigate = useNavigate();
    const { session, setLastBloodPressure } = useKiosk();
    const person = session.person;

    const [status, setStatus] = useState(
        'Siga os passos e aperte START/STOP no Complete. Esta tela já está ouvindo.',
    );
    const [sys, setSys] = useState<number | null>(null);
    const [dia, setDia] = useState<number | null>(null);
    const [pulse, setPulse] = useState<number | null>(null);
    const [flags, setFlags] = useState<string[]>([]);
    const [listening, setListening] = useState(false);
    const [done, setDone] = useState(false);
    const [phase, setPhase] = useState<GuidePhase>('prep');
    const [prepIndex, setPrepIndex] = useState(0);
    const [stableLeft, setStableLeft] = useState(5);
    const [recordLeft, setRecordLeft] = useState(30);
    const [frozenEcg, setFrozenEcg] = useState<number[] | null>(null);
    const ecg = useHem7530EcgMic(Boolean(person) && !done);

    const wsRef = useRef<WebSocket | null>(null);
    const personIdRef = useRef(person?.id ?? '');
    const genRef = useRef(0);
    const reconnectTimer = useRef(0);
    const mountedRef = useRef(true);
    const savedRef = useRef(false);
    const latestRef = useRef<Partial<BloodPressureReading>>({});
    const lockedRef = useRef(false);
    const ecgDoneRef = useRef(false);
    const beginRecordRef = useRef(ecg.beginRecord);
    const takeRecordRef = useRef(ecg.takeRecord);
    const tryFinishRef = useRef<() => void>(() => undefined);

    personIdRef.current = person?.id ?? '';
    lockedRef.current = ecg.toneLocked;
    beginRecordRef.current = ecg.beginRecord;
    takeRecordRef.current = ecg.takeRecord;

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
            sys_mmhg: number;
            dia_mmhg: number;
            pulse_bpm: number;
            movement?: boolean;
            irregular_heartbeat?: boolean;
            measured_at: string;
            device_name?: string;
            device_address?: string | null;
            ecg_mv?: number[];
        }): Promise<BloodPressureReading | null> => {
            if (!person) return null;
            const local: BloodPressureReading = {
                id: newVisitId(),
                person_id: person.id,
                device_name: reading.device_name ?? 'HEM-7530T',
                device_address: reading.device_address ?? null,
                sys_mmhg: reading.sys_mmhg,
                dia_mmhg: reading.dia_mmhg,
                pulse_bpm: reading.pulse_bpm,
                movement: Boolean(reading.movement),
                irregular_heartbeat: Boolean(reading.irregular_heartbeat),
                measured_at: reading.measured_at,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                ecg_mv: reading.ecg_mv,
            };
            setLastBloodPressure(local);
            try {
                const saved = await saveBloodPressureReading({
                    person_id: person.id,
                    device_name: local.device_name,
                    device_address: local.device_address,
                    sys_mmhg: local.sys_mmhg,
                    dia_mmhg: local.dia_mmhg,
                    pulse_bpm: local.pulse_bpm,
                    movement: local.movement,
                    irregular_heartbeat: local.irregular_heartbeat,
                    measured_at: local.measured_at,
                    visit_id: session.visitId,
                });
                setLastBloodPressure({ ...saved, ecg_mv: local.ecg_mv });
                return { ...saved, ecg_mv: local.ecg_mv };
            } catch {
                try {
                    const rows = await fetchPersonBloodPressure(person.id);
                    if (rows[0]) {
                        const withEcg = { ...rows[0], ecg_mv: local.ecg_mv };
                        setLastBloodPressure(withEcg);
                        return withEcg;
                    }
                } catch {
                    /* sessão local já gravada */
                }
                return local;
            }
        },
        [person, session.visitId, setLastBloodPressure],
    );

    const finish = useCallback(
        (reading: Partial<BloodPressureReading>) => {
            if (savedRef.current) return;
            const sysMmhg = reading.sys_mmhg ?? latestRef.current.sys_mmhg;
            const diaMmhg = reading.dia_mmhg ?? latestRef.current.dia_mmhg;
            const pulseBpm = reading.pulse_bpm ?? latestRef.current.pulse_bpm;
            const measuredAt = reading.measured_at ?? latestRef.current.measured_at;
            if (sysMmhg == null || diaMmhg == null || pulseBpm == null || !measuredAt || !person) return;
            savedRef.current = true;
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
            const wave = reading.ecg_mv ?? latestRef.current.ecg_mv;
            void persistReading({
                sys_mmhg: sysMmhg,
                dia_mmhg: diaMmhg,
                pulse_bpm: pulseBpm,
                movement: reading.movement ?? latestRef.current.movement,
                irregular_heartbeat: reading.irregular_heartbeat ?? latestRef.current.irregular_heartbeat,
                measured_at: measuredAt,
                device_name: reading.device_name ?? latestRef.current.device_name,
                device_address: reading.device_address ?? latestRef.current.device_address,
                ecg_mv: wave,
            }).then(() => {
                if (mountedRef.current) setDone(true);
            });
        },
        [persistReading, person],
    );

    const tryFinish = useCallback(() => {
        if (savedRef.current) return;
        const latest = latestRef.current;
        if (latest.sys_mmhg == null || latest.dia_mmhg == null || latest.pulse_bpm == null || !latest.measured_at) {
            if (ecgDoneRef.current) {
                setPhase('wait_bp');
                setStatus('ECG de 30 segundos gravado. Aguarde o resultado no visor do Complete.');
            }
            return;
        }
        finish(latest);
    }, [finish]);

    tryFinishRef.current = tryFinish;

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

            setListening(true);
            setStatus('Coloque o manguito e os dedos. Depois aperte START/STOP no Complete.');

            const params = new URLSearchParams({ person_id: pid });
            if (session.visitId) params.set('visit_id', session.visitId);
            const known = loadBloodPressureAddress();
            if (known) params.set('address', known);
            const socket = deviceSocket('/ws/blood-pressure', params);
            wsRef.current = socket;

            socket.onopen = () => {
                socket.send(JSON.stringify({
                    type: 'PERSON',
                    person_id: pid,
                    visit_id: session.visitId,
                }));
            };

            socket.onmessage = (event) => {
                let payload: BloodPressureLive;
                try {
                    payload = JSON.parse(event.data) as BloodPressureLive;
                } catch {
                    return;
                }
                if (payload.type === 'STATUS' && payload.msg) {
                    return;
                }
                if (payload.type !== 'BLOOD_PRESSURE') return;
                if (payload.device_address) saveBloodPressureAddress(payload.device_address);
                if (payload.sys_mmhg != null) setSys(payload.sys_mmhg);
                if (payload.dia_mmhg != null) setDia(payload.dia_mmhg);
                if (payload.pulse_bpm != null) setPulse(payload.pulse_bpm);
                const nextFlags: string[] = [];
                if (payload.movement) nextFlags.push('movimento na medição');
                if (payload.irregular_heartbeat) nextFlags.push('pulso irregular');
                setFlags(nextFlags);
                latestRef.current = {
                    sys_mmhg: payload.sys_mmhg ?? latestRef.current.sys_mmhg,
                    dia_mmhg: payload.dia_mmhg ?? latestRef.current.dia_mmhg,
                    pulse_bpm: payload.pulse_bpm ?? latestRef.current.pulse_bpm,
                    movement: payload.movement ?? latestRef.current.movement,
                    irregular_heartbeat: payload.irregular_heartbeat ?? latestRef.current.irregular_heartbeat,
                    measured_at: payload.measured_at ?? latestRef.current.measured_at,
                    device_name: payload.device_name ?? latestRef.current.device_name,
                    device_address: payload.device_address ?? latestRef.current.device_address,
                    ecg_mv: latestRef.current.ecg_mv,
                };
                if (payload.stable && payload.sys_mmhg != null && payload.dia_mmhg != null && payload.pulse_bpm != null && payload.measured_at) {
                    tryFinishRef.current();
                }
            };

            socket.onclose = () => {
                if (!mountedRef.current || gen !== genRef.current || wsRef.current !== socket) return;
                if (savedRef.current) return;
                wsRef.current = null;
                reconnectTimer.current = window.setTimeout(() => {
                    if (mountedRef.current && genRef.current === gen && !savedRef.current) start(true);
                }, 4000);
            };
        },
        [session.visitId],
    );

    useEffect(() => {
        if (!person?.id) return;
        start();
    }, [person?.id, start]);

    useEffect(() => {
        if (done || savedRef.current) return;
        let stableStarted: number | null = null;
        let recording = false;
        let recordElapsed = 0;
        let lostSince: number | null = null;
        let last = performance.now();

        const id = window.setInterval(() => {
            if (savedRef.current || ecgDoneRef.current) return;
            const now = performance.now();
            const dt = now - last;
            last = now;
            const locked = lockedRef.current;

            if (!locked) {
                if (lostSince == null) lostSince = now;
                if (now - lostSince < 1800) return;
                stableStarted = null;
                if (recording) {
                    setPhase('pause');
                    setStatus('Sinal fraco. Mantenha os dedos nos sensores e o tablet encostado no Complete.');
                } else {
                    setPhase('prep');
                    setStableLeft(5);
                    setStatus('Coloque o manguito e os dedos. Depois aperte START/STOP no Complete.');
                }
                return;
            }

            lostSince = null;

            if (!recording) {
                if (stableStarted == null) stableStarted = now;
                const waited = now - stableStarted;
                const left = Math.max(0, Math.ceil((STABLE_MS - waited) / 1000));
                setPhase('stabilize');
                setStableLeft(left);
                setStatus(`Sinal encontrado. Espere estabilizar: ${left} s.`);
                if (waited >= STABLE_MS) {
                    recording = true;
                    recordElapsed = 0;
                    beginRecordRef.current();
                    setPhase('record');
                    setRecordLeft(30);
                    setStatus('Sinal estável. Gravando 30 segundos. Fique parado.');
                }
                return;
            }

            recordElapsed += dt;
            const leftMs = Math.max(0, RECORD_MS - recordElapsed);
            setRecordLeft(Math.max(0, Math.ceil(leftMs / 1000)));
            if (leftMs <= 0) {
                const wave = takeRecordRef.current();
                ecgDoneRef.current = true;
                latestRef.current = { ...latestRef.current, ecg_mv: wave };
                setFrozenEcg(wave);
                tryFinishRef.current();
            }
        }, 200);

        return () => window.clearInterval(id);
    }, [done]);

    useEffect(() => {
        if (phase !== 'prep' || done) return;
        const id = window.setInterval(() => {
            setPrepIndex((value) => (value + 1) % 3);
        }, 4200);
        return () => window.clearInterval(id);
    }, [phase, done]);

    function goBack() {
        navigate('/menu');
    }

    if (!person) return <Navigate to="/matricula" replace />;

    if (done) {
        return (
            <KioskLayout>
                <AfterStepScreen
                    justFinished="bloodPressure"
                    title="Pressão registrada"
                    description={
                        frozenEcg && frozenEcg.length
                            ? 'Pressão, pulso e 30 segundos de ECG foram gravados.'
                            : 'Pressão e pulso foram registrados.'
                    }
                    hint="Os números aparecem no relatório desta sessão."
                />
            </KioskLayout>
        );
    }

    const guideStep: BpGuideStep = phase === 'prep'
        ? (GUIDE[prepIndex]?.id ?? 'cuff')
        : phase;
    const current = GUIDE.find((item) => item.id === guideStep) ?? GUIDE[0];
    const activeDot = phase === 'prep' ? prepIndex : 3;
    const meterPct = phase === 'record' || phase === 'pause'
        ? Math.min(100, Math.round(((30 - recordLeft) / 30) * 100))
        : phase === 'stabilize'
            ? Math.min(100, Math.round(((5 - stableLeft) / 5) * 100))
            : phase === 'wait_bp'
                ? 100
                : 0;

    return (
        <KioskLayout>
            <div className="kiosk-center-card kiosk-oximeter-card kiosk-bp-card">
                <p className="kiosk-step-label">5 · Passo</p>
                <h1 className="kiosk-title">{current.title}</h1>
                <p className="kiosk-oximeter-status" role="status" aria-live="polite">
                    {status}
                </p>

                <BpGuideIllustration step={guideStep} />
                <p className="kiosk-oxi-hint">{current.detail}</p>

                {ecg.error ? (
                    <>
                        <p className="kiosk-bp-flags">{ecg.error}</p>
                        <button type="button" className="kiosk-btn kiosk-btn-primary" onClick={() => void ecg.unlock()}>
                            Permitir microfone
                        </button>
                    </>
                ) : null}

                <div className="kiosk-oxi-timer">
                    <span>
                        {phase === 'record' || phase === 'pause'
                            ? `${recordLeft}s restantes`
                            : phase === 'stabilize'
                                ? `Estabilizando ${stableLeft}s`
                                : phase === 'wait_bp'
                                    ? 'ECG pronto'
                                    : 'Aguardando o START/STOP'}
                    </span>
                    <span>
                        {phase === 'record'
                            ? 'Gravando 30 s'
                            : phase === 'pause'
                                ? 'Pausado'
                                : phase === 'stabilize'
                                    ? 'Sinal estável em 5 s'
                                    : phase === 'wait_bp'
                                        ? 'Aguardando a pressão'
                                        : ecg.armed
                                            ? 'Microfone ligado'
                                            : 'Preparando o microfone'}
                    </span>
                </div>
                <div
                    className="kiosk-oxi-meter"
                    role="progressbar"
                    aria-valuenow={meterPct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                >
                    <span style={{ width: `${meterPct}%` }} />
                </div>

                <div className="kiosk-oxi-vitals kiosk-bp-vitals">
                    <article>
                        <p className="kiosk-kicker">Sistólica</p>
                        <strong>{sys != null ? sys : '—'}</strong>
                        <span>mmHg</span>
                    </article>
                    <article>
                        <p className="kiosk-kicker">Diastólica</p>
                        <strong>{dia != null ? dia : '—'}</strong>
                        <span>mmHg</span>
                    </article>
                    <article>
                        <p className="kiosk-kicker">Pulso</p>
                        <strong>{pulse != null ? pulse : '—'}</strong>
                        <span>bpm</span>
                    </article>
                </div>

                <HeartbeatMonitor
                    bpm={pulse}
                    active={listening || pulse != null || ecg.armed}
                    trace={frozenEcg ?? ecg.samples}
                    toneLocked={Boolean(frozenEcg?.length) || ecg.toneLocked}
                />
                {flags.length ? (
                    <p className="kiosk-bp-flags">{flags.join(' · ')}</p>
                ) : null}

                <div className="kiosk-dots" aria-hidden>
                    {[0, 1, 2, 3].map((index) => (
                        <span
                            key={index}
                            className={
                                index < activeDot
                                    ? 'done'
                                    : index === activeDot
                                        ? 'active'
                                        : ''
                            }
                        />
                    ))}
                </div>

                <KioskBackButton onClick={goBack}>Voltar ao menu</KioskBackButton>
            </div>
        </KioskLayout>
    );
}
