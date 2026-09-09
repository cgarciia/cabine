import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { api, apiErrorMessage, fetchPersonMeasurements, wsBaseUrl } from '../api';
import { AppLayout } from '../components/AppLayout';
import { BodyReport } from '../components/BodyReport';
import { HistoryDialog } from '../components/HistoryDialog';
import { emptyPersonForm, PersonForm, type PersonFormValues } from '../components/PersonForm';
import type { MeasurementPayload, MeasurementRecord, ScaleMetrics, Segmento } from '../types/measurement';
import type { ScalePerson } from '../types/person';
import type { Scale } from '../types/scale';

interface ScalePayload {
    type: string;
    step?: string;
    reset?: boolean;
    channel?: string;
    balanca_nome?: string;
    peso_kg?: number;
    timestamp?: string;
    msg?: string;
    estavel?: boolean;
    completo?: boolean;
    metricas?: ScaleMetrics;
    impedancias_ohm?: number[];
    segmentos?: Segmento[];
    weight_kg?: number;
    guest?: boolean;
    reset_memory?: boolean;
}

const BIA_GUIDE = [
    { id: 'step_on', title: 'Segure a barra e suba', detail: 'Mãos nos eletrodos antes de pisar. Pés descalços no centro.' },
    { id: 'hold_bar', title: 'Fique parado', detail: 'Polegares e palmas no metal até o peso estabilizar.' },
    { id: 'extend_bar', title: 'Braços à frente', detail: 'Estique os braços e não encoste a barra no corpo.' },
    { id: 'measuring', title: 'Lendo o corpo', detail: 'Respire normalmente. A leitura leva alguns segundos.' },
    { id: 'done', title: 'Avaliação pronta', detail: 'Confira o relatório completo ao lado.' },
] as const;

const WEIGHT_GUIDE = [
    { id: 'step_on', title: 'Suba na balança', detail: 'Pise no centro e fique parado.' },
    { id: 'hold_bar', title: 'Aguardando o peso', detail: 'Não se mexa enquanto o número estabiliza.' },
    { id: 'extend_bar', title: 'Quase lá', detail: 'Mantenha-se parado.' },
    { id: 'measuring', title: 'Confirmando', detail: 'O peso está sendo confirmado.' },
    { id: 'done', title: 'Pronto', detail: 'Peso registrado no relatório.' },
] as const;

function stepIndex(guide: readonly { id: string }[], step: string) {
    const mapped = step === 'wait_stable' ? 'step_on' : step;
    const idx = guide.findIndex((item) => item.id === mapped);
    return idx >= 0 ? idx : 0;
}

function canAdvanceStep(guide: readonly { id: string }[], current: string, next: string) {
    return stepIndex(guide, next) >= stepIndex(guide, current);
}

function friendlyStatus(raw: string, ready: boolean) {
    const text = raw.toLowerCase();
    if (text.includes('desconectado') || text.includes('erro') || text.includes('falha')) {
        return raw;
    }
    if (text.includes('completa')) return 'Avaliação concluída';
    if (text.includes('tempo real') || text.includes('monitoramento')) return 'Lendo a balança';
    if (ready) return 'Balança pronta. Pode subir.';
    if (text.includes('conect') || text.includes('iniciando') || text.includes('aguardando')) {
        return 'Preparando a balança...';
    }
    return 'Balança pronta. Pode subir.';
}

export const ScalePage = () => {
    const [scales, setScales] = useState<Scale[]>([]);
    const [people, setPeople] = useState<ScalePerson[]>([]);
    const [selectedId, setSelectedId] = useState('');
    const [selectedPersonId, setSelectedPersonId] = useState('');
    const [pickerOpen, setPickerOpen] = useState(false);
    const [addingPerson, setAddingPerson] = useState(false);
    const [newPerson, setNewPerson] = useState<PersonFormValues>(emptyPersonForm);
    const [savingReport, setSavingReport] = useState(false);
    const [saveMsg, setSaveMsg] = useState('');
    const [reportSaved, setReportSaved] = useState(false);
    const [view, setView] = useState<'ready' | 'live' | 'report'>('ready');
    const [heightCm, setHeightCm] = useState('170');
    const [age, setAge] = useState('21');
    const [birthDate, setBirthDate] = useState('');
    const [sex, setSex] = useState('male');
    const [peopleType, setPeopleType] = useState('normal');
    const [expectedWeight, setExpectedWeight] = useState('');
    const [reconnectKey, setReconnectKey] = useState(0);
    const [currentWeight, setCurrentWeight] = useState<number | null>(null);
    const [stable, setStable] = useState(false);
    const [complete, setComplete] = useState(false);
    const [metrics, setMetrics] = useState<ScaleMetrics | null>(null);
    const [segments, setSegments] = useState<Segmento[]>([]);
    const [impedanciasOhm, setImpedanciasOhm] = useState<number[]>([]);
    const [scaleName, setScaleName] = useState('Balança');
    const [status, setStatus] = useState('Escolha quem vai se avaliar');
    const [guideStep, setGuideStep] = useState('step_on');
    const [guideMsg, setGuideMsg] = useState(BIA_GUIDE[0].detail);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyRecords, setHistoryRecords] = useState<MeasurementRecord[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState('');
    const [selectedHistory, setSelectedHistory] = useState<MeasurementRecord | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const savedKeyRef = useRef('');
    const liveStartedRef = useRef(false);
    const finishedRef = useRef(false);
    const savingRef = useRef(false);
    const lastReadingRef = useRef<{
        peso_kg: number;
        estavel: boolean;
        completo: boolean;
        metricas?: ScaleMetrics | null;
        impedancias_ohm?: number[];
        segmentos?: Segmento[];
        balanca_nome?: string;
    } | null>(null);

    const selected = scales.find((item) => item.id === selectedId);
    const supportsBia = selected?.adapter === 'ble_icomon';
    const guide = supportsBia ? BIA_GUIDE : WEIGHT_GUIDE;
    const selectedPerson = people.find((item) => item.id === selectedPersonId);
    const selectedPersonName = selectedPerson?.name ?? '';
    const scalesRef = useRef(scales);
    scalesRef.current = scales;
    const snapshotRef = useRef({
        selectedPersonId,
        selectedId,
        adapter: selected?.adapter ?? '',
        scaleName,
        heightCm,
        age,
        birthDate,
        sex,
        peopleType,
        expectedWeight,
        displayName: selectedPersonName,
        supportsBia,
    });
    snapshotRef.current = {
        selectedPersonId,
        selectedId,
        adapter: selected?.adapter ?? '',
        scaleName,
        heightCm,
        age,
        birthDate,
        sex,
        peopleType,
        expectedWeight,
        displayName: selectedPersonName,
        supportsBia,
    };
    const profileRef = useRef({
        heightCm, age, sex, birthDate, peopleType, expectedWeight, displayName: selectedPersonName,
    });
    profileRef.current = {
        heightCm, age, sex, birthDate, peopleType, expectedWeight, displayName: selectedPersonName,
    };

    const persistMeasurement = useCallback(async (reading: {
        peso_kg: number;
        estavel: boolean;
        completo: boolean;
        metricas?: ScaleMetrics | null;
        impedancias_ohm?: number[];
        segmentos?: Segmento[];
        balanca_nome?: string;
    }) => {
        const session = snapshotRef.current;
        if (!session.selectedPersonId || reading.peso_kg <= 0) return;
        const years = Number(session.age);
        const height = Number(session.heightCm);
        if (!Number.isFinite(height) || height <= 0 || !Number.isFinite(years) || years <= 0) {
            setSaveMsg('Não foi possível salvar: conferir altura e idade da pessoa.');
            return;
        }
        const key = `${session.selectedPersonId}:${reading.peso_kg.toFixed(2)}:${reading.completo}`;
        if (savedKeyRef.current === key || savingRef.current) return;
        savingRef.current = true;
        setSavingReport(true);
        setSaveMsg('');
        const payload: MeasurementPayload = {
            person_id: session.selectedPersonId,
            scale_id: session.selectedId || null,
            scale_name: reading.balanca_nome || session.scaleName || 'Balança',
            adapter: session.adapter || 'ble_icomon',
            peso_kg: reading.peso_kg,
            height_cm: height,
            age: years,
            birth_date: session.birthDate || null,
            sex: session.sex,
            people_type: session.peopleType,
            expected_weight_kg: reading.peso_kg,
            estavel: reading.estavel,
            completo: reading.completo,
            impedancias_ohm: session.supportsBia ? (reading.impedancias_ohm ?? null) : null,
            segmentos: session.supportsBia ? (reading.segmentos ?? null) : null,
            metricas: reading.metricas ?? null,
        };
        try {
            await api.post('/measurements', JSON.parse(JSON.stringify(payload)));
            savedKeyRef.current = key;
            setReportSaved(true);
            setExpectedWeight(String(reading.peso_kg));
            setSaveMsg('Relatório salvo no histórico.');
            const { data } = await api.get<ScalePerson[]>('/people');
            setPeople(data);
        } catch (err) {
            console.error('Falha ao salvar medição', err);
            setSaveMsg(apiErrorMessage(err, 'Não foi possível salvar o relatório.'));
        } finally {
            savingRef.current = false;
            setSavingReport(false);
        }
    }, []);

    const persistRef = useRef(persistMeasurement);
    persistRef.current = persistMeasurement;

    const sendProfile = useCallback((apply: boolean) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        const profile = profileRef.current;
        const height = Number(profile.heightCm);
        const years = Number(profile.age);
        const weight = Number(profile.expectedWeight);
        if (!Number.isFinite(height) || height <= 0 || !profile.sex) return;
        ws.send(JSON.stringify({
            type: 'PROFILE',
            apply,
            person_id: snapshotRef.current.selectedPersonId || undefined,
            height_cm: height,
            age: Number.isFinite(years) && years > 0 ? years : undefined,
            sex: profile.sex,
            birth_date: profile.birthDate || undefined,
            people_type: profile.peopleType,
            expected_weight_kg: Number.isFinite(weight) && weight > 0 ? weight : undefined,
            display_name: profile.displayName || undefined,
        }));
    }, []);

    const applyPerson = useCallback((person: ScalePerson) => {
        window.sessionStorage.setItem('cabine-person-id', person.id);
        setSelectedPersonId(person.id);
        setHeightCm(String(person.height_cm));
        setAge(String(person.age));
        setBirthDate(person.birth_date ?? '');
        setSex(person.sex);
        setPeopleType(person.people_type);
        setExpectedWeight(person.expected_weight_kg != null ? String(person.expected_weight_kg) : '');
        setPickerOpen(false);
        setAddingPerson(false);
        setSaveMsg('');
        setView('ready');
    }, []);

    useEffect(() => {
        sendProfile(false);
    }, [heightCm, age, sex, birthDate, peopleType, expectedWeight, selectedPersonName, sendProfile]);

    useEffect(() => {
        const remembered = window.sessionStorage.getItem('cabine-person-id');
        api.get<Scale[]>('/scales').then(({ data }) => {
            setScales(data);
            const preferred = data.find((item) => item.is_default && item.is_active)
                ?? data.find((item) => item.is_active)
                ?? data[0];
            if (preferred) setSelectedId(preferred.id);
        }).catch(() => {
            setStatus('Não foi possível carregar as balanças cadastradas.');
        });
        api.get<ScalePerson[]>('/people').then(({ data }) => {
            setPeople(data);
            const rememberedPerson = data.find((item) => item.id === remembered);
            if (rememberedPerson) applyPerson(rememberedPerson);
        }).catch(() => {
            setStatus('Não foi possível carregar as pessoas.');
        });
    }, [applyPerson]);

    useEffect(() => {
        if (scales.length > 0 && !selectedPersonId) setPickerOpen(true);
    }, [scales.length, selectedPersonId]);

    useEffect(() => {
        if (!selectedId || !selectedPersonId) return;

        const selectedScale = scalesRef.current.find((item) => item.id === selectedId);
        if (selectedScale) setScaleName(selectedScale.name);

        setCurrentWeight(null);
        setStable(false);
        setComplete(false);
        setMetrics(null);
        setSegments([]);
        setImpedanciasOhm([]);
        setGuideStep('step_on');
        setGuideMsg((selectedScale?.adapter === 'ble_icomon' ? BIA_GUIDE : WEIGHT_GUIDE)[0].detail);
        setView('ready');
        setReportSaved(false);
        savedKeyRef.current = '';
        liveStartedRef.current = false;
        finishedRef.current = false;
        lastReadingRef.current = null;
        setStatus('Preparando a balança...');

        const wsUrl = wsBaseUrl();
        const profile = profileRef.current;
        const params = new URLSearchParams({
            scale_id: selectedId,
            height_cm: profile.heightCm,
            age: profile.age,
            sex: profile.sex,
            people_type: profile.peopleType,
        });
        if (profile.birthDate) params.set('birth_date', profile.birthDate);
        if (profile.expectedWeight) params.set('expected_weight_kg', profile.expectedWeight);
        if (profile.displayName) params.set('display_name', profile.displayName);
        if (selectedPersonId) params.set('person_id', selectedPersonId);
        const ws = new WebSocket(`${wsUrl}/ws/scale?${params.toString()}`);
        wsRef.current = ws;

        ws.onopen = () => {
            setStatus('Balança pronta. Pode subir.');
            sendProfile(true);
        };
        ws.onerror = () => setStatus('Não foi possível falar com a balança.');
        ws.onclose = () => setStatus('Desconectado do servidor');

        ws.onmessage = (event) => {
            const data: ScalePayload = JSON.parse(event.data);
            const bia = scalesRef.current.find((item) => item.id === selectedId)?.adapter === 'ble_icomon';
            const activeGuide = bia ? BIA_GUIDE : WEIGHT_GUIDE;

            if (finishedRef.current) return;

            if (data.type === 'STATUS' && data.msg) {
                setStatus(data.msg);
            } else if (data.type === 'STEP' && data.step) {
                if (data.reset) {
                    const last = lastReadingRef.current;
                    if (last && last.peso_kg >= 10) {
                        finishedRef.current = true;
                        setCurrentWeight(last.peso_kg);
                        setStable(last.estavel);
                        setComplete(last.completo);
                        setMetrics(last.metricas ?? null);
                        setSegments(last.segmentos ?? []);
                        setImpedanciasOhm(last.impedancias_ohm ?? []);
                        setGuideStep('done');
                        setGuideMsg(activeGuide[activeGuide.length - 1].detail);
                        setStatus('Avaliação concluída');
                        setView('report');
                        void persistRef.current(last);
                        return;
                    }
                    setComplete(false);
                    setMetrics(null);
                    setSegments([]);
                    setImpedanciasOhm([]);
                    setStable(false);
                    setCurrentWeight(null);
                    setGuideStep(data.step);
                    setGuideMsg(data.msg ?? activeGuide[0].detail);
                    setView('ready');
                    liveStartedRef.current = false;
                } else {
                    setGuideStep((prev) => (canAdvanceStep(activeGuide, prev, data.step!) ? data.step! : prev));
                    if (data.msg) setGuideMsg(data.msg);
                    if (data.step === 'done') setComplete(true);
                }
            } else if (data.type === 'PESO_RECEBIDO' && data.peso_kg !== undefined) {
                if (!liveStartedRef.current) {
                    liveStartedRef.current = true;
                    setView('live');
                }
                lastReadingRef.current = {
                    peso_kg: data.peso_kg,
                    estavel: Boolean(data.estavel),
                    completo: Boolean(data.completo),
                    metricas: data.metricas ?? null,
                    impedancias_ohm: data.impedancias_ohm,
                    segmentos: data.segmentos,
                    balanca_nome: data.balanca_nome,
                };
                if (data.completo) {
                    finishedRef.current = true;
                    setGuideStep('done');
                    setGuideMsg(activeGuide[activeGuide.length - 1].detail);
                    setStatus('Avaliação concluída');
                    setCurrentWeight(data.peso_kg);
                    setStable(true);
                    setComplete(true);
                    setMetrics(data.metricas ?? null);
                    setSegments(bia ? (data.segmentos ?? []) : []);
                    setImpedanciasOhm(bia ? (data.impedancias_ohm ?? []) : []);
                    if (data.balanca_nome) setScaleName(data.balanca_nome);
                    setView('report');
                    void persistRef.current({
                        peso_kg: data.peso_kg,
                        estavel: true,
                        completo: true,
                        metricas: data.metricas ?? null,
                        impedancias_ohm: data.impedancias_ohm,
                        segmentos: data.segmentos,
                        balanca_nome: data.balanca_nome,
                    });
                    return;
                }
                setStatus('Lendo a balança');
                setCurrentWeight(data.peso_kg);
                setStable(Boolean(data.estavel));
                setMetrics(data.metricas ?? null);
                if (bia && data.segmentos?.length) setSegments(data.segmentos);
                if (bia && data.impedancias_ohm?.length) setImpedanciasOhm(data.impedancias_ohm);
                if (data.balanca_nome) setScaleName(data.balanca_nome);
            }
        };

        return () => {
            const last = lastReadingRef.current;
            if (last && last.peso_kg >= 10) {
                void persistRef.current(last);
            }
            ws.close();
        };
    }, [selectedId, selectedPersonId, reconnectKey, sendProfile]);

    const activeGuide = stepIndex(guide, guideStep);
    const currentGuide = guide[activeGuide] ?? guide[0];
    const weightOnlyResult = supportsBia && view === 'report' && !complete;
    const readyLabel = friendlyStatus(status, view === 'ready');

    async function handleAddPerson(event: FormEvent) {
        event.preventDefault();
        try {
            const height = Number(newPerson.heightCm);
            const years = Number(newPerson.age);
            const weight = Number(newPerson.expectedWeight);
            const { data } = await api.post<ScalePerson>('/people', {
                name: newPerson.name.trim(),
                height_cm: height,
                age: Number.isFinite(years) && years > 0 ? years : undefined,
                birth_date: newPerson.birthDate || null,
                sex: newPerson.sex,
                people_type: newPerson.peopleType,
                expected_weight_kg: Number.isFinite(weight) && weight > 0 ? weight : null,
            });
            setPeople((current) => [...current, data].sort((a, b) => a.name.localeCompare(b.name)));
            applyPerson(data);
            setNewPerson(emptyPersonForm);
        } catch (err) {
            setStatus(apiErrorMessage(err, 'Não foi possível cadastrar a pessoa.'));
        }
    }

    function startNewSession() {
        setView('ready');
        setComplete(false);
        setMetrics(null);
        setSegments([]);
        setImpedanciasOhm([]);
        setCurrentWeight(null);
        setGuideStep('step_on');
        setGuideMsg(guide[0].detail);
        setReportSaved(false);
        savedKeyRef.current = '';
        liveStartedRef.current = false;
        finishedRef.current = false;
        lastReadingRef.current = null;
        setSaveMsg('');
        setReconnectKey((value) => value + 1);
    }

    async function openHistory() {
        if (!selectedPersonId) return;
        setHistoryOpen(true);
        setHistoryLoading(true);
        setHistoryError('');
        try {
            const data = await fetchPersonMeasurements(selectedPersonId);
            setHistoryRecords(data);
            setSelectedHistory(data[0] ?? null);
        } catch (err) {
            setHistoryError(apiErrorMessage(err, 'Não foi possível carregar o histórico.'));
        } finally {
            setHistoryLoading(false);
        }
    }

    return (
        <AppLayout>
            <div className="cabine-stage">
                {scales.length === 0 ? (
                    <div className="cabine-hero">
                        <p className="cabine-kicker">Configuração</p>
                        <h1 style={{ margin: '8px 0', fontSize: '1.8rem' }}>Nenhuma balança cadastrada</h1>
                        <p style={{ color: '#64748b' }}>
                            Cadastre o equipamento para iniciar as avaliações.{' '}
                            <Link to="/balancas">Ir para balanças</Link>
                        </p>
                    </div>
                ) : (
                    <div className="cabine-hero">
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                            <div>
                                <p className="cabine-kicker">{supportsBia ? 'Composição corporal' : 'Pesagem'}</p>
                                <h1 style={{ margin: '6px 0 0', fontSize: '1.7rem' }}>
                                    Pode subir quando quiser
                                </h1>
                                <p style={{ margin: '6px 0 0', color: '#64748b', maxWidth: 520 }}>
                                    {supportsBia
                                        ? 'A avaliação começa sozinha quando você pisar na balança, já com a barra nas mãos.'
                                        : 'A avaliação começa sozinha quando você pisar na balança.'}
                                </p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', padding: '8px 14px', borderRadius: 999, height: 'fit-content', border: '1px solid #e2e8f0' }}>
                                {view === 'live' ? <span className="cabine-live-dot" /> : <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#94a3b8' }} />}
                                <span style={{ fontSize: '0.9rem', color: '#334155', fontWeight: 600 }}>{readyLabel}</span>
                            </div>
                        </div>

                        <div className="no-print" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr auto', gap: 12, marginTop: 20, alignItems: 'end' }}>
                            <button type="button" className="cabine-person-chip" onClick={() => { setPickerOpen(true); setAddingPerson(false); }}>
                                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>QUEM ESTÁ NA CABINE</div>
                                <div style={{ fontSize: '1.1rem', fontWeight: 800, marginTop: 2 }}>
                                    {selectedPerson ? selectedPerson.name : 'Escolher pessoa'}
                                </div>
                                {selectedPerson ? (
                                    <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 2 }}>
                                        {heightCm} cm · {age} anos · {sex === 'female' ? 'Feminino' : 'Masculino'}
                                    </div>
                                ) : null}
                            </button>
                            <label style={{ color: '#475569', fontSize: '0.8rem' }}>
                                Equipamento
                                <select className="cabine-select" value={selectedId} onChange={(event) => setSelectedId(event.target.value)} style={{ marginTop: 6 }}>
                                    {scales.map((scale) => (
                                        <option key={scale.id} value={scale.id}>
                                            {scale.name}{scale.is_default ? ' (principal)' : ''}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <button
                                type="button"
                                className="cabine-btn cabine-btn-ghost"
                                disabled={!selectedPersonId}
                                onClick={() => { void openHistory(); }}
                                style={{ height: 52, whiteSpace: 'nowrap' }}
                            >
                                Histórico
                            </button>
                        </div>

                        <div style={{ textAlign: 'center', marginTop: 28 }}>
                            <div className="cabine-weight" style={{ color: currentWeight != null ? '#0f172a' : '#cbd5e1' }}>
                                {currentWeight != null ? currentWeight.toFixed(1) : '--.-'}
                                <span style={{ fontSize: '1.6rem', color: '#64748b', marginLeft: 8 }}>kg</span>
                            </div>
                            <p style={{ color: '#94a3b8', marginTop: 8 }}>
                                {view === 'ready' ? 'Aguardando você subir' : stable ? 'Peso estável' : 'Ajustando a leitura'}
                            </p>
                        </div>

                        <div className="cabine-steps no-print">
                            {guide.slice(0, 4).map((item, index) => (
                                <div
                                    key={item.id}
                                    className={`cabine-step${index === activeGuide && view === 'live' ? ' active' : ''}${index < activeGuide ? ' done' : ''}`}
                                >
                                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0f766e' }}>0{index + 1}</div>
                                    <div style={{ fontWeight: 700, marginTop: 4 }}>{item.title}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {pickerOpen ? (
                <div className="cabine-overlay no-print" onClick={() => selectedPersonId && setPickerOpen(false)}>
                    <div className="cabine-modal" onClick={(event) => event.stopPropagation()}>
                        <h2 style={{ margin: '0 0 8px', fontSize: '1.4rem', color: '#0f172a' }}>Quem vai se avaliar?</h2>
                        <p style={{ margin: '0 0 1rem', color: '#64748b' }}>
                            Escolha a pessoa. Depois, basta pisar na balança — a leitura começa sozinha.
                        </p>
                        {addingPerson ? (
                            <PersonForm
                                values={newPerson}
                                onChange={setNewPerson}
                                onSubmit={handleAddPerson}
                                submitLabel="Salvar e usar"
                                extraActions={(
                                    <button type="button" className="cabine-btn cabine-btn-ghost" onClick={() => setAddingPerson(false)}>
                                        Voltar
                                    </button>
                                )}
                            />
                        ) : (
                            <>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflow: 'auto' }}>
                                    {people.length === 0 ? (
                                        <p style={{ color: '#64748b' }}>Ninguém cadastrado ainda.</p>
                                    ) : people.map((person) => (
                                        <button
                                            key={person.id}
                                            type="button"
                                            onClick={() => applyPerson(person)}
                                            className="cabine-person-chip"
                                            style={{
                                                background: person.id === selectedPersonId ? '#ecfdf5' : '#f8fafc',
                                                borderColor: person.id === selectedPersonId ? '#99f6e4' : '#e2e8f0',
                                            }}
                                        >
                                            <div style={{ fontWeight: 700 }}>{person.name}</div>
                                            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2 }}>
                                                {person.height_cm} cm · {person.age} anos
                                                {person.expected_weight_kg != null ? ` · ${person.expected_weight_kg} kg` : ''}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    className="cabine-btn cabine-btn-primary"
                                    onClick={() => { setAddingPerson(true); setNewPerson(emptyPersonForm); }}
                                    style={{ marginTop: 14, width: '100%' }}
                                >
                                    Adicionar pessoa
                                </button>
                                <Link to="/pessoas" style={{ display: 'block', marginTop: 10, textAlign: 'center', color: '#0f766e' }}>
                                    Ver cadastro completo
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            ) : null}

            {view === 'live' && !pickerOpen ? (
                <div className="cabine-overlay no-print">
                    <div className="cabine-dialog cabine-coach">
                        <div style={{ color: '#64748b', fontWeight: 700, letterSpacing: '0.08em', fontSize: '0.8rem' }}>
                            {selectedPersonName || 'Avaliação'} · PASSO {activeGuide + 1} DE {guide.length}
                        </div>
                        <div className="cabine-weight" style={{ color: currentWeight != null ? '#0f172a' : '#cbd5e1', margin: '1.25rem 0 0.25rem' }}>
                            {currentWeight != null ? currentWeight.toFixed(1) : '--.-'}
                            <span style={{ fontSize: '1.8rem', color: '#64748b', marginLeft: 8 }}>kg</span>
                        </div>
                        <h2 style={{ margin: '1rem 0 0.5rem', fontSize: '2.1rem', color: '#0f172a', lineHeight: 1.15 }}>
                            {currentGuide.title}
                        </h2>
                        <p style={{ margin: 0, fontSize: '1.25rem', color: '#334155', lineHeight: 1.45 }}>
                            {guideMsg || currentGuide.detail}
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 28 }}>
                            {guide.map((item, index) => (
                                <span
                                    key={item.id}
                                    style={{
                                        width: index === activeGuide ? 28 : 10,
                                        height: 10,
                                        borderRadius: 999,
                                        background: index < activeGuide ? '#10B981' : index === activeGuide ? '#0f766e' : '#E2E8F0',
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            ) : null}

            {view === 'report' ? (
                <div className="cabine-overlay">
                    <div className="cabine-dialog" onClick={(event) => event.stopPropagation()}>
                        <BodyReport
                            personName={selectedPersonName}
                            scaleName={scaleName}
                            heightCm={heightCm}
                            age={age}
                            sex={sex}
                            peopleType={peopleType}
                            pesoKg={currentWeight}
                            metrics={metrics}
                            supportsBia={supportsBia}
                            weightOnly={weightOnlyResult}
                            saved={reportSaved}
                            segmentos={segments}
                        />
                        <div className="no-print" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
                            <button type="button" className="cabine-btn cabine-btn-primary" onClick={() => window.print()}>
                                Imprimir
                            </button>
                            <button type="button" className="cabine-btn cabine-btn-ghost" onClick={() => { void openHistory(); }}>
                                Ver histórico
                            </button>
                            <button type="button" className="cabine-btn cabine-btn-ghost" onClick={startNewSession}>
                                Nova avaliação
                            </button>
                            {savingReport ? <span style={{ color: '#64748b', alignSelf: 'center' }}>Salvando relatório...</span> : null}
                            {saveMsg && !reportSaved ? (
                                <span style={{ color: '#b91c1c', alignSelf: 'center' }}>{saveMsg}</span>
                            ) : null}
                        </div>
                    </div>
                </div>
            ) : null}

            {historyOpen && selectedPerson ? (
                <HistoryDialog
                    person={selectedPerson}
                    records={historyRecords}
                    loading={historyLoading}
                    error={historyError}
                    selected={selectedHistory}
                    onSelect={setSelectedHistory}
                    onClose={() => setHistoryOpen(false)}
                />
            ) : null}
        </AppLayout>
    );
};
