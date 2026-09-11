import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';

import { useRole } from '../role/RoleContext';
import type { CabineRole } from '../role/role';

export function RequireRole({
    allow,
    children,
}: {
    allow: CabineRole;
    children: ReactNode;
}) {
    const { role } = useRole();
    if (!role) return <Navigate to="/entrar" replace />;
    if (role !== allow) return <Navigate to={role === 'clinician' ? '/clinico' : '/'} replace />;
    return children;
}
