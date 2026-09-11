import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { clearRole, loadRole, saveRole, type CabineRole } from './role';

type RoleContextValue = {
    role: CabineRole | null;
    setRole: (role: CabineRole) => void;
    signOut: () => void;
};

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
    const [role, setRoleState] = useState<CabineRole | null>(() => loadRole());

    const value = useMemo<RoleContextValue>(() => ({
        role,
        setRole: (next) => {
            saveRole(next);
            setRoleState(next);
        },
        signOut: () => {
            clearRole();
            setRoleState(null);
        },
    }), [role]);

    return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
    const ctx = useContext(RoleContext);
    if (!ctx) throw new Error('useRole precisa do RoleProvider');
    return ctx;
}
