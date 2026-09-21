import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';

import { useKiosk } from '../kiosk/KioskContext';
import { clearAccessSession, isAccessSessionValid } from '../session/authSession';

export function RequireAuth() {
    const location = useLocation();
    const { clearSession } = useKiosk();
    const ok = isAccessSessionValid();

    useEffect(() => {
        if (ok) return;
        clearSession();
        clearAccessSession();
    }, [ok, clearSession]);

    useEffect(() => {
        if (!ok) return undefined;
        const timer = window.setInterval(() => {
            if (!isAccessSessionValid()) {
                clearSession();
                clearAccessSession();
                window.location.assign('/matricula');
            }
        }, 30_000);
        return () => window.clearInterval(timer);
    }, [ok, clearSession]);

    if (!ok) {
        return <Navigate to="/matricula" replace state={{ from: location.pathname }} />;
    }

    return <Outlet />;
}
