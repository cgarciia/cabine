import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { getAccessTokenTyp } from '../session/authSession';

export function RequireOperator() {
    const location = useLocation();
    if (getAccessTokenTyp() !== 'user') {
        return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
    }
    return <Outlet />;
}
