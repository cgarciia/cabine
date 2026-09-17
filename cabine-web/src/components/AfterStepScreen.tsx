import { Navigate, useNavigate } from 'react-router-dom';

import { StepCompleteScreen } from './StepCompleteScreen';
import { useKiosk } from '../kiosk/KioskContext';
import { isVisitComplete, nextIncompleteStep, type KioskStepId } from '../utils/kioskProgress';

type Props = {
    justFinished: KioskStepId;
    title: string;
    description: string;
    hint?: string;
};

export function AfterStepScreen({ justFinished, title, description, hint }: Props) {
    const navigate = useNavigate();
    const { session } = useKiosk();
    const allDone = isVisitComplete(session, justFinished);
    const persisted = isVisitComplete(session);

    if (allDone && persisted) {
        return <Navigate to="/conclusao" replace />;
    }

    if (allDone) {
        return (
            <div className="kiosk-center-card">
                <h1 className="kiosk-title">Registrando sua avaliação</h1>
                <p className="kiosk-subtitle">Só um instante — em seguida você vê a conclusão.</p>
            </div>
        );
    }

    const next = nextIncompleteStep(session, justFinished);
    if (!next) {
        return <Navigate to="/conclusao" replace />;
    }

    return (
        <StepCompleteScreen
            title={title}
            description={description}
            hint={hint}
            nextLabel={next.label}
            onNext={() => navigate(next.path, { replace: true })}
            onMenu={() => navigate('/menu', { replace: true })}
        />
    );
}
