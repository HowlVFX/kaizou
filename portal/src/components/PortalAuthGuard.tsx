import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export const PortalAuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('portal_token');
    if (!token) {
      navigate('/login');
      return;
    }
    // Verify token by making a test request
    fetch('/api/management/overview', {
      headers: { 'Authorization': `Bearer ${token}` },
    }).then(res => {
      if (res.ok) setAuthed(true);
      else { localStorage.removeItem('portal_token'); navigate('/login'); }
    }).catch(() => { navigate('/login'); });
  }, [navigate]);

  if (authed === null) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#e0e0e0' }}>Loading...</div>;
  }
  return <>{children}</>;
};
