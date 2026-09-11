import { biaAdvice } from '../advice/patientAdvice';
import type { ScaleMetrics } from '../types/measurement';

type Props = {
    personName: string;
    pesoKg: number | null;
    metrics: ScaleMetrics | null;
    saved?: boolean;
    onHome: () => void;
    onAgain: () => void;
};

export function PatientBodySummary({ personName, pesoKg, metrics, saved, onHome, onAgain }: Props) {
    const recs = biaAdvice(metrics, pesoKg);
    return (
        <div className="cabine-flow">
            <p className="cabine-kicker">Medição concluída</p>
            <h2 style={{ margin: '6px 0 8px', fontSize: '1.7rem' }}>{personName || 'Pronto'}</h2>
            <p className="cabine-sub">Sua avaliação foi registrada. Aqui vai só um resumo de cuidados, sem classificação.</p>
            {pesoKg != null ? (
                <div className="cabine-weight" style={{ fontSize: '3.2rem', margin: '8px 0 16px' }}>
                    {pesoKg.toFixed(1)}
                    <span style={{ fontSize: '1.2rem', color: '#64748b', marginLeft: 8 }}>kg</span>
                </div>
            ) : null}
            {saved ? <p className="cabine-saved-pill">Registro salvo para o profissional acompanhar</p> : null}
            <ul className="cabine-advice-list">
                {recs.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <div className="cabine-flow-actions">
                <button type="button" className="cabine-btn pri" onClick={onHome}>Voltar ao início</button>
                <button type="button" className="cabine-btn" onClick={onAgain}>Nova medição</button>
            </div>
        </div>
    );
}
