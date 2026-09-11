import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { fetchPersonOximeter, wsBaseUrl } from '../api';
import { AppLayout } from '../components/AppLayout';
import { OximeterPulseGraph } from '../components/OximeterPulseGraph';
import { PersonPicker } from '../components/PersonPicker';
import { useRole } from '../role/RoleContext';
import { loadCurrentPersonId, saveCurrentPersonId } from '../session/currentPerson';
import { loadOximeterAddress, saveOximeterAddress } from '../session/oximeterDevice';
import type { OximeterLive, OximeterReading } from '../types/oximeter';
import type { ScalePerson } from '../types/person';

function oximeterAdvice(spo2: number | null, pulse: number | null, waiting: boolean): string {
    if (waiting || spo2 == null || pulse == null) {
        return 'Coloque o dedo até o fundo do oxímetro, sem apertar, e permaneça parado. A oxigenação e o pulso aparecem sozinhos.';
    }
    if (spo2 < 90) {
        return 'A saturação está baixa nesta leitura. Avise o profissional da cabine e não force exercício agora.';
    }
    if (spo2 < 95) {
        return 'A saturação está um pouco abaixo do usual. Sente-se, respire com calma e avise o profissional se continuar assim.';
    }
    if (pulse < 50 || pulse > 120) {
        return 'O pulso saiu da faixa comum de repouso. Vale repetir a leitura parado e conversar com o profissional.';
    }
    return 'Leitura dentro de uma faixa comum em repouso. Este número não substitui avaliação clínica.';
}

export function OximeterPage() {
    const navigate = useNavigate();
    const { role } = useRole();
    const home = role === 'clinician' ? '/clinico' : '/';
    const [person, setPerson] = useState<ScalePerson | null>(null);
    const [status, setStatus] = useState('Procurando o oxímetro… coloque o dedo no sensor.');
    const [spo2, setSpo2] = useState<number | null>(null);
    const [pulse, setPulse] = useState<number | null>(null);
    const [fingerOn, setFingerOn] = useState(false);
    const [stable, setStable] = useState(false);
    const [listening, setListening] = useState(false);
    const [wave, setWave] = useState<number[]>([]);
    const [history, setHistory] = useState<OximeterReading[]>([]);
    const [session, setSession] = useState(0);
    const wsRef = useRef<WebSocket | null>(null);
    const personId = person?.id || loadCurrentPersonId();
    const personIdRef = useRef(personId);
    const genRef = useRef(0);
    const reconnectTimer = useRef(0);
    const mountedRef = useRef(true);
    personIdRef.current = personId;

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

    useEffect(() => {
        if (!personId) {
            setHistory([]);
            return;
        }
        fetchPersonOximeter(personId).then(setHistory).catch(() => setHistory([]));
    }, [personId, stable]);

    const start = useCallback((force = false) => {
        const pid = personIdRef.current;
        if (!pid) {
            setStatus('Escolha a pessoa cadastrada. Depois é só colocar o dedo no oxímetro.');
            return;
        }
        const existing = wsRef.current;
        if (
            !force
            && existing
            && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)
        ) {
            return;
        }
        saveCurrentPersonId(pid);
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
        setSession((value) => value + 1);
        setListening(true);
        setStatus('Procurando o oxímetro… coloque o dedo no sensor.');

        const params = new URLSearchParams({ person_id: pid });
        const known = loadOximeterAddress();
        if (known) params.set('address', known);
        const socket = new WebSocket(`${wsBaseUrl()}/ws/oximeter?${params.toString()}`);
        wsRef.current = socket;

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
            }
            if (payload.spo2_pct != null) setSpo2(payload.spo2_pct);
            if (payload.pulse_bpm != null) setPulse(payload.pulse_bpm);
            if (payload.finger_on != null) setFingerOn(Boolean(payload.finger_on));
            if (payload.stable != null) setStable(Boolean(payload.stable));
            if (payload.finger_on && payload.spo2_pct && payload.pulse_bpm) {
                setStatus(payload.stable ? 'Leitura gravada. Pode manter o dedo para acompanhar o pulso.' : 'Lendo... mantenha o dedo parado.');
            }
        };
        socket.onerror = () => {
            /* onclose trata a reconexão; o app oficial também fica tentando. */
        };
        socket.onclose = () => {
            if (!mountedRef.current || gen !== genRef.current || wsRef.current !== socket) return;
            wsRef.current = null;
            setListening(false);
            setFingerOn(false);
            setStatus('Procurando o oxímetro… coloque o dedo no sensor.');
            reconnectTimer.current = window.setTimeout(() => {
                if (mountedRef.current && genRef.current === gen) start(true);
            }, 2500);
        };
    }, []);

    useEffect(() => {
        if (!personId) return;
        start();
    }, [personId, start]);

    return (
        <AppLayout>
            <div className="cabine-stage">
                <div className="cabine-hero" style={{ maxWidth: 760 }}>
                    <p className="cabine-kicker">Medição</p>
                    <h1 style={{ margin: '8px 0 0', fontSize: '1.85rem' }}>Oximetria</h1>
                    <p className="cabine-oxi-prompt">
                        Deixe esta tela aberta e coloque o dedo no oxímetro. Assim que o aparelho ligar,
                        a cabine conecta sozinha e mostra oxigenação e pulso.
                    </p>

                    <PersonPicker
                        selectedId={personId}
                        onSelect={(next) => {
                            setPerson(next);
                            saveCurrentPersonId(next.id);
                        }}
                    />

                    <p style={{ marginTop: 16, color: '#0f766e', fontWeight: 600 }}>{status}</p>

                    <div className="cabine-oxi-vitals">
                        <article>
                            <p className="cabine-kicker">Oxigenação</p>
                            <strong>{spo2 != null ? `${spo2}%` : '—'}</strong>
                            <span>SpO2</span>
                        </article>
                        <article>
                            <p className="cabine-kicker">Pulso</p>
                            <strong>{pulse != null ? pulse : '—'}</strong>
                            <span>bpm</span>
                        </article>
                    </div>

                    <OximeterPulseGraph key={session} samples={wave} bpm={pulse} active={listening || fingerOn} />

                    <p style={{ color: '#334155' }}>{oximeterAdvice(spo2, pulse, !fingerOn)}</p>

                    {history[0] ? (
                        <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
                            Última leitura salva: SpO2 {history[0].spo2_pct}% · {history[0].pulse_bpm} bpm
                        </p>
                    ) : null}
                    <p style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                        Diagnóstico BLE: cabine-core/oximeter_debug.log — abra a oximetria, coloque o dedo ~20s e envie esse arquivo.
                    </p>

                    <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
                        <button type="button" className="cabine-btn pri" onClick={() => start(true)} disabled={!personId}>
                            {listening ? 'Procurando aparelho…' : 'Procurar de novo'}
                        </button>
                        <button type="button" className="cabine-btn" onClick={() => navigate(home)}>Voltar ao início</button>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
