import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { fetchPersonBloodPressure, saveBloodPressureReading, WS_PATHS } from '../../api';
import { AfterStepScreen } from '../../components/AfterStepScreen';
import { KioskBackButton } from '../../components/KioskBackButton';
import { useDeviceSocket } from '../../hooks/useDeviceSocket';
import { useKiosk } from '../../kiosk/KioskContext';
import { KioskLayout } from '../../kiosk/KioskLayout';
import { loadDeviceAddress, saveDeviceAddress } from '../../session/deviceAddress';
import { newVisitId } from '../../session/visitId';
import { findVisitMatch } from '../../session/visitScope';
import type { BloodPressureLive, BloodPressureReading } from '../../types/bloodPressure';

const GUIDE = [
    {
        title: 'Coloque no pulso',
        detail: 'A braçadeira fica no pulso, entre 13,5 e 21,5 cm, sem apertar demais.',
    },
    {
        title: 'Altura do coração',
        detail: 'Apoie o braço e deixe o pulso na altura do coração. Fique parado.',
    },
    {
        title: 'Aperte o botão',
        detail: 'A medição começa no aparelho. Esta tela só espera a leitura.',
    },
];

export function KioskWristBloodPressurePage() {
    const navigate = useNavigate();
    const { session, setLastWristBloodPressure } = useKiosk();
    const person = session.person;

    const [status, setStatus] = useState('Coloque o monitor no pulso e aperte o botão.');
    const [sys, setSys] = useState<number | null>(null);
    const [dia, setDia] = useState<number | null>(null);
    const [pulse, setPulse] = useState<number | null>(null);
    const [irregular, setIrregular] = useState(false);
    const [done, setDone] = useState(false);
    const [guideIndex, setGuideIndex] = useState(0);

    const personIdRef = useRef(person?.id ?? '');
    const savedRef = useRef(false);
    personIdRef.current = person?.id ?? '';

    const persistReading = useCallback(
        async (reading: BloodPressureLive): Promise<void> => {
            if (!person || savedRef.current) return;
            if (reading.sys_mmhg == null || reading.dia_mmhg == null || reading.pulse_bpm == null || !reading.measured_at) {
                return;
            }
            savedRef.current = true;
            const local: BloodPressureReading = {
                id: newVisitId(),
                user_id: person.id,
                device_name: reading.device_name ?? 'HEM-6161T2',
                device_address: reading.device_address ?? null,
                sys_mmhg: reading.sys_mmhg,
                dia_mmhg: reading.dia_mmhg,
                pulse_bpm: reading.pulse_bpm,
                movement: Boolean(reading.movement),
                irregular_heartbeat: Boolean(reading.irregular_heartbeat),
                measured_at: reading.measured_at,
                session_id: session.sessionId,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            setLastWristBloodPressure(local);
            setDone(true);
            try {
                const saved = await saveBloodPressureReading({
                    user_id: person.id,
                    device_name: local.device_name,
                    device_address: local.device_address,
                    sys_mmhg: local.sys_mmhg,
                    dia_mmhg: local.dia_mmhg,
                    pulse_bpm: local.pulse_bpm,
                    movement: local.movement,
                    irregular_heartbeat: local.irregular_heartbeat,
                    measured_at: local.measured_at,
                    session_id: session.sessionId,
                });
                setLastWristBloodPressure(saved);
            } catch {
                try {
                    const rows = await fetchPersonBloodPressure(person.id);
                    const match = findVisitMatch(
                        rows,
                        session.sessionId,
                        (row) => row.sys_mmhg === local.sys_mmhg
                            && row.dia_mmhg === local.dia_mmhg
                            && row.pulse_bpm === local.pulse_bpm,
                    );
                    if (match) setLastWristBloodPressure(match);
                } catch {
                    /* sessão local já gravada */
                }
            }
        },
        [person, session.sessionId, setLastWristBloodPressure],
    );

    const { connect, isActive } = useDeviceSocket<BloodPressureLive>(WS_PATHS.wristBloodPressure, {
        onOpen: (socket) => {
            socket.send(JSON.stringify({
                type: 'PERSON',
                user_id: personIdRef.current,
                session_id: session.sessionId,
            }));
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
            setIrregular(Boolean(payload.irregular_heartbeat));
            if (payload.stable) void persistReading(payload);
        },
        reconnect: { delayMs: 4000, run: () => start(true) },
    });

    const start = useCallback(
        (force = false) => {
            const pid = personIdRef.current;
            if (!pid || savedRef.current) return;
            if (!force && isActive()) return;
            const params = new URLSearchParams({ user_id: pid });
            if (session.sessionId) params.set('session_id', session.sessionId);
            const known = loadDeviceAddress('wristBloodPressure');
            if (known) params.set('address', known);
            connect(params, true);
        },
        [connect, isActive, session.sessionId],
    );

    useEffect(() => {
        if (!person?.id) return;
        start();
    }, [person?.id, start]);

    useEffect(() => {
        if (done) return;
        const id = window.setInterval(() => {
            setGuideIndex((value) => (value + 1) % GUIDE.length);
        }, 4200);
        return () => window.clearInterval(id);
    }, [done]);

    if (!person) return <Navigate to="/matricula" replace />;

    if (done) {
        return (
            <KioskLayout>
                <AfterStepScreen
                    justFinished="wristBloodPressure"
                    title="Pressão e pulso registradas"
                    description="Sistólica, diastólica e pulso foram registrados."
                    hint="Os números aparecem no relatório."
                />
            </KioskLayout>
        );
    }

    const current = GUIDE[guideIndex] ?? GUIDE[0];

    return (
        <KioskLayout>
            <div className="kiosk-center-card kiosk-oximeter-card kiosk-bp-card">
                <p className="kiosk-step-label">6 · Pressão e pulso</p>
                <h1 className="kiosk-title">{current.title}</h1>
                <p className="kiosk-oximeter-status" role="status" aria-live="polite">
                    {status}
                </p>
                <p className="kiosk-oxi-hint">{current.detail}</p>

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
                {irregular ? <p className="kiosk-bp-flags">Pulso irregular</p> : null}

                <KioskBackButton onClick={() => navigate('/menu')}>Voltar ao menu</KioskBackButton>
            </div>
        </KioskLayout>
    );
}
