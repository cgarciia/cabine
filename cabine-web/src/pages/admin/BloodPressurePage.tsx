import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchPersonBloodPressure, WS_PATHS } from '../../api';
import { AppLayout } from '../../components/AppLayout';
import { HeartbeatMonitor } from '../../components/HeartbeatMonitor';
import { PersonPicker } from '../../components/PersonPicker';
import { useDeviceSocket } from '../../hooks/useDeviceSocket';
import { loadCurrentPersonId, saveCurrentPersonId } from '../../session/currentPerson';
import { loadDeviceAddress, saveDeviceAddress } from '../../session/deviceAddress';
import type { BloodPressureLive, BloodPressureReading } from '../../types/bloodPressure';
import type { ScalePerson } from '../../types/person';
import { useHem7530EcgMic } from '../../utils/hem7530EcgMic';

export function BloodPressurePage() {
    const [person, setPerson] = useState<ScalePerson | null>(null);
    const [status, setStatus] = useState('Pareado. Toque nos sensores e meça.');
    const [sys, setSys] = useState<number | null>(null);
    const [dia, setDia] = useState<number | null>(null);
    const [pulse, setPulse] = useState<number | null>(null);
    const [listening, setListening] = useState(false);
    const [history, setHistory] = useState<BloodPressureReading[]>([]);
    const personId = person?.id || loadCurrentPersonId();
    const ecg = useHem7530EcgMic(Boolean(personId));
    const personIdRef = useRef(personId);
    personIdRef.current = personId;

    const { connect, isActive } = useDeviceSocket<BloodPressureLive>(WS_PATHS.bloodPressure, {
        onOpen: (socket) => {
            socket.send(JSON.stringify({ type: 'PERSON', person_id: personIdRef.current }));
        },
        onMessage: (payload) => {
            if (payload.type === 'STATUS' && payload.msg) {
                setStatus(payload.msg);
                return;
            }
            if (payload.type !== 'BLOOD_PRESSURE') return;
            if (payload.device_address) saveDeviceAddress('bloodPressure', payload.device_address);
            if (payload.sys_mmhg != null) setSys(payload.sys_mmhg);
            if (payload.dia_mmhg != null) setDia(payload.dia_mmhg);
            if (payload.pulse_bpm != null) setPulse(payload.pulse_bpm);
        },
        reconnect: { delayMs: 4000, run: () => start(true) },
    });

    useEffect(() => {
        if (!personId) {
            setHistory([]);
            return;
        }
        fetchPersonBloodPressure(personId).then(setHistory).catch(() => setHistory([]));
    }, [personId, sys]);

    const start = useCallback((force = false) => {
        const pid = personIdRef.current;
        if (!pid) {
            setStatus('Escolha a pessoa. O Complete já está pareado neste PC.');
            return;
        }
        if (!force && isActive()) return;
        setListening(true);
        const params = new URLSearchParams({ person_id: pid });
        const known = loadDeviceAddress('bloodPressure');
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
                    <h1 style={{ margin: '8px 0 0', fontSize: '1.85rem' }}>Pressão arterial</h1>
                    <p className="cabine-oxi-prompt">
                        Este PC já está pareado com o Complete. Deixe a tela aberta, toque nos sensores e meça.
                    </p>
                    <PersonPicker
                        selectedId={personId}
                        onSelect={(next) => {
                            setPerson(next);
                            saveCurrentPersonId(next.id);
                        }}
                    />
                    <p style={{ marginTop: 16, color: '#0f766e', fontWeight: 600 }}>{status}</p>
                    <div className="cabine-oxi-vitals cabine-bp-vitals">
                        <article>
                            <p className="cabine-kicker">Sistólica</p>
                            <strong>{sys != null ? sys : '—'}</strong>
                            <span>mmHg</span>
                        </article>
                        <article>
                            <p className="cabine-kicker">Diastólica</p>
                            <strong>{dia != null ? dia : '—'}</strong>
                            <span>mmHg</span>
                        </article>
                        <article>
                            <p className="cabine-kicker">Pulso</p>
                            <strong>{pulse != null ? pulse : '—'}</strong>
                            <span>bpm</span>
                        </article>
                    </div>
                    {ecg.error ? (
                        <>
                            <p style={{ color: '#b45309', fontWeight: 700 }}>{ecg.error}</p>
                            <button type="button" className="cabine-btn cabine-btn-primary" onClick={() => void ecg.unlock()}>
                                Permitir microfone
                            </button>
                        </>
                    ) : null}
                    <HeartbeatMonitor
                        bpm={pulse}
                        active={listening || pulse != null || ecg.armed}
                        trace={ecg.samples}
                        toneLocked={ecg.toneLocked}
                    />
                    {history.length ? (
                        <ul className="cabine-bp-history">
                            {history.slice(0, 8).map((row) => (
                                <li key={row.id}>
                                    {new Date(row.measured_at).toLocaleString('pt-BR')}
                                    {' · '}
                                    {row.sys_mmhg}/{row.dia_mmhg} mmHg · {row.pulse_bpm} bpm
                                </li>
                            ))}
                        </ul>
                    ) : null}
                </div>
            </div>
        </AppLayout>
    );
}
