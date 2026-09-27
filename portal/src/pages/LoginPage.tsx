import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { hasAdminSession, login } from '../api/client';

interface LoginLocationState {
  message?: string;
  from?: string;
}

const inputStyle: React.CSSProperties = {
  padding: '0.75rem', borderRadius: '8px', border: '1px solid #0f3460', background: '#1a1a2e', color: '#e0e0e0',
};

export const LoginPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state || {}) as LoginLocationState;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (hasAdminSession()) {
    return <Navigate to={state.from || '/'} replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email, password);
      navigate(state.from && state.from !== '/login' ? state.from : '/', { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#1a1a2e' }}>
      <form onSubmit={handleLogin} aria-labelledby="portal-login-title" style={{
        background: '#16213e', padding: '2rem', borderRadius: '12px', width: '100%', maxWidth: '400px',
        display: 'flex', flexDirection: 'column', gap: '1rem'
      }}>
        <h2 id="portal-login-title" style={{ color: '#e0e0e0', textAlign: 'center', marginBottom: '1rem' }}>Portal Login</h2>
        {state.message && !error && (
          <div role="status" style={{ color: '#c0a0ff', fontSize: '0.9rem', textAlign: 'center' }}>{state.message}</div>
        )}
        {error && <div role="alert" style={{ color: '#e06060', fontSize: '0.9rem', textAlign: 'center' }}>{error}</div>}
        <label htmlFor="portal-email" style={{ color: '#a0a0a0', fontSize: '0.85rem' }}>Admin email</label>
        <input
          id="portal-email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={inputStyle}
        />
        <label htmlFor="portal-password" style={{ color: '#a0a0a0', fontSize: '0.85rem' }}>Password</label>
        <input
          id="portal-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={inputStyle}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '0.75rem', borderRadius: '8px', border: 'none', background: '#533483',
            color: '#fff', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </div>
  );
};
