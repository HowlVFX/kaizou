import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';

export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useApp();

  useEffect(() => {
    // 1. Grab the tokens from the URL that Express sent us
    const accessToken = searchParams.get('accessToken');
    const refreshToken = searchParams.get('refreshToken');

    if (accessToken && refreshToken) {
      // 2. Save them to localStorage so they persist across page reloads
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);

      // 3. Log the user in and send them to the Brain page
      login();
      navigate('/brain');
    } else {
      // If we hit this page without tokens, something went wrong
      navigate('/login?error=oauth_failed');
    }
  }, [searchParams, navigate, login]);

  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#080C12', color: '#fff' }}>
      <h2>Authenticating...</h2>
    </div>
  );
}
