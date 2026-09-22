import { Stethoscope } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';

import { apiErrorMessage, registerProfessional } from '../api';
import { isAccessSessionValid } from '../session/auth';

export function RegisterPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [crm, setCrm] = useState('');
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
      await registerProfessional({
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        crm: crm.trim(),
      });
      navigate('/pacientes');
    } catch (err) {
      setError(apiErrorMessage(err, 'Não foi possível cadastrar.'));
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
        <h1>Cadastro</h1>
        <p className="lead">Crie sua conta com e-mail, senha e CRM.</p>
        {error ? <p className="error">{error}</p> : null}
        <div className="field">
          <label htmlFor="full_name">Nome completo</label>
          <input
            id="full_name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            maxLength={120}
          />
        </div>
        <div className="field">
          <label htmlFor="crm">CRM</label>
          <input
            id="crm"
            value={crm}
            onChange={(e) => setCrm(e.target.value)}
            required
            maxLength={40}
            placeholder="Ex.: 123456/SP"
          />
        </div>
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
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? 'Cadastrando…' : 'Criar conta'}
        </button>
        <p style={{ marginTop: '1rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
          Já tem conta?{' '}
          <Link className="btn-link" to="/login">
            Entrar
          </Link>
        </p>
      </form>
    </div>
  );
}
