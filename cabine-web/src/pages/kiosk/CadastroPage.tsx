import { type FormEvent, useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';

import { api, apiErrorMessage } from '../../api';
import { ageFromBirth } from '../../components/PersonForm';
import { useKiosk } from '../../kiosk/KioskContext';
import { KioskLayout } from '../../kiosk/KioskLayout';
import type { PersonPayload, ScalePerson } from '../../types/person';

type FormState = {
    matricula: string;
    name: string;
    birthDate: string;
    sex: string;
    heightCm: string;
};

const empty: FormState = {
    matricula: '',
    name: '',
    birthDate: '',
    sex: '',
    heightCm: '',
};

export function CadastroPage() {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const editing = params.get('edit') === '1';
    const { session, setPerson } = useKiosk();
    const [form, setForm] = useState<FormState>(empty);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (editing && session.person) {
            const person = session.person;
            setForm({
                matricula: person.matricula ?? '',
                name: person.name,
                birthDate: person.birth_date ?? '',
                sex: person.sex,
                heightCm: String(person.height_cm),
            });
        }
    }, [editing, session.person]);

    if (editing && !session.person) {
        return <Navigate to="/matricula" replace />;
    }

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        setError('');
        const height = Number(form.heightCm);
        const years = ageFromBirth(form.birthDate);
        if (!form.matricula.trim() || !form.name.trim() || !form.birthDate || !form.sex) {
            setError('Preencha todos os campos.');
            return;
        }
        if (!Number.isFinite(height) || height <= 0) {
            setError('Informe uma altura válida.');
            return;
        }
        if (years == null) {
            setError('Informe a data de nascimento.');
            return;
        }

        const payload: PersonPayload = {
            name: form.name.trim(),
            matricula: form.matricula.trim(),
            height_cm: height,
            birth_date: form.birthDate,
            age: years,
            sex: form.sex,
            people_type: 'normal',
        };

        setSaving(true);
        try {
            let person: ScalePerson;
            if (editing && session.person) {
                const { data } = await api.patch<ScalePerson>(`/people/${session.person.id}`, payload);
                person = data;
            } else {
                const { data } = await api.post<ScalePerson>('/people', payload);
                person = data;
            }
            setPerson(person);
            navigate('/menu', { replace: true });
        } catch (err) {
            setError(apiErrorMessage(err, 'Não foi possível salvar o cadastro.'));
        } finally {
            setSaving(false);
        }
    }

    return (
        <KioskLayout showUser={editing} activeSidebar={editing ? 'editar' : null}>
            <form className="kiosk-form-card" onSubmit={handleSubmit}>
                <h1 className="kiosk-title">{editing ? 'Editar cadastro' : 'Cadastro'}</h1>
                <p className="kiosk-subtitle">Preencha seus dados para continuar</p>

                <label className="kiosk-field">
                    <span>Matrícula</span>
                    <input
                        className="kiosk-input"
                        value={form.matricula}
                        onChange={(e) => setForm({ ...form, matricula: e.target.value })}
                        required
                        inputMode="numeric"
                    />
                </label>

                <label className="kiosk-field">
                    <span>Nome</span>
                    <input
                        className="kiosk-input"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        required
                    />
                </label>

                <label className="kiosk-field">
                    <span>Data de nascimento</span>
                    <input
                        className="kiosk-input"
                        type="date"
                        value={form.birthDate}
                        onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                        required
                    />
                </label>

                <fieldset className="kiosk-fieldset">
                    <legend>Gênero</legend>
                    <div className="kiosk-choice-row">
                        {[
                            { value: 'female', label: 'Feminino' },
                            { value: 'male', label: 'Masculino' },
                        ].map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                className={`kiosk-choice${form.sex === option.value ? ' selected' : ''}`}
                                onClick={() => setForm({ ...form, sex: option.value })}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </fieldset>

                <label className="kiosk-field">
                    <span>Altura (cm)</span>
                    <input
                        className="kiosk-input"
                        type="number"
                        min={50}
                        max={250}
                        step={1}
                        value={form.heightCm}
                        onChange={(e) => setForm({ ...form, heightCm: e.target.value })}
                        required
                        inputMode="decimal"
                    />
                </label>

                {error ? <p className="kiosk-error">{error}</p> : null}

                <button type="submit" className="kiosk-btn kiosk-btn-primary kiosk-btn-xl" disabled={saving}>
                    {saving ? 'Salvando...' : 'Salvar'}
                </button>

                {editing ? (
                    <button type="button" className="kiosk-back" onClick={() => navigate('/menu')}>
                        ← Voltar ao menu
                    </button>
                ) : (
                    <button type="button" className="kiosk-back" onClick={() => navigate('/matricula')}>
                        ← Voltar
                    </button>
                )}
            </form>
        </KioskLayout>
    );
}
