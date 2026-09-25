import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';

import { apiErrorMessage, createPerson, loginByRegistration, updatePerson } from '../../api';
import { KioskBackButton } from '../../components/KioskBackButton';
import { KioskKeyboard } from '../../components/KioskKeyboard';
import { KioskNumpad } from '../../components/KioskNumpad';
import { ageFromBirth } from '../../components/PersonForm';
import { useKiosk } from '../../kiosk/KioskContext';
import { KioskLayout } from '../../kiosk/KioskLayout';
import { getAccessTokenTyp, saveAccessSession } from '../../session/authSession';
import type { PersonPayload, ScalePerson } from '../../types/person';
import { digitsToIsoDate, formatBirthDigits, isoToBirthDigits } from '../../utils/kioskDate';

type FormState = {
    employeeId: string;
    name: string;
    birthDate: string;
    sex: string;
    heightCm: string;
};

type WizardStep = 'registration' | 'name' | 'birthDate' | 'sex' | 'height';

const empty: FormState = {
    employeeId: '',
    name: '',
    birthDate: '',
    sex: '',
    heightCm: '',
};

export function RegistrationPage() {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const editing = params.get('edit') === '1';
    const prefillRegistration = (params.get('registration') ?? params.get('matricula') ?? '').trim();
    const skipRegistration = Boolean(!editing && prefillRegistration);
    const { session, setPerson, beginVisit } = useKiosk();
    const [form, setForm] = useState<FormState>(() => (
        prefillRegistration ? { ...empty, employeeId: prefillRegistration } : empty
    ));
    const [birthDigits, setBirthDigits] = useState('');
    const [step, setStep] = useState<WizardStep>(skipRegistration ? 'name' : 'registration');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    const steps = useMemo<WizardStep[]>(() => (
        skipRegistration
            ? ['name', 'birthDate', 'sex', 'height']
            : ['registration', 'name', 'birthDate', 'sex', 'height']
    ), [skipRegistration]);

    useEffect(() => {
        if (editing && session.person) {
            const person = session.person;
            setForm({
                employeeId: person.registration ?? '',
                name: person.name,
                birthDate: person.birth_date ?? '',
                sex: person.sex,
                heightCm: person.height_cm != null ? String(Math.round(person.height_cm)) : '',
            });
            setBirthDigits(isoToBirthDigits(person.birth_date ?? ''));
            return;
        }
        if (!editing && prefillRegistration) {
            setForm((prev) => (
                prev.employeeId === prefillRegistration
                    ? prev
                    : { ...prev, employeeId: prefillRegistration }
            ));
        }
    }, [editing, session.person, prefillRegistration]);

    if (editing && (!session.person || getAccessTokenTyp() !== 'person')) {
        return <Navigate to="/matricula" replace />;
    }

    const stepIndex = Math.max(0, steps.indexOf(step));

    function goBack() {
        setError('');
        if (stepIndex <= 0) {
            navigate(editing ? '/menu' : '/matricula');
            return;
        }
        setStep(steps[stepIndex - 1]);
    }

    function goNext() {
        const next = steps[stepIndex + 1];
        if (next) setStep(next);
    }

    function appendDigit(digit: string) {
        setError('');
        if (step === 'registration') {
            setForm((prev) => (
                prev.employeeId.length >= 40 ? prev : { ...prev, employeeId: `${prev.employeeId}${digit}` }
            ));
            return;
        }
        if (step === 'birthDate') {
            setBirthDigits((prev) => (prev.length >= 8 ? prev : `${prev}${digit}`));
            return;
        }
        if (step === 'height') {
            setForm((prev) => {
                const next = `${prev.heightCm}${digit}`.replace(/^0+(?=\d)/, '').slice(0, 3);
                return { ...prev, heightCm: next };
            });
        }
    }

    function backspace() {
        setError('');
        if (step === 'registration') {
            setForm((prev) => ({ ...prev, employeeId: prev.employeeId.slice(0, -1) }));
            return;
        }
        if (step === 'birthDate') {
            setBirthDigits((prev) => prev.slice(0, -1));
            return;
        }
        if (step === 'height') {
            setForm((prev) => ({ ...prev, heightCm: prev.heightCm.slice(0, -1) }));
        }
    }

    function appendName(char: string) {
        setError('');
        setForm((prev) => {
            if (prev.name.length >= 120) return prev;
            const nextChar = char === ' ' && prev.name.endsWith(' ') ? '' : char;
            if (!nextChar) return prev;
            return { ...prev, name: `${prev.name}${nextChar}` };
        });
    }

    function backspaceName() {
        setError('');
        setForm((prev) => ({ ...prev, name: prev.name.slice(0, -1) }));
    }

    function continueStep() {
        if (step === 'registration') {
            if (!form.employeeId.trim()) {
                setError('Informe a matrícula.');
                return;
            }
            setError('');
            goNext();
            return;
        }
        if (step === 'name') {
            if (form.name.trim().length < 2) {
                setError('Informe o nome completo.');
                return;
            }
            setError('');
            goNext();
            return;
        }
        if (step === 'birthDate') {
            const iso = digitsToIsoDate(birthDigits);
            if (!iso) {
                setError('Informe uma data de nascimento válida.');
                return;
            }
            setForm((prev) => ({ ...prev, birthDate: iso }));
            setError('');
            goNext();
            return;
        }
        if (step === 'sex') {
            if (!form.sex) {
                setError('Escolha o gênero.');
                return;
            }
            setError('');
            goNext();
        }
    }

    async function save() {
        const height = Number(form.heightCm);
        const iso = form.birthDate || digitsToIsoDate(birthDigits);
        const years = iso ? ageFromBirth(iso) : null;
        if (!form.employeeId.trim() || !form.name.trim() || !iso || !form.sex) {
            setError('Preencha todos os campos.');
            return;
        }
        if (!Number.isFinite(height) || height < 50 || height > 250) {
            setError('Informe uma altura entre 50 e 250 cm.');
            return;
        }
        if (years == null) {
            setError('Informe a data de nascimento.');
            return;
        }

        const payload: PersonPayload = {
            name: form.name.trim(),
            registration: form.employeeId.trim(),
            height_cm: height,
            birth_date: iso,
            age: years,
            sex: form.sex,
            people_type: 'normal',
        };

        setSaving(true);
        setError('');
        try {
            let person: ScalePerson;
            if (editing && session.person) {
                person = await updatePerson(session.person.id, payload);
            } else {
                const data = await createPerson(payload);
                const sessionRes = await loginByRegistration(
                    data.registration ?? payload.registration ?? '',
                    payload.birth_date ?? '',
                );
                saveAccessSession(sessionRes.access_token, sessionRes.expires_in);
                person = sessionRes.person;
            }
            if (editing) setPerson(person);
            else beginVisit(person);
            navigate('/menu', { replace: true });
        } catch (err) {
            setError(apiErrorMessage(err, 'Não foi possível salvar o cadastro.'));
        } finally {
            setSaving(false);
        }
    }

    const title = {
        registration: 'Matrícula',
        name: 'Nome',
        birthDate: 'Data de nascimento',
        sex: 'Gênero',
        height: 'Altura',
    }[step];

    const subtitle = {
        registration: 'Digite sua matrícula.',
        name: 'Digite seu nome completo.',
        birthDate: 'Digite dia, mês e ano de nascimento.',
        sex: 'Escolha uma opção.',
        height: 'Digite sua altura em centímetros.',
    }[step];

    const emptyValue = (
        (step === 'registration' && !form.employeeId)
        || (step === 'name' && !form.name)
        || (step === 'birthDate' && !birthDigits)
        || (step === 'height' && !form.heightCm)
    );

    const display = step === 'registration'
        ? (form.employeeId || 'Matrícula')
        : step === 'name'
            ? (form.name || 'Nome completo')
            : step === 'birthDate'
                ? formatBirthDigits(birthDigits)
                : step === 'height'
                    ? (form.heightCm ? `${form.heightCm} cm` : 'cm')
                    : '';

    return (
        <KioskLayout showUser={editing} activeSidebar={editing ? 'edit' : null}>
            <div className={`kiosk-login${step === 'name' ? ' kiosk-login-wide' : ''}`}>
                <KioskBackButton onClick={goBack} />
                <div className="kiosk-dots" aria-hidden>
                    {steps.map((item) => (
                        <span key={item} className={item === step ? 'active' : (steps.indexOf(item) < stepIndex ? 'done' : '')} />
                    ))}
                </div>
                <h1 className="kiosk-title">{title}</h1>
                <p className="kiosk-subtitle">{subtitle}</p>
                {step !== 'sex' ? (
                    <div
                        className={`kiosk-login-value${emptyValue ? ' is-empty' : ''}${step === 'name' ? ' is-text' : ''}`}
                        role="status"
                        aria-live="polite"
                    >
                        {display}
                    </div>
                ) : (
                    <div className="kiosk-choice-row kiosk-choice-stack">
                        {[
                            { value: 'female', label: 'Feminino' },
                            { value: 'male', label: 'Masculino' },
                        ].map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                className={`kiosk-choice${form.sex === option.value ? ' selected' : ''}`}
                                onClick={() => {
                                    setError('');
                                    setForm((prev) => ({ ...prev, sex: option.value }));
                                    setStep('height');
                                }}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                )}
                {error ? <p className="kiosk-error">{error}</p> : null}
                {step === 'name' ? (
                    <KioskKeyboard onChar={appendName} onBackspace={backspaceName} disabled={saving} />
                ) : null}
                {step === 'registration' || step === 'birthDate' || step === 'height' ? (
                    <KioskNumpad onDigit={appendDigit} onBackspace={backspace} disabled={saving} />
                ) : null}
                {step === 'sex' ? null : (
                    <button
                        type="button"
                        className="kiosk-btn kiosk-btn-primary kiosk-btn-xl"
                        disabled={saving}
                        onClick={step === 'height' ? () => void save() : continueStep}
                    >
                        {step === 'height' ? (saving ? 'Salvando...' : 'Salvar') : 'Continuar'}
                    </button>
                )}
            </div>
        </KioskLayout>
    );
}
