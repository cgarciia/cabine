import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { oximeterAdvice } from '../../advice/patientAdvice';
import { fetchPersonOximeter, WS_PATHS } from '../../api';
import { AppLayout } from '../../components/AppLayout';
import { OximeterPulseGraph } from '../../components/OximeterPulseGraph';
import { PersonPicker } from '../../components/PersonPicker';
import { useDeviceSocket } from '../../hooks/useDeviceSocket';
import { loadCurrentPersonId, saveCurrentPersonId } from '../../session/currentPerson';
import { loadDeviceAddress, saveDeviceAddress } from '../../session/deviceAddress';
import type { OximeterLive, OximeterReading } from '../../types/oximeter';
import type { ScalePerson } from '../../types/person';

const SEARCHING = 'Procurando o oxímetro… coloque o dedo no sensor.';

export function OximeterPage() {
    const navigate = useNavigate();
    const [person, setPerson] = useState<ScalePerson | null>(null);
    const [status, setStatus] = useState(SEARCHING);
    const [spo2, setSpo2] = useState<number | null>(null);
    const [pulse, setPulse] = useState<number | null>(null);
    const [fingerOn, setFingerOn] = useState(false);
    const [stable, setStable] = useState(false);
    const [listening, setListening] = useState(false);
    const [wave, setWave] = useState<number[]>([]);
    const [history, setHistory] = useState<OximeterReading[]>([]);
    const [session, setSession] = useState(0);
    const personId = person?.id || loadCurrentPersonId();
    const personIdRef = useRef(personId);
    personIdRef.current = personId;

    const { connect, isActive } = useDeviceSocket<OximeterLive>(WS_PATHS.oximeter, {
        onMessage: (payload) => {
            if (payload.type === 'STATUS' && payload.msg) {
                setStatus(payload.msg);
                return;
            }
            if (payload.type !== 'OXIMETER') return;
            if (payload.device_address) saveDeviceAddress('oximeter', payload.device_address);
            if (payload.waveform?.length) setWave(payload.waveform);
            if (payload.spo2_pct != null) setSpo2(payload.spo2_pct);
            if (payload.pulse_bpm != null) setPulse(payload.pulse_bpm);
            if (payload.finger_on != null) setFingerOn(Boolean(payload.finger_on));
            if (payload.stable != null) setStable(Boolean(payload.stable));
            if (payload.finger_on && payload.spo2_pct && payload.pulse_bpm) {
                setStatus(payload.stable ? 'Leitura gravada. Pode manter o dedo para acompanhar o pulso.' : 'Lendo... mantenha o dedo parado.');
            }
        },
        onDrop: () => {
            setListening(false);
            setFingerOn(false);
            setStatus(SEARCHING);
        },
        reconnect: { delayMs: 2500, run: () => start(true) },
    });

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
        if (!force && isActive()) return;
        saveCurrentPersonId(pid);
        setSpo2(null);
        setPulse(null);
        setStable(false);
        setFingerOn(false);
        setWave([]);
        setSession((value) => value + 1);
        setListening(true);
        setStatus(SEARCHING);

        const params = new URLSearchParams({ person_id: pid });
        const known = loadDeviceAddress('oximeter');
        if (known) params.set('address', known);
        connect(params, true);
    }, [connect, isActive]);

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

                    <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
                        <button type="button" className="cabine-btn pri" onClick={() => start(true)} disabled={!personId}>
                            {listening ? 'Procurando aparelho…' : 'Procurar de novo'}
                        </button>
                        <button type="button" className="cabine-btn" onClick={() => navigate('/admin/avaliacao')}>
                            Voltar
                        </button>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
