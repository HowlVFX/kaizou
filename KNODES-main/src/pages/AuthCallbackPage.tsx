import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { api, setTokens } from '../lib/api';

// The OAuth code is single-use; StrictMode double-invokes effects, so dedupe per code
// at module level (survives the dev-only unmount/remount).
const exchanges = new Map<string, Promise<boolean>>();

function exchangeCode(code: string): Promise<boolean> {
  let p = exchanges.get(code);
  if (!p) {
    p = api<{ accessToken?: string; refreshToken?: string }>('/api/oauth/exchange', {
      method: 'POST',
      body: { code },
      auth: false,
    })
      .then(data => {
        if (!data?.accessToken || !data.refreshToken) return false;
        setTokens(data.accessToken, data.refreshToken);
        return true;
      })
      .catch(() => false);
    exchanges.set(code, p);
  }
  return p;
}

export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useApp();

  useEffect(() => {
    const error = searchParams.get('error');
    const code = searchParams.get('code');
    if (error || !code) {
      navigate(`/login?error=${encodeURIComponent(error || 'oauth_failed')}`, { replace: true });
      return;
    }
    let cancelled = false;
    exchangeCode(code).then(ok => {
      if (cancelled) return;
      if (ok) {
        login();
        navigate('/brain', { replace: true });
      } else {
        navigate('/login?error=oauth_failed', { replace: true });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [searchParams, navigate, login]);

  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#080C12', color: '#fff' }}>
      <h2>Authenticating...</h2>
    </div>
  );
}
