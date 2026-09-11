import { useEffect, useRef, useState, type ReactNode } from 'react';

const CONFIRM_MS = 480;
const EXIT_MS = 340;

export function useQuestionAdvance() {
    const busy = useRef(false);
    const timers = useRef<number[]>([]);
    const [picked, setPicked] = useState<string | null>(null);
    const [leaving, setLeaving] = useState(false);
    const [leaveDir, setLeaveDir] = useState<'fwd' | 'back'>('fwd');

    useEffect(() => () => {
        timers.current.forEach((id) => window.clearTimeout(id));
    }, []);

    function later(ms: number, fn: () => void) {
        const id = window.setTimeout(fn, ms);
        timers.current.push(id);
    }

    function run(dir: 'fwd' | 'back', after: () => void, pick?: string) {
        if (busy.current) return;
        busy.current = true;
        if (pick != null) setPicked(pick);
        const confirm = dir === 'fwd' && pick != null ? CONFIRM_MS : 40;
        later(confirm, () => {
            setLeaveDir(dir);
            setLeaving(true);
            later(EXIT_MS, () => {
                after();
                setPicked(null);
                setLeaving(false);
                busy.current = false;
            });
        });
    }

    return {
        picked,
        leaving,
        leaveDir,
        busy: busy.current,
        select: (id: string, after: () => void) => run('fwd', after, id),
        goBack: (after: () => void) => run('back', after),
    };
}

export function QuestionPane({
    paneKey,
    leaving,
    leaveDir,
    children,
}: {
    paneKey: string;
    leaving: boolean;
    leaveDir: 'fwd' | 'back';
    children: ReactNode;
}) {
    return (
        <div
            key={paneKey}
            className={`cabine-qpane ${leaving ? (leaveDir === 'back' ? 'is-out-back' : 'is-out') : leaveDir === 'back' ? 'is-in-back' : 'is-in'}`}
        >
            {children}
        </div>
    );
}
