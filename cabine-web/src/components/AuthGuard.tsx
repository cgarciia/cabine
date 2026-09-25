import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';

import { useKiosk } from '../kiosk/KioskContext';
import { type AccessTokenTyp, clearAccessSession, getAccessTokenTyp, isAccessSessionValid } from '../session/authSession';

const EXPIRY_POLL_MS = 30_000;

export function AuthGuard({ typ, redirectTo }: { typ: AccessTokenTyp; redirectTo: string }) {
    const location = useLocation();
    const { clearSession } = useKiosk();
    const valid = isAccessSessionValid();
    const ok = valid && getAccessTokenTyp() === typ;

    useEffect(() => {
        if (valid) return;
        clearSession();
        clearAccessSession();
    }, [valid, clearSession]);

    useEffect(() => {
        if (!ok) return undefined;
        const timer = window.setInterval(() => {
            if (!isAccessSessionValid()) {
                clearSession();
                clearAccessSession();
                window.location.assign(redirectTo);
            }
        }, EXPIRY_POLL_MS);
        return () => window.clearInterval(timer);
    }, [ok, clearSession, redirectTo]);

    if (!ok) {
        return <Navigate to={redirectTo} replace state={{ from: location.pathname }} />;
    }

    return <Outlet />;
}
