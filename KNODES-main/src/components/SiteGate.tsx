import { useState, useEffect, type ReactNode, type FormEvent } from 'react';
import { getGateToken, clearGate, onGateRequired, describeApiError } from '../lib/api';

// Global site gate: a shared username/password that must be cleared before ANY
// of the app renders (a dev-site splash gate, not per-user identity). The token
// is verified server-side on every API call, so this screen can't be bypassed
// by editing client state — an ungated session simply can't load data.
export default function SiteGate({ children }: { children: ReactNode }) {
  const [cleared, setCleared] = useState<boolean>(() => !!getGateToken());
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // If the server later reports the gate expired, drop back to this screen.
  useEffect(() => onGateRequired(() => setCleared(false)), []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await clearGate(username.trim(), password);
      setCleared(true);
      setPassword('');
    } catch (err) {
      setError(describeApiError(err, 'Incorrect access credentials.'));
    } finally {
      setBusy(false);
    }
  };

  if (cleared) return <>{children}</>;

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#080C12', color: '#fff', fontFamily: 'Inter, system-ui, sans-serif', padding: 20,
    }}>
      <form onSubmit={submit} style={{
        width: '100%', maxWidth: 360, background: 'rgba(13,17,23,0.7)',
        border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '32px 28px',
        display: 'flex', flexDirection: 'column', gap: 14,
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)', backdropFilter: 'blur(20px)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 6 }}>
          <div style={{ fontFamily: "'Anurati', sans-serif", fontSize: 22, letterSpacing: '8px', opacity: 0.9 }}>KAIZOU</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 8 }}>This is a private preview. Enter the access credentials to continue.</div>
        </div>
        <label htmlFor="gate-user" style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Username</label>
        <input
          id="gate-user" autoFocus autoComplete="off" value={username}
          onChange={e => setUsername(e.target.value)}
          style={inputStyle}
        />
        <label htmlFor="gate-pass" style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Password</label>
        <input
          id="gate-pass" type="password" autoComplete="off" value={password}
          onChange={e => setPassword(e.target.value)}
          style={inputStyle}
        />
        {error && <div role="alert" style={{ fontSize: 13, color: '#FF4B4B' }}>{error}</div>}
        <button
          type="submit" disabled={busy || !username.trim() || !password}
          style={{
            marginTop: 6, padding: '12px', borderRadius: 10, border: 'none',
            background: '#58CC02', color: '#fff', fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
            cursor: busy || !username.trim() || !password ? 'default' : 'pointer',
            opacity: busy || !username.trim() || !password ? 0.6 : 1,
          }}
        >{busy ? 'Checking…' : 'Enter'}</button>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '11px 13px', borderRadius: 9, background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 14,
  fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
};
