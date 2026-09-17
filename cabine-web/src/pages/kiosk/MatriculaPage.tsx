import { type FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { apiErrorMessage, loginByMatricula } from '../../api';
import { useKiosk } from '../../kiosk/KioskContext';
import { KioskLayout } from '../../kiosk/KioskLayout';
import { isAccessSessionValid, saveAccessSession } from '../../session/authSession';

export function MatriculaPage() {
    const navigate = useNavigate();
    const { session, beginVisit } = useKiosk();
    const [matricula, setMatricula] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    if (isAccessSessionValid() && session.person) {
        return <Navigate to="/menu" replace />;
    }

    async function handleEnter(event: FormEvent) {
        event.preventDefault();
        const value = matricula.trim();
        if (!value) {
            setError('Informe a matrícula.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const data = await loginByMatricula(value);
            saveAccessSession(data.access_token, data.expires_in);
            beginVisit(data.person);
            navigate('/menu', { replace: true });
        } catch (err) {
            setError(apiErrorMessage(err, 'Matrícula não encontrada.'));
        } finally {
            setLoading(false);
        }
    }

    return (
        <KioskLayout showUser={false}>
            <form className="kiosk-center-card" onSubmit={handleEnter}>
                <h1 className="kiosk-title">Matrícula</h1>
                <p className="kiosk-subtitle">Digite sua matrícula para continuar</p>
                <label className="kiosk-field">
                    <span>Matrícula</span>
                    <input
                        className="kiosk-input"
                        value={matricula}
                        onChange={(event) => setMatricula(event.target.value)}
                        inputMode="numeric"
                        autoComplete="off"
                        autoFocus
                    />
                </label>
                {error ? <p className="kiosk-error">{error}</p> : null}
                <button
                    type="submit"
                    className="kiosk-btn kiosk-btn-primary kiosk-btn-xl"
                    disabled={loading}
                >
                    {loading ? 'Entrando...' : 'Entrar'}
                </button>
                <button
                    type="button"
                    className="kiosk-link-btn"
                    onClick={() => navigate('/cadastro')}
                >
                    Primeiro acesso?
                </button>
            </form>
        </KioskLayout>
    );
}
