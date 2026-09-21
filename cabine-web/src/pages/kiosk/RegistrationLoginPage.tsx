import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { apiErrorMessage, loginByRegistration, lookupRegistration } from '../../api';
import { KioskBackButton } from '../../components/KioskIcon';
import { KioskNumpad } from '../../components/KioskNumpad';
import { useKiosk } from '../../kiosk/KioskContext';
import { KioskLayout } from '../../kiosk/KioskLayout';
import { isAccessSessionValid, saveAccessSession } from '../../session/authSession';
import { digitsToIsoDate, formatBirthDigits } from '../../utils/kioskDate';

type LoginStep = 'registration' | 'birthDate' | 'firstAccess';

export function RegistrationLoginPage() {
    const navigate = useNavigate();
    const { session, beginVisit } = useKiosk();
    const [step, setStep] = useState<LoginStep>('registration');
    const [employeeId, setEmployeeId] = useState('');
    const [birthDigits, setBirthDigits] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    if (isAccessSessionValid() && session.person) {
        return <Navigate to="/menu" replace />;
    }

    const onRegistration = step === 'registration';
    const onBirthDate = step === 'birthDate';
    const emptyValue = onRegistration ? !employeeId : birthDigits.length === 0;
    const display = onRegistration
        ? (employeeId || 'Matrícula')
        : formatBirthDigits(birthDigits);

    function appendDigit(digit: string) {
        setError('');
        if (onRegistration) {
            setEmployeeId((prev) => (prev.length >= 40 ? prev : `${prev}${digit}`));
            return;
        }
        if (onBirthDate) {
            setBirthDigits((prev) => (prev.length >= 8 ? prev : `${prev}${digit}`));
        }
    }

    function backspace() {
        setError('');
        if (onRegistration) {
            setEmployeeId((prev) => prev.slice(0, -1));
            return;
        }
        if (onBirthDate) {
            setBirthDigits((prev) => prev.slice(0, -1));
        }
    }

    async function continueFromRegistration() {
        const value = employeeId.trim();
        if (!value) {
            setError('Informe a matrícula.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const { exists } = await lookupRegistration(value);
            if (exists) {
                setBirthDigits('');
                setStep('birthDate');
            } else {
                setStep('firstAccess');
            }
        } catch (err) {
            setError(apiErrorMessage(err, 'Não foi possível consultar a matrícula.'));
        } finally {
            setLoading(false);
        }
    }

    function goBackToRegistration() {
        setError('');
        setBirthDigits('');
        setStep('registration');
    }

    function goToRegistrationForm() {
        const value = employeeId.trim();
        navigate(`/cadastro?registration=${encodeURIComponent(value)}`);
    }

    async function signIn() {
        const iso = digitsToIsoDate(birthDigits);
        if (!iso) {
            setError('Informe uma data de nascimento válida.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const data = await loginByRegistration(employeeId.trim(), iso);
            saveAccessSession(data.access_token, data.expires_in);
            beginVisit(data.person);
            navigate('/menu', { replace: true });
        } catch (err) {
            setError(apiErrorMessage(err, 'Matrícula ou data de nascimento incorretas.'));
        } finally {
            setLoading(false);
        }
    }

    if (step === 'firstAccess') {
        return (
            <KioskLayout showUser={false}>
                <div className="kiosk-login">
                    <h1 className="kiosk-title">Primeiro acesso</h1>
                    <p className="kiosk-subtitle">
                        Não encontramos a matrícula <strong>{employeeId.trim()}</strong> no sistema.
                        Complete o cadastro para continuar.
                    </p>
                    <button
                        type="button"
                        className="kiosk-btn kiosk-btn-primary kiosk-btn-xl"
                        onClick={goToRegistrationForm}
                    >
                        Realizar cadastro
                    </button>
                    <KioskBackButton onClick={goBackToRegistration} />
                </div>
            </KioskLayout>
        );
    }

    return (
        <KioskLayout showUser={false}>
            <div className="kiosk-login">
                {onBirthDate ? (
                    <KioskBackButton onClick={goBackToRegistration} />
                ) : null}
                <h1 className="kiosk-title">{onRegistration ? 'Matrícula' : 'Data de nascimento'}</h1>
                <p className="kiosk-subtitle">
                    {onRegistration
                        ? 'Digite sua matrícula no teclado.'
                        : 'Digite o dia, o mês e o ano de nascimento.'}
                </p>
                <div
                    className={`kiosk-login-value${emptyValue ? ' is-empty' : ''}`}
                    role="status"
                    aria-live="polite"
                >
                    {display}
                </div>
                {error ? <p className="kiosk-error">{error}</p> : null}
                <KioskNumpad onDigit={appendDigit} onBackspace={backspace} disabled={loading} />
                <button
                    type="button"
                    className="kiosk-btn kiosk-btn-primary kiosk-btn-xl"
                    disabled={loading}
                    onClick={onRegistration ? () => void continueFromRegistration() : () => void signIn()}
                >
                    {onRegistration
                        ? (loading ? 'Consultando...' : 'Continuar')
                        : (loading ? 'Entrando...' : 'Entrar')}
                </button>
            </div>
        </KioskLayout>
    );
}
