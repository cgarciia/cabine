import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';

import { api, apiErrorMessage } from '../api';
import { AppLayout } from '../components/AppLayout';
import type { Scale, ScaleAdapterOption, ScalePayload } from '../types/scale';

const emptyForm = (adapters: ScaleAdapterOption[]): ScalePayload => ({
    name: '',
    adapter: adapters[0]?.key ?? 'ble_broadcast',
    address: '',
    parser: adapters[0]?.parsers[0]?.key ?? 'broadcast_big_endian',
    is_active: true,
    is_default: false,
});

const fieldStyle: CSSProperties = {
    display: 'block',
    width: '100%',
    marginTop: '6px',
    padding: '10px 12px',
    borderRadius: '12px',
    border: '1px solid #e2e8f0',
    fontSize: '1rem',
    color: '#0F172A',
    background: '#f8fafc',
    boxSizing: 'border-box',
};

const labelStyle: CSSProperties = {
    display: 'block',
    marginBottom: '1rem',
    textAlign: 'left',
    color: '#475569',
    fontSize: '0.875rem',
};

export function ScalesPage() {
    const [adapters, setAdapters] = useState<ScaleAdapterOption[]>([]);
    const [scales, setScales] = useState<Scale[]>([]);
    const [form, setForm] = useState<ScalePayload>(emptyForm([]));
    const [editingId, setEditingId] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    const selectedAdapter = useMemo(
        () => adapters.find((item) => item.key === form.adapter) ?? adapters[0],
        [adapters, form.adapter],
    );

    async function load() {
        const [catalogRes, scalesRes] = await Promise.all([
            api.get<{ adapters: ScaleAdapterOption[] }>('/scales/catalog'),
            api.get<Scale[]>('/scales'),
        ]);
        setAdapters(catalogRes.data.adapters);
        setScales(scalesRes.data);
        setForm((current) => {
            if (current.name || editingId) return current;
            return emptyForm(catalogRes.data.adapters);
        });
    }

    useEffect(() => {
        load().catch(() => setError('Não foi possível carregar as balanças.'));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function onAdapterChange(adapterKey: string) {
        const adapter = adapters.find((item) => item.key === adapterKey);
        setForm((current) => ({
            ...current,
            adapter: adapterKey,
            parser: adapter?.parsers[0]?.key ?? current.parser,
        }));
    }

    function startEdit(scale: Scale) {
        setEditingId(scale.id);
        setForm({
            name: scale.name,
            adapter: scale.adapter,
            address: scale.address,
            parser: scale.parser,
            is_active: scale.is_active,
            is_default: scale.is_default,
        });
        setError('');
    }

    function resetForm() {
        setEditingId(null);
        setForm(emptyForm(adapters));
        setError('');
    }

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        setSaving(true);
        setError('');
        try {
            if (editingId) {
                await api.patch(`/scales/${editingId}`, form);
            } else {
                await api.post('/scales', form);
            }
            resetForm();
            await load();
        } catch (err) {
            setError(apiErrorMessage(err, 'Não foi possível salvar a balança.'));
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(scale: Scale) {
        if (!window.confirm(`Excluir a balança "${scale.name}"?`)) return;
        try {
            await api.delete(`/scales/${scale.id}`);
            if (editingId === scale.id) resetForm();
            await load();
        } catch (err) {
            setError(apiErrorMessage(err, 'Não foi possível excluir a balança.'));
        }
    }

    async function makeDefault(scale: Scale) {
        try {
            await api.patch(`/scales/${scale.id}`, { is_default: true });
            await load();
        } catch (err) {
            setError(apiErrorMessage(err, 'Não foi possível definir a balança padrão.'));
        }
    }

    return (
        <AppLayout>
            <div style={{ maxWidth: '960px', margin: '0 auto', padding: '0 1.5rem 3rem' }}>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.1fr)',
                    gap: '1.5rem',
                    alignItems: 'start',
                }}>
                    <form
                        onSubmit={handleSubmit}
                        style={{
                            background: '#fff',
                            borderRadius: '20px',
                            padding: '1.75rem',
                            boxShadow: '0 12px 30px -12px rgba(0,0,0,0.08)',
                            textAlign: 'left',
                        }}
                    >
                        <h2 style={{ margin: '0 0 4px', color: '#0F172A', fontSize: '1.25rem' }}>
                            {editingId ? 'Editar balança' : 'Nova balança'}
                        </h2>
                        <p style={{ margin: '0 0 1.25rem', color: '#64748B', fontSize: '0.9rem' }}>
                            O adapter define como o backend fala com o hardware. O endereço é MAC, porta COM ou URL, conforme o tipo.
                        </p>

                        <label style={labelStyle}>
                            Nome
                            <input
                                value={form.name}
                                onChange={(event) => setForm({ ...form, name: event.target.value })}
                                required
                                placeholder="Ex.: Balança da cabine 1"
                                style={fieldStyle}
                            />
                        </label>

                        <label style={labelStyle}>
                            Adapter
                            <select
                                value={form.adapter}
                                onChange={(event) => onAdapterChange(event.target.value)}
                                style={fieldStyle}
                            >
                                {adapters.map((adapter) => (
                                    <option key={adapter.key} value={adapter.key}>
                                        {adapter.label}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label style={labelStyle}>
                            Parser
                            <select
                                value={form.parser}
                                onChange={(event) => setForm({ ...form, parser: event.target.value })}
                                style={fieldStyle}
                            >
                                {(selectedAdapter?.parsers ?? []).map((parser) => (
                                    <option key={parser.key} value={parser.key}>
                                        {parser.label}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label style={labelStyle}>
                            {selectedAdapter?.address_label ?? 'Endereço'}
                            <input
                                value={form.address}
                                onChange={(event) => setForm({ ...form, address: event.target.value })}
                                required
                                placeholder="AA:BB:CC:DD:EE:FF"
                                style={fieldStyle}
                            />
                        </label>

                        <label style={{ ...labelStyle, display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input
                                type="checkbox"
                                checked={form.is_active}
                                onChange={(event) => setForm({ ...form, is_active: event.target.checked })}
                            />
                            Ativa
                        </label>

                        <label style={{ ...labelStyle, display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input
                                type="checkbox"
                                checked={form.is_default}
                                onChange={(event) => setForm({ ...form, is_default: event.target.checked })}
                            />
                            Usar como padrão
                        </label>

                        {error ? (
                            <p style={{ color: '#B91C1C', marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</p>
                        ) : null}

                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                type="submit"
                                disabled={saving}
                                style={{
                                    background: '#2563EB',
                                    color: '#fff',
                                    border: 0,
                                    borderRadius: '12px',
                                    padding: '10px 16px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                }}
                            >
                                {saving ? 'Salvando...' : editingId ? 'Atualizar' : 'Cadastrar'}
                            </button>
                            {editingId ? (
                                <button
                                    type="button"
                                    onClick={resetForm}
                                    style={{
                                        background: '#fff',
                                        color: '#334155',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '12px',
                                        padding: '10px 16px',
                                        cursor: 'pointer',
                                    }}
                                >
                                    Cancelar
                                </button>
                            ) : null}
                        </div>
                    </form>

                    <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {scales.length === 0 ? (
                            <div style={{
                                background: '#fff',
                                borderRadius: '20px',
                                padding: '1.5rem',
                                color: '#64748B',
                            }}>
                                Ainda não há balanças no banco. Cadastre a primeira ao lado.
                            </div>
                        ) : scales.map((scale) => (
                            <article
                                key={scale.id}
                                style={{
                                    background: '#fff',
                                    borderRadius: '20px',
                                    padding: '1.25rem 1.5rem',
                                    boxShadow: '0 12px 30px -12px rgba(0,0,0,0.08)',
                                    textAlign: 'left',
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                                    <div>
                                        <strong style={{ color: '#0F172A' }}>{scale.name}</strong>
                                        <div style={{ color: '#64748B', fontSize: '0.85rem', marginTop: '4px' }}>
                                            {scale.adapter} · {scale.parser}
                                        </div>
                                        <div style={{ color: '#334155', fontSize: '0.9rem', marginTop: '4px' }}>
                                            {scale.address}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                                        {scale.is_default ? (
                                            <span style={{ fontSize: '0.75rem', color: '#1D4ED8', fontWeight: 700 }}>PADRÃO</span>
                                        ) : null}
                                        {!scale.is_active ? (
                                            <span style={{ fontSize: '0.75rem', color: '#B45309', fontWeight: 700 }}>INATIVA</span>
                                        ) : null}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                                    <button type="button" onClick={() => startEdit(scale)} style={ghostButton}>
                                        Editar
                                    </button>
                                    {!scale.is_default ? (
                                        <button type="button" onClick={() => makeDefault(scale)} style={ghostButton}>
                                            Tornar padrão
                                        </button>
                                    ) : null}
                                    <button type="button" onClick={() => handleDelete(scale)} style={{ ...ghostButton, color: '#B91C1C' }}>
                                        Excluir
                                    </button>
                                </div>
                            </article>
                        ))}
                    </section>
                </div>
            </div>
        </AppLayout>
    );
}

const ghostButton: CSSProperties = {
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    padding: '6px 10px',
    cursor: 'pointer',
    color: '#334155',
    fontSize: '0.85rem',
};
