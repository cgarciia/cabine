import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { clearAccessSession, isAccessSessionValid } from '../session/authSession';

export function RequireAuth() {
    const location = useLocation();
    const ok = isAccessSessionValid();

    useEffect(() => {
        if (ok) return;
        clearAccessSession();
    }, [ok]);

    useEffect(() => {
        if (!ok) return undefined;
        const timer = window.setInterval(() => {
            if (!isAccessSessionValid()) {
                clearAccessSession();
                window.location.assign('/matricula');
            }
        }, 30_000);
        return () => window.clearInterval(timer);
    }, [ok]);

    if (!ok) {
        return <Navigate to="/matricula" replace state={{ from: location.pathname }} />;
    }

    return <Outlet />;
}
