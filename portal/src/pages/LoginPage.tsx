import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/management/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        throw new Error('Invalid credentials');
      }
      const data = await res.json();
      localStorage.setItem('portal_token', data.token);
      navigate('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#1a1a2e' }}>
      <form onSubmit={handleLogin} style={{
        background: '#16213e', padding: '2rem', borderRadius: '12px', width: '100%', maxWidth: '400px',
        display: 'flex', flexDirection: 'column', gap: '1rem'
      }}>
        <h2 style={{ color: '#e0e0e0', textAlign: 'center', marginBottom: '1rem' }}>Portal Login</h2>
        {error && <div style={{ color: '#e06060', fontSize: '0.9rem', textAlign: 'center' }}>{error}</div>}
        <input
          type="email"
          placeholder="Admin Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid #0f3460', background: '#1a1a2e', color: '#e0e0e0' }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid #0f3460', background: '#1a1a2e', color: '#e0e0e0' }}
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
