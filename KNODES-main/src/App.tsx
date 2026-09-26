import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import AppShell from './components/AppShell';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import BrainPage from './pages/BrainPage';
import NotesPage from './pages/NotesPage';
import RetestPage from './pages/RetestPage';
import InsightsPage from './pages/InsightsPage';
import ProfilePage from './pages/ProfilePage';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoggedIn } = useApp();
  if (!isLoggedIn) return <Navigate to="/" replace />;
  return <AppShell>{children}</AppShell>;
}

function AppRoutes() {
  const { isLoggedIn } = useApp();
  return (
    <Routes>
      <Route path="/" element={isLoggedIn ? <Navigate to="/brain" replace /> : <LandingPage />} />
      <Route path="/login" element={isLoggedIn ? <Navigate to="/brain" replace /> : <AuthPage mode="login" />} />
      <Route path="/signup" element={isLoggedIn ? <Navigate to="/brain" replace /> : <AuthPage mode="signup" />} />
      <Route path="/auth-callback" element={<AuthCallbackPage />} />
      <Route path="/brain" element={<AuthGuard><BrainPage /></AuthGuard>} />
      <Route path="/notes" element={<AuthGuard><NotesPage /></AuthGuard>} />
      <Route path="/retest" element={<AuthGuard><RetestPage /></AuthGuard>} />
      <Route path="/insights" element={<AuthGuard><InsightsPage /></AuthGuard>} />
      <Route path="/profile" element={<AuthGuard><ProfilePage /></AuthGuard>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppProvider>
  );
}
