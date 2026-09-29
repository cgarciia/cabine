import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchPersonBloodPressure, WS_PATHS } from '../../api';
import { AppLayout } from '../../components/AppLayout';
import { PersonPicker } from '../../components/PersonPicker';
import { useDeviceSocket } from '../../hooks/useDeviceSocket';
import { loadCurrentPersonId, saveCurrentPersonId } from '../../session/currentPerson';
import { loadDeviceAddress, saveDeviceAddress } from '../../session/deviceAddress';
import type { BloodPressureLive, BloodPressureReading } from '../../types/bloodPressure';
import type { ScalePerson } from '../../types/person';
import { isWristMonitor } from '../../utils/bloodPressureKind';

export function WristBloodPressurePage() {
    const [person, setPerson] = useState<ScalePerson | null>(null);
    const [status, setStatus] = useState('Coloque o monitor no pulso e aperte o botão.');
    const [sys, setSys] = useState<number | null>(null);
    const [dia, setDia] = useState<number | null>(null);
    const [pulse, setPulse] = useState<number | null>(null);
    const [history, setHistory] = useState<BloodPressureReading[]>([]);
    const personId = person?.id || loadCurrentPersonId();
    const personIdRef = useRef(personId);
    personIdRef.current = personId;

    const { connect, isActive } = useDeviceSocket<BloodPressureLive>(WS_PATHS.wristBloodPressure, {
        onOpen: (socket) => {
            socket.send(JSON.stringify({ type: 'PERSON', person_id: personIdRef.current }));
        },
        onMessage: (payload) => {
            if (payload.type === 'STATUS' && payload.msg) {
                setStatus(payload.msg);
                return;
            }
            if (payload.type !== 'BLOOD_PRESSURE') return;
            if (payload.device_address) saveDeviceAddress('wristBloodPressure', payload.device_address);
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
        fetchPersonBloodPressure(personId)
            .then((rows) => setHistory(rows.filter((row) => isWristMonitor(row.device_name))))
            .catch(() => setHistory([]));
    }, [personId, sys]);

    const start = useCallback((force = false) => {
        const pid = personIdRef.current;
        if (!pid) {
            setStatus('Escolha a pessoa. O monitor de pulso precisa estar pareado neste PC.');
            return;
        }
        if (!force && isActive()) return;
        const params = new URLSearchParams({ person_id: pid });
        const known = loadDeviceAddress('wristBloodPressure');
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
                    <h1 style={{ margin: '8px 0 0', fontSize: '1.85rem' }}>Pressão e pulso</h1>
                    <p className="cabine-oxi-prompt">
                        Monitor de pulso HEM-6161T2. Sem ECG. Coloque no pulso, na altura do coração, e aperte o botão.
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
