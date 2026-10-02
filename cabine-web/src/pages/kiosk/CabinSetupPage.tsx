import { type FormEvent, useState } from 'react';

import { apiErrorMessage, registerCabin } from '../../api';
import { KioskLayout } from '../../kiosk/KioskLayout';

type Props = {
    initialError?: string;
    onRegistered: () => void;
};

export function CabinSetupPage({ initialError = '', onRegistered }: Props) {
    const [name, setName] = useState('');
    const [error, setError] = useState(initialError);
    const [loading, setLoading] = useState(false);

    async function submit(event: FormEvent) {
        event.preventDefault();
        const description = name.trim();
        if (!description) {
            setError('Informe o nome da cabine.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            await registerCabin(description);
            onRegistered();
        } catch (err) {
            setError(apiErrorMessage(err, 'Não foi possível cadastrar a cabine.'));
        } finally {
            setLoading(false);
        }
    }

    return (
        <KioskLayout showUser={false}>
            <form className="kiosk-login" onSubmit={(event) => void submit(event)}>
                <div className="kiosk-brand-mark">CN</div>
                <h1 className="kiosk-title">Cadastro da cabine</h1>
                <p className="kiosk-subtitle">Informe o nome desta cabine para começar.</p>
                <label className="kiosk-field">
                    Nome
                    <input
                        value={name}
                        maxLength={160}
                        autoFocus
                        disabled={loading}
                        onChange={(event) => setName(event.target.value)}
                    />
                </label>
                {error ? <p className="kiosk-error">{error}</p> : null}
                <button type="submit" className="kiosk-btn kiosk-btn-primary kiosk-btn-xl" disabled={loading}>
                    {loading ? 'Cadastrando…' : 'Cadastrar'}
                </button>
            </form>
        </KioskLayout>
    );
}
