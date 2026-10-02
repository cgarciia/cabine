import { useEffect, useState } from 'react';

import {
    apiErrorMessage,
    fetchCurrentCabin,
    fetchDevices,
    pairDevice,
    renameCabin,
    scanDevices,
    type DeviceInventory,
    type DeviceKind,
    type FoundBleDevice,
} from '../../api';
import { AppLayout } from '../../components/AppLayout';

const KINDS: Array<{ kind: DeviceKind; title: string; hint: string; registers: boolean }> = [
    {
        kind: 'scale',
        title: 'Balança',
        hint: 'Pise na balança, ou toque nela com o pé, para ela acordar. Depois pareie.',
        registers: true,
    },
    {
        kind: 'oximeter',
        title: 'Oxímetro',
        hint: 'Não precisa cadastrar. Encaixe o dedo e procure só para ver se o rádio vê o aparelho. A leitura continua na tela de oximetria.',
        registers: false,
    },
    {
        kind: 'blood_pressure_ecg',
        title: 'Pressão com ECG',
        hint: 'Aperte START/STOP até o visor mostrar -P-. Depois pareie.',
        registers: true,
    },
    {
        kind: 'blood_pressure_wrist',
        title: 'Pressão e pulso',
        hint: 'Segure o botão até aparecer P. Clique em Parear. O Windows pergunta, neste computador, se você quer parear: aceite. Mantenha o P até o visor mostrar OK.',
        registers: true,
    },
];

export function EquipmentPage() {
    const [inventory, setInventory] = useState<DeviceInventory | null>(null);
    const [cabinName, setCabinName] = useState('');
    const [found, setFound] = useState<Partial<Record<DeviceKind, FoundBleDevice[]>>>({});
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [note, setNote] = useState<Partial<Record<DeviceKind, string>>>({});

    async function load() {
        const [devices, cabin] = await Promise.all([fetchDevices(), fetchCurrentCabin()]);
        setInventory(devices);
        setCabinName(cabin.description);
    }

    useEffect(() => {
        load().catch((err: unknown) => {
            setError(apiErrorMessage(err, 'Não foi possível carregar os equipamentos.'));
        });
    }, []);

    async function look(kind: DeviceKind) {
        setError('');
        setBusy(`scan:${kind}`);
        try {
            const devices = await scanDevices(kind);
            setFound((current) => ({ ...current, [kind]: devices }));
            setNote((current) => ({
                ...current,
                [kind]: devices.length
                    ? `Encontrado: ${devices.map((device) => device.name).join(', ')}. ${itemRegisters(kind) ? 'Clique em Parear.' : 'O rádio viu o aparelho.'}`
                    : 'Nenhum aparelho anunciou nesse intervalo. Clique em Procurar e aperte o botão enquanto estiver Procurando.',
            }));
        } catch (err) {
            setError(apiErrorMessage(err, 'A varredura Bluetooth falhou.'));
        } finally {
            setBusy(null);
        }
    }

    async function bond(kind: DeviceKind, device: FoundBleDevice) {
        setError('');
        setBusy(`pair:${kind}`);
        setNote((current) => ({
            ...current,
            [kind]:
                kind === 'blood_pressure_wrist'
                    ? 'O Windows vai perguntar se você quer parear. Aceite essa pergunta neste computador e mantenha o P no visor.'
                    : 'Pareando neste computador.',
        }));
        try {
            const next = await pairDevice(kind, device.address, device.name);
            setInventory(next);
            setFound((current) => ({ ...current, [kind]: [] }));
            setNote((current) => ({
                ...current,
                [kind]: `Pareado: ${device.name} · ${device.address}`,
            }));
        } catch (err) {
            const message = apiErrorMessage(err, 'Não foi possível parear.');
            setError(message);
            setNote((current) => ({ ...current, [kind]: message }));
        } finally {
            setBusy(null);
        }
    }

    async function saveName() {
        const description = cabinName.trim();
        if (!description) {
            setError('Informe o nome da cabine.');
            return;
        }
        setError('');
        setBusy('cabin');
        try {
            const cabin = await renameCabin(description);
            setCabinName(cabin.description);
        } catch (err) {
            setError(apiErrorMessage(err, 'Não foi possível salvar o nome da cabine.'));
        } finally {
            setBusy(null);
        }
    }

    function itemRegisters(kind: DeviceKind): boolean {
        return KINDS.find((item) => item.kind === kind)?.registers ?? true;
    }

    function pairedLabel(kind: DeviceKind): string {
        if (kind === 'scale') {
            return inventory?.scale
                ? `${inventory.scale.name} · ${inventory.scale.address}`
                : 'Ainda sem balança pareada.';
        }
        const devices = Array.isArray(inventory?.devices) ? inventory.devices : [];
        const row = devices.find((item) => item.kind === kind && item.is_active);
        return row ? `${row.name} · ${row.address}` : 'Ainda sem pareamento.';
    }

    return (
        <AppLayout>
            <div className="cabine-stage">
                <div className="cabine-hero" style={{ maxWidth: 760 }}>
                    <p className="cabine-kicker">Configuração</p>
                    <h1 style={{ margin: '8px 0 0', fontSize: '1.85rem' }}>Equipamentos</h1>
                    <p className="cabine-oxi-prompt">
                        Aperte o botão no aparelho, como no aplicativo do fabricante. O totem lê o endereço e grava o vínculo neste PC.
                    </p>
                    {error ? <p style={{ color: '#B91C1C', fontWeight: 600 }}>{error}</p> : null}
                    <label className="cabine-field" style={{ marginTop: 16 }}>
                        Nome desta cabine
                        <input
                            value={cabinName}
                            maxLength={160}
                            disabled={busy !== null}
                            onChange={(event) => setCabinName(event.target.value)}
                        />
                    </label>
                    <button
                        type="button"
                        className="cabine-btn cabine-btn-primary"
                        disabled={busy !== null}
                        onClick={() => void saveName()}
                    >
                        {busy === 'cabin' ? 'Salvando…' : 'Salvar nome'}
                    </button>
                    <div style={{ display: 'grid', gap: '16px', marginTop: 20 }}>
                        {KINDS.map((item) => (
                            <article
                                key={item.kind}
                                style={{
                                    textAlign: 'left',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: 16,
                                    padding: '16px 18px',
                                    background: '#fff',
                                }}
                            >
                                <h2 style={{ margin: '0 0 6px', fontSize: '1.15rem' }}>{item.title}</h2>
                                <p style={{ margin: '0 0 8px', color: '#475569' }}>{item.hint}</p>
                                <p style={{ margin: '0 0 12px', color: '#0f766e', fontWeight: 600 }}>
                                    {item.registers ? pairedLabel(item.kind) : 'Leitura direta, sem cadastro.'}
                                </p>
                                {note[item.kind] ? (
                                    <p style={{ margin: '0 0 12px', color: '#0f172a', fontWeight: 700 }}>{note[item.kind]}</p>
                                ) : null}
                                <button
                                    type="button"
                                    className="cabine-btn cabine-btn-primary"
                                    disabled={busy !== null}
                                    onClick={() => void look(item.kind)}
                                >
                                    {busy === `scan:${item.kind}` ? 'Procurando…' : 'Procurar'}
                                </button>
                                {(found[item.kind] ?? []).map((device) => (
                                    <div
                                        key={device.address}
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            gap: 12,
                                            alignItems: 'center',
                                            marginTop: 12,
                                        }}
                                    >
                                        <span>
                                            <strong>{device.name}</strong>
                                            <span style={{ display: 'block', color: '#64748b' }}>{device.address}</span>
                                        </span>
                                        {item.registers ? (
                                            <button
                                                type="button"
                                                className="cabine-btn cabine-btn-primary"
                                                disabled={busy !== null}
                                                onClick={() => void bond(item.kind, device)}
                                            >
                                                {busy === `pair:${item.kind}` ? 'Pareando…' : 'Parear'}
                                            </button>
                                        ) : (
                                            <span style={{ color: '#0f766e', fontWeight: 700 }}>Visto no rádio</span>
                                        )}
                                    </div>
                                ))}
                            </article>
                        ))}
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
