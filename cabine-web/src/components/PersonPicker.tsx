import { useEffect, useState, type FormEvent } from 'react';

import { api, apiErrorMessage } from '../api';
import { emptyPersonForm, PersonForm, type PersonFormValues } from './PersonForm';
import { saveCurrentPersonId } from '../session/currentPerson';
import type { ScalePerson } from '../types/person';

type Props = {
    selectedId: string;
    onSelect: (person: ScalePerson) => void;
    allowCreate?: boolean;
};

export function PersonPicker({ selectedId, onSelect, allowCreate = true }: Props) {
    const [people, setPeople] = useState<ScalePerson[]>([]);
    const [open, setOpen] = useState(!selectedId);
    const [adding, setAdding] = useState(false);
    const [form, setForm] = useState<PersonFormValues>(emptyPersonForm);
    const [error, setError] = useState('');

    useEffect(() => {
        api.get<ScalePerson[]>('/people')
            .then(({ data }) => {
                setPeople(data);
                const remembered = data.find((item) => item.id === selectedId);
                if (remembered) onSelect(remembered);
            })
            .catch((err) => setError(apiErrorMessage(err, 'Não foi possível carregar as pessoas.')));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function handleAdd(event: FormEvent) {
        event.preventDefault();
        try {
            const height = Number(form.heightCm);
            const years = Number(form.age);
            const weight = Number(form.expectedWeight);
            const { data } = await api.post<ScalePerson>('/people', {
                name: form.name.trim(),
                height_cm: height,
                age: Number.isFinite(years) && years > 0 ? years : undefined,
                birth_date: form.birthDate || null,
                sex: form.sex,
                people_type: form.peopleType,
                expected_weight_kg: Number.isFinite(weight) && weight > 0 ? weight : null,
            });
            setPeople((current) => [...current, data].sort((a, b) => a.name.localeCompare(b.name)));
            choose(data);
            setForm(emptyPersonForm);
            setAdding(false);
        } catch (err) {
            setError(apiErrorMessage(err, 'Não foi possível cadastrar a pessoa.'));
        }
    }

    function choose(person: ScalePerson) {
        saveCurrentPersonId(person.id);
        onSelect(person);
        setOpen(false);
    }

    const selected = people.find((item) => item.id === selectedId);

    return (
        <>
            <button type="button" className="cabine-person-chip" onClick={() => { setOpen(true); setAdding(false); }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>QUEM ESTÁ NA CABINE</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, marginTop: 2 }}>
                    {selected ? selected.name : 'Escolher pessoa cadastrada'}
                </div>
                {selected ? (
                    <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 2 }}>
                        {selected.height_cm} cm · {selected.age} anos
                    </div>
                ) : null}
            </button>

            {open ? (
                <div className="cabine-overlay no-print" onClick={() => selectedId && setOpen(false)}>
                    <div className="cabine-modal" onClick={(event) => event.stopPropagation()}>
                        <h2 style={{ margin: '0 0 8px', fontSize: '1.4rem', color: '#0f172a' }}>Quem vai usar a cabine?</h2>
                        <p style={{ margin: '0 0 1rem', color: '#64748b' }}>
                            As respostas ficam no cadastro desta pessoa. Escolha antes de começar.
                        </p>
                        {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}
                        {adding && allowCreate ? (
                            <PersonForm
                                values={form}
                                onChange={setForm}
                                onSubmit={handleAdd}
                                submitLabel="Salvar e usar"
                                extraActions={(
                                    <button type="button" className="cabine-btn cabine-btn-ghost" onClick={() => setAdding(false)}>
                                        Voltar
                                    </button>
                                )}
                            />
                        ) : (
                            <>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflow: 'auto' }}>
                                    {people.length === 0 ? (
                                        <p style={{ color: '#64748b' }}>Ninguém cadastrado ainda.</p>
                                    ) : people.map((person) => (
                                        <button
                                            key={person.id}
                                            type="button"
                                            onClick={() => choose(person)}
                                            className="cabine-person-chip"
                                            style={{
                                                background: person.id === selectedId ? '#ecfdf5' : '#f8fafc',
                                                borderColor: person.id === selectedId ? '#99f6e4' : '#e2e8f0',
                                            }}
                                        >
                                            <div style={{ fontWeight: 700 }}>{person.name}</div>
                                            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2 }}>
                                                {person.height_cm} cm · {person.age} anos
                                            </div>
                                        </button>
                                    ))}
                                </div>
                                {allowCreate ? (
                                    <button
                                        type="button"
                                        className="cabine-btn cabine-btn-primary"
                                        onClick={() => { setAdding(true); setForm(emptyPersonForm); }}
                                        style={{ marginTop: 14, width: '100%' }}
                                    >
                                        Adicionar pessoa
                                    </button>
                                ) : null}
                            </>
                        )}
                    </div>
                </div>
            ) : null}
        </>
    );
}
