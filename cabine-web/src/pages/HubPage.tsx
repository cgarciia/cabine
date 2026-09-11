import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import AppLayout from '../components/AppLayout';
import { PersonPicker } from '../components/PersonPicker';
import { loadSession } from '../session/cabineSession';
import { loadCurrentPersonId } from '../session/currentPerson';
import type { ScalePerson } from '../types/person';

export function HubPage() {
    const [person, setPerson] = useState<ScalePerson | null>(null);
    const [session, setSession] = useState(() => loadSession());
    const healthDone = Boolean(session.health?.completedAt);
    const mentalDone = Boolean(session.mental?.completedAt);
    const mentalRefused = Boolean(session.mental?.refusedAt) && !mentalDone;
    const ready = Boolean(person?.id || loadCurrentPersonId());

    const suggestion = useMemo(() => {
        if (!ready) return 'Primeiro escolha a pessoa cadastrada. As respostas ficam no cadastro dela.';
        if (!healthDone) return 'Você escolhe por onde começar. Nada na sua tela vai classificar você.';
        if (!mentalDone && !mentalRefused) return 'Se quiser, há um convite opcional sobre como você tem se sentido.';
        return 'Pode seguir para a medição ou repetir um questionário.';
    }, [ready, healthDone, mentalDone, mentalRefused]);

    return (
        <AppLayout>
            <div className="cabine-stage">
                <div className="cabine-hero">
                    <p className="cabine-kicker">Sua visita</p>
                    <h1 style={{ margin: '8px 0 0', fontSize: '1.85rem' }}>O que você quer fazer agora?</h1>
                    <p style={{ margin: '10px 0 18px', color: '#64748b', maxWidth: 640 }}>{suggestion}</p>

                    <PersonPicker
                        selectedId={person?.id || loadCurrentPersonId()}
                        onSelect={(next) => {
                            setPerson(next);
                            setSession(loadSession(next.id));
                        }}
                    />

                    <div className="cabine-module-grid" style={{ opacity: ready ? 1 : 0.45, pointerEvents: ready ? 'auto' : 'none' }}>
                        <Link to="/saude" className="cabine-module-card">
                            <span className="cabine-module-order">1</span>
                            <p className="cabine-kicker">Questionário</p>
                            <h2>Saúde geral</h2>
                            <p>10 perguntas sobre saúde atual, hábitos e sintomas recentes. Cerca de 4 minutos.</p>
                            <span className={`cabine-status ${healthDone ? 'is-done' : ''}`}>
                                {healthDone ? 'Concluído nesta sessão' : 'Disponível'}
                            </span>
                        </Link>

                        <Link to="/saude-mental" className="cabine-module-card">
                            <span className="cabine-module-order">2</span>
                            <p className="cabine-kicker">Opcional</p>
                            <h2>Saúde mental</h2>
                            <p>4 perguntas rápidas. Se necessário, há algumas perguntas a mais. Respostas confidenciais.</p>
                            <span className={`cabine-status ${mentalDone ? 'is-done' : mentalRefused ? 'is-skip' : ''}`}>
                                {mentalDone ? 'Concluído nesta sessão' : mentalRefused ? 'Não respondido' : 'Convite confidencial'}
                            </span>
                        </Link>

                        <Link to="/avaliacao" className="cabine-module-card">
                            <span className="cabine-module-order">3</span>
                            <p className="cabine-kicker">Medição</p>
                            <h2>Bioimpedância</h2>
                            <p>Pesagem na balança. Você vê o peso e um recado de cuidado, sem rótulos.</p>
                            <span className="cabine-status">Sempre disponível</span>
                        </Link>

                        <Link to="/oximetria" className="cabine-module-card">
                            <span className="cabine-module-order">4</span>
                            <p className="cabine-kicker">Medição</p>
                            <h2>Oximetria</h2>
                            <p>Leitura do oxímetro no dedo: oxigenação (SpO2) e pulso (bpm).</p>
                            <span className="cabine-status">Sempre disponível</span>
                        </Link>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
