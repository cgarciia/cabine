import { Stethoscope } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';

import { apiErrorMessage, loginProfessional } from '../api';
import { isAccessSessionValid } from '../session/auth';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (isAccessSessionValid()) {
    return <Navigate to="/pacientes" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await loginProfessional(email.trim(), password);
      navigate('/pacientes');
    } catch (err) {
      setError(err instanceof Error && err.message.includes('profissional')
        ? err.message
        : apiErrorMessage(err, 'Não foi possível entrar.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <Stethoscope size={18} strokeWidth={2} />
          </span>
          <span>
            Cabine
            <span>Profissional de saúde</span>
          </span>
        </div>
        <h1>Entrar</h1>
        <p className="lead">Acesse o histórico de avaliações dos pacientes da cabine.</p>
        {error ? <p className="error">{error}</p> : null}
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Senha</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? 'Entrando…' : 'Entrar'}
        </button>
        <p style={{ marginTop: '1rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
          Ainda não tem conta?{' '}
          <Link className="btn-link" to="/cadastro">
            Cadastre-se
          </Link>
        </p>
      </form>
    </div>
  );
}
