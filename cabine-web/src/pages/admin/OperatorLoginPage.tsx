import { type FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { apiErrorMessage, loginOperator } from '../../api';
import { AppLayout } from '../../components/AppLayout';
import { useKiosk } from '../../kiosk/KioskContext';
import { getAccessTokenTyp, saveAccessSession } from '../../session/authSession';

export function OperatorLoginPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { clearSession } = useKiosk();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    if (getAccessTokenTyp() === 'user') {
        return <Navigate to="/admin/avaliacao" replace />;
    }

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        setSaving(true);
        setError('');
        try {
            const session = await loginOperator(email.trim(), password);
            clearSession();
            saveAccessSession(session.access_token, session.expires_in);
            const from = (location.state as { from?: string } | null)?.from;
            navigate(from && from.startsWith('/admin') ? from : '/admin/avaliacao', { replace: true });
        } catch (err) {
            setError(apiErrorMessage(err, 'E-mail ou senha incorretos.'));
        } finally {
            setSaving(false);
        }
    }

    return (
        <AppLayout bare>
            <div className="cabine-stage">
                <form className="cabine-hero" style={{ maxWidth: 420, margin: '4rem auto' }} onSubmit={handleSubmit}>
                    <p className="cabine-kicker">Operador</p>
                    <h1 style={{ margin: '8px 0 12px', fontSize: '1.7rem' }}>Entrar no painel</h1>
                    <p style={{ margin: '0 0 1.25rem', color: '#64748b' }}>
                        Use o e-mail do sistema. A sessão do totem (matrícula) não abre estas telas.
                    </p>
                    {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}
                    <label className="cabine-field">
                        E-mail
                        <input
                            type="email"
                            autoComplete="username"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            required
                        />
                    </label>
                    <label className="cabine-field">
                        Senha
                        <input
                            type="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            required
                        />
                    </label>
                    <button type="submit" className="cabine-btn cabine-btn-primary" disabled={saving}>
                        {saving ? 'Entrando…' : 'Entrar'}
                    </button>
                </form>
            </div>
        </AppLayout>
    );
}
