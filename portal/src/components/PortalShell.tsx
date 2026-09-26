import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: '📊' },
  { to: '/population', label: 'Population', icon: '👥' },
  { to: '/grader', label: 'Grader', icon: '⚖️' },
  { to: '/memory', label: 'Memory', icon: '🧠' },
  { to: '/probes', label: 'Probes', icon: '🧪' },
  { to: '/graph', label: 'Graph', icon: '🕸️' },
  { to: '/sources', label: 'Sources', icon: '📚' },
  { to: '/generation', label: 'Generation', icon: '⚙️' },
  { to: '/clusters', label: 'Clusters', icon: '🧲' },
  { to: '/evaluation', label: 'Evaluation', icon: '🎯' },
  { to: '/export', label: 'Export', icon: '📤' },
];

export const PortalShell: React.FC = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('portal_token');
    navigate('/login');
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#1a1a2e' }}>
      <aside style={{
        width: '240px', background: '#16213e', padding: '1.5rem 1rem',
        borderRight: '1px solid #0f3460', display: 'flex', flexDirection: 'column',
      }}>
        <h2 style={{ color: '#e0e0e0', fontSize: '1.25rem', marginBottom: '2rem', padding: '0 0.5rem' }}>
          🧠 Kaizou<br/>
          <span style={{ fontSize: '0.75rem', color: '#808080' }}>Management Portal</span>
        </h2>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.6rem 0.75rem', borderRadius: '8px',
                color: isActive ? '#e0e0e0' : '#808080',
                background: isActive ? '#0f3460' : 'transparent',
                textDecoration: 'none', fontSize: '0.9rem',
                transition: 'all 0.2s',
              })}
            >
              <span>{item.icon}</span> {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={handleLogout}
          style={{
            background: 'transparent', border: '1px solid #533483', color: '#808080',
            padding: '0.5rem', borderRadius: '8px', cursor: 'pointer', marginTop: '1rem',
          }}
        >
          Logout
        </button>
      </aside>
      <main style={{ flex: 1, padding: '2rem', overflow: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
};
