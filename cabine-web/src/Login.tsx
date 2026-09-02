import { useState } from 'react';
import { api } from './api';

export function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const formData = new URLSearchParams();
        formData.append('username', email);
        formData.append('password', password);

        try {
            const response = await api.post('/login', formData);
            localStorage.setItem('token', response.data.access_token);
            alert('Login realizado com sucesso!');
        } catch {
            setError('E-mail ou senha incorretos.');
        }
    };

    return (
        <div style={{ maxWidth: '320px', margin: '60px auto', fontFamily: 'sans-serif' }}>
            <h2>Login - Cabine</h2>
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input
                    type="email"
                    placeholder="E-mail"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    style={{ padding: '8px' }}
                />
                <input
                    type="password"
                    placeholder="Senha"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    style={{ padding: '8px' }}
                />
                <button type="submit" style={{ padding: '10px', cursor: 'pointer' }}>
                    Entrar
                </button>
            </form>
            {error && <p style={{ color: 'red', marginTop: '10px' }}>{error}</p>}
        </div>
    );
}