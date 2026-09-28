import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { hasAdminSession, login, signup } from '../api/client';

interface LoginLocationState {
  message?: string;
  from?: string;
}

const inputStyle: React.CSSProperties = {
  padding: '0.75rem', borderRadius: '8px', border: '1px solid #0f3460', background: '#1a1a2e', color: '#e0e0e0',
};

const MIN_PASSWORD = 8; // matches the server's admin password rule

// Management access is allowlist-only: an email must be on the signup
// allowlist (managed on the Access page) to create an account or log in.
export const LoginPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state || {}) as LoginLocationState;

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (hasAdminSession()) {
    return <Navigate to={state.from || '/'} replace />;
  }

  const isSignup = mode === 'signup';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSignup && password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (isSignup) await signup(email, password, name.trim() || undefined);
      else await login(email, password);
      navigate(state.from && state.from !== '/login' ? state.from : '/', { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : isSignup ? 'Sign up failed.' : 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode(isSignup ? 'login' : 'signup');
    setError(null);
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#1a1a2e' }}>
      <form onSubmit={handleSubmit} aria-labelledby="portal-login-title" style={{
        background: '#16213e', padding: '2rem', borderRadius: '12px', width: '100%', maxWidth: '400px',
        display: 'flex', flexDirection: 'column', gap: '1rem'
      }}>
        <h2 id="portal-login-title" style={{ color: '#e0e0e0', textAlign: 'center', marginBottom: '0.25rem' }}>
          {isSignup ? 'Portal Sign Up' : 'Portal Login'}
        </h2>
        <p style={{ color: '#a0a0a0', fontSize: '0.8rem', textAlign: 'center', margin: 0 }}>
          Management access is limited to emails on the allowlist.
        </p>
        {state.message && !error && (
          <div role="status" style={{ color: '#c0a0ff', fontSize: '0.9rem', textAlign: 'center' }}>{state.message}</div>
        )}
        {error && <div role="alert" style={{ color: '#e06060', fontSize: '0.9rem', textAlign: 'center' }}>{error}</div>}
        {isSignup && (
          <>
            <label htmlFor="portal-name" style={{ color: '#a0a0a0', fontSize: '0.85rem' }}>Name (optional)</label>
            <input
              id="portal-name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
            />
          </>
        )}
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
        <label htmlFor="portal-password" style={{ color: '#a0a0a0', fontSize: '0.85rem' }}>
          Password{isSignup ? ` (at least ${MIN_PASSWORD} characters)` : ''}
        </label>
        <input
          id="portal-password"
          type="password"
          autoComplete={isSignup ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={isSignup ? MIN_PASSWORD : undefined}
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
          {loading ? (isSignup ? 'Creating account...' : 'Logging in...') : (isSignup ? 'Sign up' : 'Login')}
        </button>
        <button
          type="button"
          onClick={switchMode}
          style={{ background: 'none', border: 'none', color: '#c0a0ff', cursor: 'pointer', fontSize: '0.85rem' }}
        >
          {isSignup ? 'Already have an account? Log in' : 'Allowlisted but no account yet? Sign up'}
        </button>
      </form>
    </div>
  );
};
