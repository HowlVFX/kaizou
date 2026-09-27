import React, { useEffect, useState, type ReactNode, type FormEvent } from 'react';
import { hasGate, enterGate, GATE_REQUIRED_EVENT } from '../api/client';

// Shared site gate in front of the ENTIRE management portal (a dev-site splash
// before the admin login). Verified server-side on every admin call, so it
// can't be bypassed by editing client state.
export const PortalGate: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [cleared, setCleared] = useState<boolean>(() => hasGate());
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onExpired = () => setCleared(false);
    window.addEventListener(GATE_REQUIRED_EVENT, onExpired);
    return () => window.removeEventListener(GATE_REQUIRED_EVENT, onExpired);
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await enterGate(username.trim(), password);
      setCleared(true);
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Incorrect access credentials.');
    } finally {
      setBusy(false);
    }
  };

  if (cleared) return <>{children}</>;

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#1a1a2e' }}>
      <form onSubmit={submit} style={{
        background: '#16213e', padding: '2rem', borderRadius: '12px', width: '100%', maxWidth: '380px',
        display: 'flex', flexDirection: 'column', gap: '0.9rem',
      }}>
        <h2 style={{ color: '#e0e0e0', textAlign: 'center', margin: 0 }}>Restricted</h2>
        <p style={{ color: '#808080', fontSize: '0.85rem', textAlign: 'center', margin: 0 }}>
          Enter the access credentials to continue.
        </p>
        {error && <div role="alert" style={{ color: '#e06060', fontSize: '0.9rem', textAlign: 'center' }}>{error}</div>}
        <label htmlFor="gate-user" style={label}>Username</label>
        <input id="gate-user" autoFocus autoComplete="off" value={username}
          onChange={(e) => setUsername(e.target.value)} required style={input} />
        <label htmlFor="gate-pass" style={label}>Password</label>
        <input id="gate-pass" type="password" autoComplete="off" value={password}
          onChange={(e) => setPassword(e.target.value)} required style={input} />
        <button type="submit" disabled={busy} style={{
          padding: '0.75rem', borderRadius: '8px', border: 'none', background: '#533483',
          color: '#fff', fontWeight: 'bold', cursor: busy ? 'not-allowed' : 'pointer', marginTop: '0.4rem',
        }}>{busy ? 'Checking…' : 'Enter'}</button>
      </form>
    </div>
  );
};

const label: React.CSSProperties = { color: '#a0a0a0', fontSize: '0.85rem' };
const input: React.CSSProperties = {
  padding: '0.75rem', borderRadius: '8px', border: '1px solid #0f3460',
  background: '#1a1a2e', color: '#e0e0e0',
};
