import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Brain, NotesIcon, Target, BarChart, User, Sun, Moon } from './Icon';

const NAV_ITEMS = [
  { path: '/brain', Icon: Brain, label: 'Brain' },
  { path: '/notes', Icon: NotesIcon, label: 'Notes' },
  { path: '/retest', Icon: Target, label: 'Retest' },
  { path: '/insights', Icon: BarChart, label: 'Insights' },
];

interface Props {
  children: React.ReactNode;
}

function useViewport() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return width;
}

export default function AppShell({ children }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme, user } = useApp();
  const vw = useViewport();
  const isMobile = vw < 640;

  const isActive = (path: string) => location.pathname === path;
  const [hoveredNav, setHoveredNav] = useState<string | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>
      {/* Header */}
      <header style={{
        height: 52,
        background: 'var(--bg-sidebar)',
        borderBottom: '0.8px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', flexShrink: 0,
      }}>
        <span
          onClick={() => navigate('/brain')}
          style={{
            fontFamily: "'Anurati', sans-serif",
            fontSize: 22,
            letterSpacing: '8px',
            color: 'var(--text)',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          KAIZOU
        </span>

        {/* Theme toggle */}
        <div
          style={{ position: 'absolute', right: 16 }}
          onMouseEnter={() => setHoveredNav('theme')}
          onMouseLeave={() => setHoveredNav(null)}
        >
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            style={{
              background: 'var(--bg-input)',
              border: '0.8px solid var(--border)',
              color: 'var(--text-muted)', borderRadius: 20,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28,
            }}
          >
            {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
          </button>
          {hoveredNav === 'theme' && !isMobile && (
            <div style={{
              position: 'absolute', right: 34, top: '50%', transform: 'translateY(-50%)',
              background: 'var(--bg-elevated)', border: '0.8px solid var(--border)',
              borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 600,
              color: 'var(--text-2)', whiteSpace: 'nowrap', pointerEvents: 'none',
              boxShadow: 'var(--shadow)', zIndex: 100, animation: 'fadeIn 0.12s ease',
            }}>
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </div>
          )}
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar — hidden on mobile */}
        {!isMobile && (
          <aside style={{
            width: 54,
            background: 'var(--bg-sidebar)',
            borderRight: '0.8px solid var(--border)',
            display: 'flex', flexDirection: 'column',
            padding: '12px 4px',
            flexShrink: 0,
            gap: 4,
          }}>
            {NAV_ITEMS.map(({ path, Icon, label }) => {
              const active = isActive(path);
              const hovered = hoveredNav === path;
              return (
                <div
                  key={path}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 2, position: 'relative' }}
                  onMouseEnter={() => setHoveredNav(path)}
                  onMouseLeave={() => setHoveredNav(null)}
                >
                  <button
                    onClick={() => navigate(path)}
                    style={{
                      width: 42, height: 42,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: active ? 'rgba(88,204,2,0.15)' : hovered ? 'var(--bg-input)' : 'transparent',
                      color: active ? 'var(--green)' : hovered ? 'var(--text-2)' : 'var(--text-muted)',
                      transition: 'background 0.15s, color 0.15s',
                      padding: 10,
                    }}
                  >
                    <Icon size={18} strokeWidth={active ? 2 : 1.6} />
                  </button>
                  {hovered && (
                    <div style={{
                      position: 'absolute', left: 50, top: '50%', transform: 'translateY(-50%)',
                      background: 'var(--bg-elevated)', border: '0.8px solid var(--border)',
                      borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 600,
                      color: active ? 'var(--green)' : 'var(--text-2)', whiteSpace: 'nowrap',
                      pointerEvents: 'none', boxShadow: 'var(--shadow)', zIndex: 100, animation: 'fadeIn 0.12s ease',
                    }}>
                      {label}
                    </div>
                  )}
                </div>
              );
            })}

            <div style={{ flex: 1 }} />

            {/* Profile */}
            <div
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 2, position: 'relative' }}
              onMouseEnter={() => setHoveredNav('profile')}
              onMouseLeave={() => setHoveredNav(null)}
            >
              <button
                onClick={() => navigate('/profile')}
                style={{
                  width: 34, height: 34,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 24, border: `1px solid ${isActive('/profile') ? 'var(--green)' : 'var(--border-strong)'}`,
                  background: 'transparent', cursor: 'pointer', padding: 10,
                  color: isActive('/profile') ? 'var(--green)' : 'var(--text-muted)',
                  transition: 'border-color 0.15s, color 0.15s',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--text)';
                  (e.currentTarget as HTMLElement).style.color = 'var(--text)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = isActive('/profile') ? 'var(--green)' : 'var(--border-strong)';
                  (e.currentTarget as HTMLElement).style.color = isActive('/profile') ? 'var(--green)' : 'var(--text-muted)';
                }}
              >
                {user.avatarInitial ? (
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'inherit', fontFamily: 'Inter, sans-serif' }}>
                    {user.avatarInitial}
                  </span>
                ) : (
                  <User size={14} strokeWidth={1.6} />
                )}
              </button>
              {hoveredNav === 'profile' && (
                <div style={{
                  position: 'absolute', left: 50, top: '50%', transform: 'translateY(-50%)',
                  background: 'var(--bg-elevated)', border: '0.8px solid var(--border)',
                  borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 600,
                  color: isActive('/profile') ? 'var(--green)' : 'var(--text-2)', whiteSpace: 'nowrap',
                  pointerEvents: 'none', boxShadow: 'var(--shadow)', zIndex: 100, animation: 'fadeIn 0.12s ease',
                }}>
                  Profile
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Main content */}
        <main style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      {isMobile && (
        <nav style={{
          height: 56, background: 'var(--bg-sidebar)', borderTop: '0.8px solid var(--border)',
          display: 'flex', alignItems: 'center', flexShrink: 0,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}>
          {[...NAV_ITEMS, { path: '/profile', Icon: User, label: 'Profile' }].map(({ path, Icon, label }) => {
            const active = isActive(path);
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                style={{
                  flex: 1, height: '100%', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 3,
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  color: active ? 'var(--green)' : 'var(--text-muted)',
                  transition: 'color 0.15s',
                }}
              >
                <Icon size={20} strokeWidth={active ? 2 : 1.6} />
                <span style={{ fontSize: 9, fontWeight: active ? 700 : 400, fontFamily: 'inherit', letterSpacing: '0.03em' }}>
                  {label}
                </span>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
