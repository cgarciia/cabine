import { type CSSProperties, type FormEvent, type ReactNode } from 'react';

export type PersonFormValues = {
    name: string;
    heightCm: string;
    age: string;
    birthDate: string;
    sex: string;
    peopleType: string;
    expectedWeight: string;
};

export const emptyPersonForm: PersonFormValues = {
    name: '',
    heightCm: '170',
    age: '',
    birthDate: '',
    sex: 'male',
    peopleType: 'normal',
    expectedWeight: '',
};

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
    marginBottom: '0.85rem',
    textAlign: 'left',
    color: '#475569',
    fontSize: '0.875rem',
};

export function ageFromBirth(value: string): number | null {
    if (!value) return null;
    const born = new Date(value);
    if (Number.isNaN(born.getTime())) return null;
    const now = new Date();
    let years = now.getFullYear() - born.getFullYear();
    const m = now.getMonth() - born.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < born.getDate())) years -= 1;
    return years > 0 ? years : null;
}

type Props = {
    values: PersonFormValues;
    onChange: (next: PersonFormValues) => void;
    onSubmit: (event: FormEvent) => void;
    submitLabel: string;
    saving?: boolean;
    extraActions?: ReactNode;
};

export function PersonForm({ values, onChange, onSubmit, submitLabel, saving, extraActions }: Props) {
    return (
        <form onSubmit={onSubmit}>
            <label style={labelStyle}>
                Nome
                <input
                    value={values.name}
                    onChange={(event) => onChange({ ...values, name: event.target.value })}
                    required
                    placeholder="Ex.: Maria"
                    style={fieldStyle}
                />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={labelStyle}>
                    Altura (cm)
                    <input
                        value={values.heightCm}
                        onChange={(event) => onChange({ ...values, heightCm: event.target.value })}
                        required
                        style={fieldStyle}
                    />
                </label>
                <label style={labelStyle}>
                    Nascimento
                    <input
                        type="date"
                        value={values.birthDate}
                        onChange={(event) => {
                            const birthDate = event.target.value;
                            const years = ageFromBirth(birthDate);
                            onChange({
                                ...values,
                                birthDate,
                                age: years != null ? String(years) : values.age,
                            });
                        }}
                        style={fieldStyle}
                    />
                </label>
                <label style={labelStyle}>
                    Idade
                    <input
                        value={values.age}
                        onChange={(event) => onChange({ ...values, age: event.target.value })}
                        required
                        style={fieldStyle}
                    />
                </label>
                <label style={labelStyle}>
                    Sexo
                    <select
                        value={values.sex}
                        onChange={(event) => onChange({ ...values, sex: event.target.value })}
                        style={fieldStyle}
                    >
                        <option value="male">Masculino</option>
                        <option value="female">Feminino</option>
                    </select>
                </label>
                <label style={labelStyle}>
                    Tipo
                    <select
                        value={values.peopleType}
                        onChange={(event) => onChange({ ...values, peopleType: event.target.value })}
                        style={fieldStyle}
                    >
                        <option value="normal">Padrão</option>
                        <option value="athlete">Atleta</option>
                    </select>
                </label>
                <label style={labelStyle}>
                    Último peso (kg)
                    <input
                        value={values.expectedWeight}
                        onChange={(event) => onChange({ ...values, expectedWeight: event.target.value })}
                        placeholder="opcional"
                        style={fieldStyle}
                    />
                </label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                    type="submit"
                    disabled={saving}
                    style={{
                        background: '#0f766e',
                        color: '#fff',
                        border: 0,
                        borderRadius: 12,
                        padding: '10px 16px',
                        fontWeight: 600,
                        cursor: 'pointer',
                    }}
                >
                    {saving ? 'Salvando...' : submitLabel}
                </button>
                {extraActions}
            </div>
        </form>
    );
}
