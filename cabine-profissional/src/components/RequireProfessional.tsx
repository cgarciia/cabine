import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';

import { clearAccessSession, getStoredUser, isAccessSessionValid } from '../session/auth';

export function RequireProfessional({ children }: { children: ReactNode }) {
  if (!isAccessSessionValid()) {
    return <Navigate to="/login" replace />;
  }
  const user = getStoredUser();
  if (!user || user.role !== 'professional') {
    clearAccessSession();
    return <Navigate to="/login" replace />;
  }
  return children;
}
