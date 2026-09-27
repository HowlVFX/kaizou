import React, { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { hasAdminSession, SESSION_EXPIRED_EVENT } from '../api/client';

// Session validity is enforced per request by the API client (refresh on 401);
// the guard only redirects when there is no admin session or it has expired.
export const PortalAuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [authed, setAuthed] = useState(hasAdminSession);

  useEffect(() => {
    const onExpired = () => {
      setAuthed(false);
      navigate('/login', {
        replace: true,
        state: { message: 'Your session has expired. Please log in again.', from: location.pathname },
      });
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [navigate, location.pathname]);

  if (!authed) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
};
