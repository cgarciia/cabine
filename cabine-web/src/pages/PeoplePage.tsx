import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { api, apiErrorMessage, fetchPersonMeasurements } from '../api';
import { AppLayout } from '../components/AppLayout';
import { HistoryDialog } from '../components/HistoryDialog';
import { emptyPersonForm, PersonForm, type PersonFormValues } from '../components/PersonForm';
import type { MeasurementRecord } from '../types/measurement';
import type { PersonPayload, ScalePerson } from '../types/person';

function toPayload(values: PersonFormValues): PersonPayload {
    const height = Number(values.heightCm);
    const age = Number(values.age);
    const weight = Number(values.expectedWeight);
    return {
        name: values.name.trim(),
        height_cm: height,
        age: Number.isFinite(age) && age > 0 ? age : undefined,
        birth_date: values.birthDate || null,
        sex: values.sex,
        people_type: values.peopleType,
        expected_weight_kg: Number.isFinite(weight) && weight > 0 ? weight : null,
    };
}

function fromPerson(person: ScalePerson): PersonFormValues {
    return {
        name: person.name,
        heightCm: String(person.height_cm),
        age: String(person.age),
        birthDate: person.birth_date ?? '',
        sex: person.sex,
        peopleType: person.people_type,
        expectedWeight: person.expected_weight_kg != null ? String(person.expected_weight_kg) : '',
    };
}

export function PeoplePage() {
    const [people, setPeople] = useState<ScalePerson[]>([]);
    const [form, setForm] = useState<PersonFormValues>(emptyPersonForm);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [historyPerson, setHistoryPerson] = useState<ScalePerson | null>(null);
    const [historyRecords, setHistoryRecords] = useState<MeasurementRecord[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState('');
    const [selectedReport, setSelectedReport] = useState<MeasurementRecord | null>(null);

    async function load() {
        const { data } = await api.get<ScalePerson[]>('/people');
        setPeople(data);
    }

    useEffect(() => {
        load().catch(() => setError('Não foi possível carregar as pessoas.'));
    }, []);

    function resetForm() {
        setEditingId(null);
        setForm(emptyPersonForm);
        setError('');
    }

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        setSaving(true);
        setError('');
        try {
            const payload = toPayload(form);
            if (editingId) {
                await api.patch(`/people/${editingId}`, payload);
            } else {
                await api.post('/people', payload);
            }
            resetForm();
            await load();
        } catch (err) {
            setError(apiErrorMessage(err, 'Não foi possível salvar a pessoa.'));
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(person: ScalePerson) {
        if (!window.confirm(`Excluir "${person.name}" e o histórico de avaliações?`)) return;
        try {
            await api.delete(`/people/${person.id}`);
            if (editingId === person.id) resetForm();
            if (historyPerson?.id === person.id) setHistoryPerson(null);
            await load();
        } catch (err) {
            setError(apiErrorMessage(err, 'Não foi possível excluir.'));
        }
    }

    async function openHistory(person: ScalePerson) {
        setHistoryPerson(person);
        setSelectedReport(null);
        setHistoryRecords([]);
        setHistoryLoading(true);
        setHistoryError('');
        try {
            const data = await fetchPersonMeasurements(person.id);
            setHistoryRecords(data);
            setSelectedReport(data[0] ?? null);
        } catch (err) {
            setHistoryError(apiErrorMessage(err, 'Não foi possível carregar o histórico.'));
        } finally {
            setHistoryLoading(false);
        }
    }

    return (
        <AppLayout>
            <div className="cabine-stage">
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.2fr)',
                    gap: '1.5rem',
                    alignItems: 'start',
                }}>
                    <section className="cabine-hero">
                        <p className="cabine-kicker">Cadastro</p>
                        <h2 style={{ margin: '4px 0 8px', fontSize: '1.35rem' }}>
                            {editingId ? 'Editar pessoa' : 'Nova pessoa'}
                        </h2>
                        <p style={{ margin: '0 0 1.25rem', color: '#64748b' }}>
                            Cada avaliação aparece no histórico desta pessoa, em uma janela grande.
                        </p>
                        {error ? (
                            <p style={{ color: '#b91c1c', marginBottom: '1rem' }}>{error}</p>
                        ) : null}
                        <PersonForm
                            values={form}
                            onChange={setForm}
                            onSubmit={handleSubmit}
                            submitLabel={editingId ? 'Atualizar' : 'Cadastrar'}
                            saving={saving}
                            extraActions={editingId ? (
                                <button type="button" onClick={resetForm} style={ghostButton}>
                                    Cancelar
                                </button>
                            ) : null}
                        />
                    </section>

                    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {people.length === 0 ? (
                            <div className="cabine-hero" style={{ color: '#64748b' }}>
                                Ninguém cadastrado ainda. Adicione a primeira pessoa ao lado.
                            </div>
                        ) : people.map((person) => (
                            <article key={person.id} className="cabine-hero" style={{ padding: '1.25rem 1.5rem' }}>
                                <strong>{person.name}</strong>
                                <div style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 4 }}>
                                    {person.height_cm} cm · {person.age} anos · {person.sex === 'female' ? 'Feminino' : 'Masculino'}
                                    {person.expected_weight_kg != null ? ` · último peso ${person.expected_weight_kg} kg` : ''}
                                </div>
                                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                                    <Link
                                        to="/admin/avaliacao"
                                        className="cabine-btn cabine-btn-primary"
                                        style={{ textDecoration: 'none' }}
                                        onClick={() => window.sessionStorage.setItem('cabine-person-id', person.id)}
                                    >
                                        Avaliar
                                    </Link>
                                    <button type="button" onClick={() => { void openHistory(person); }} className="cabine-btn cabine-btn-ghost">
                                        Ver relatórios
                                    </button>
                                    <button type="button" onClick={() => { setEditingId(person.id); setForm(fromPerson(person)); }} style={ghostButton}>
                                        Editar
                                    </button>
                                    <button type="button" onClick={() => handleDelete(person)} style={{ ...ghostButton, color: '#b91c1c' }}>
                                        Excluir
                                    </button>
                                </div>
                            </article>
                        ))}
                    </section>
                </div>

                {historyPerson ? (
                    <HistoryDialog
                        person={historyPerson}
                        records={historyRecords}
                        loading={historyLoading}
                        error={historyError}
                        selected={selectedReport}
                        onSelect={setSelectedReport}
                        onClose={() => setHistoryPerson(null)}
                    />
                ) : null}
            </div>
        </AppLayout>
    );
}

const ghostButton: CSSProperties = {
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 10,
    padding: '6px 10px',
    cursor: 'pointer',
    color: '#334155',
    fontSize: '0.85rem',
};
