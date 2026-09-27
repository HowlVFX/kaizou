import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { api, ApiError, setTokens } from '../lib/api';

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'Sign-in was cancelled. You can try again or use email and password.',
  invalid_state: 'Your sign-in session expired. Please try again.',
  no_code_provided: 'The sign-in provider did not return a code. Please try again.',
  email_not_verified: 'Your email with that provider is not verified. Verify it there, then try again.',
  github_oauth_failed: 'GitHub sign-in failed. Please try again.',
  google_oauth_failed: 'Google sign-in failed. Please try again.',
  oauth_failed: 'Sign-in failed. Please try again.',
};

function oauthErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return OAUTH_ERROR_MESSAGES[code] || 'Sign-in failed. Please try again.';
}
import { Eye, EyeOff, Check, ArrowRight } from '../components/Icon';

type Mode = 'login' | 'signup';

/* ── Demo nodes for interactive left panel ── */
const DEMO_NODES = [
  { id: 0, x: 28, y: 22, r: 8,  color: '#58CC02', recall: 92, label: 'JavaScript',  summary: 'High-level interpreted language powering the web.',        connections: 5 },
  { id: 1, x: 58, y: 12, r: 6,  color: '#1CB0F6', recall: 61, label: 'Hoisting',    summary: 'Declarations moved to the top of scope at parse time.',    connections: 2 },
  { id: 2, x: 80, y: 30, r: 7,  color: '#58CC02', recall: 78, label: 'Closure',     summary: 'Function retaining access to its lexical scope.',           connections: 3 },
  { id: 3, x: 52, y: 48, r: 10, color: '#FF9600', recall: 55, label: 'Scope',       summary: 'Region of code where a variable binding is accessible.',    connections: 6 },
  { id: 4, x: 18, y: 52, r: 6,  color: '#58CC02', recall: 84, label: 'DOM',         summary: 'Tree-shaped document model browsers expose to JavaScript.', connections: 3 },
  { id: 5, x: 38, y: 74, r: 7,  color: '#1CB0F6', recall: 67, label: 'Promises',    summary: 'Objects representing eventual completion of async ops.',     connections: 4 },
  { id: 6, x: 74, y: 65, r: 6,  color: '#FF4B4B', recall: 38, label: 'Async/Await', summary: 'Syntactic sugar over Promises for sequential async code.',  connections: 2 },
  { id: 7, x: 10, y: 34, r: 6,  color: '#FF9600', recall: 52, label: 'Events',      summary: 'Browser notifications triggered by user or system actions.', connections: 3 },
  { id: 8, x: 88, y: 14, r: 5,  color: '#58CC02', recall: 80, label: 'Prototype',   summary: 'Mechanism for inheritance between JS objects.',              connections: 2 },
  { id: 9, x: 62, y: 86, r: 6,  color: '#1CB0F6', recall: 70, label: 'Modules',     summary: 'ES6 system for splitting code into reusable files.',         connections: 3 },
  { id: 10, x: 22, y: 80, r: 5, color: '#58CC02', recall: 88, label: 'Array',       summary: 'Ordered collection with built-in iteration methods.',        connections: 2 },
  { id: 11, x: 44, y: 28, r: 6, color: '#FF9600', recall: 45, label: 'this',        summary: 'Context-dependent reference to the calling object.',         connections: 4 },
];
const DEMO_EDGES = [
  [0,1],[0,2],[0,3],[0,4],[1,3],[2,3],[3,5],[3,6],[4,7],[5,9],[2,8],[6,5],[3,11],[0,11],[4,10],[9,10],
];

function recallColor(r: number) {
  if (r >= 75) return '#58CC02';
  if (r >= 50) return '#FF9600';
  return '#FF4B4B';
}
function recallLabel(r: number) {
  if (r >= 75) return 'Healthy';
  if (r >= 50) return 'Weakening';
  return 'Needs Review';
}

function InteractiveGraph({ selectedId, onSelect }: { selectedId: number | null; onSelect: (id: number) => void }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT(v => v + 0.014), 50);
    return () => clearInterval(id);
  }, []);

  return (
    <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, cursor: 'default' }} preserveAspectRatio="xMidYMid slice">
      <defs>
        {DEMO_NODES.map(n => (
          <radialGradient key={n.id} id={`glow-${n.id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={n.color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={n.color} stopOpacity="0" />
          </radialGradient>
        ))}
      </defs>

      {/* Edges */}
      {DEMO_EDGES.map(([a, b], i) => {
        const na = DEMO_NODES[a], nb = DEMO_NODES[b];
        const faY = Math.sin(t + a * 1.3) * 1.2;
        const fbY = Math.sin(t + b * 0.9) * 1.2;
        const isActive = selectedId === a || selectedId === b;
        return (
          <line key={i}
            x1={na.x} y1={na.y + faY} x2={nb.x} y2={nb.y + fbY}
            stroke={isActive ? DEMO_NODES[a].color : 'rgba(255,255,255,0.07)'}
            strokeWidth={isActive ? '0.7' : '0.4'}
            opacity={selectedId !== null && !isActive ? 0.2 : 1}
            style={{ transition: 'opacity 0.3s, stroke 0.3s' }}
          />
        );
      })}

      {/* Nodes */}
      {DEMO_NODES.map(n => {
        const fy = Math.sin(t + n.id * 1.1) * 1.5;
        const isSelected = selectedId === n.id;
        const isDimmed = selectedId !== null && !isSelected;
        const connectedToSelected = selectedId !== null && DEMO_EDGES.some(([a, b]) =>
          (a === selectedId && b === n.id) || (b === selectedId && a === n.id)
        );
        const dimmed = isDimmed && !connectedToSelected;
        return (
          <g key={n.id} transform={`translate(${n.x}, ${n.y + fy})`}
            style={{ cursor: 'pointer', opacity: dimmed ? 0.2 : 1, transition: 'opacity 0.3s' }}
            onClick={() => onSelect(n.id)}
          >
            {/* Glow halo */}
            {isSelected && <circle r={n.r + 6} fill={`url(#glow-${n.id})`} />}
            {/* Pulse ring on selected */}
            {isSelected && (
              <circle r={n.r + 3} fill="none" stroke={n.color} strokeWidth="0.6" opacity="0.5"
                style={{ animation: 'recallPulse 2s ease-in-out infinite' }} />
            )}
            {/* Body */}
            <circle r={n.r} fill={n.color} opacity={isSelected ? 0.25 : 0.12} />
            <circle r={n.r - 1} fill="none" stroke={n.color} strokeWidth={isSelected ? 1 : 0.6}
              opacity={isSelected ? 0.9 : 0.5} />
            {/* Core dot */}
            <circle r={isSelected ? 3 : 2} fill={n.color} opacity="0.95" />
            {/* Label */}
            <text y={n.r + 4} textAnchor="middle" fontSize={isSelected ? '3.2' : '2.6'}
              fill={isSelected ? '#fff' : 'rgba(255,255,255,0.35)'}
              fontWeight={isSelected ? '600' : '400'}
              style={{ userSelect: 'none', transition: 'font-size 0.2s' }}>
              {n.label}
            </text>
            {/* Recall dot */}
            <circle cx={n.r * 0.65} cy={-n.r * 0.65} r={1.8} fill={recallColor(n.recall)} />
          </g>
        );
      })}
    </svg>
  );
}

function NodeDetailCard({ nodeId, onDismiss }: { nodeId: number; onDismiss: () => void }) {
  const node = DEMO_NODES[nodeId];
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 20); return () => clearTimeout(t); }, [nodeId]);

  const connected = DEMO_EDGES
    .filter(([a, b]) => a === nodeId || b === nodeId)
    .map(([a, b]) => DEMO_NODES[a === nodeId ? b : a]);

  const rc = recallColor(node.recall);
  const rl = recallLabel(node.recall);
  const circumference = 2 * Math.PI * 22;
  const dash = (node.recall / 100) * circumference;

  return (
    <div style={{
      position: 'absolute', bottom: 32, left: '50%',
      transform: mounted ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(20px)',
      opacity: mounted ? 1 : 0,
      transition: 'transform 0.35s cubic-bezier(0.16,1,0.3,1), opacity 0.25s ease',
      width: 'min(420px, 90%)',
      background: 'rgba(8,12,18,0.82)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      border: `1px solid ${rc}40`,
      borderRadius: 16,
      boxShadow: `0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.05)`,
      padding: '20px 22px',
      zIndex: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        {/* Recall ring */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <svg width={56} height={56} viewBox="0 0 56 56">
            <circle cx={28} cy={28} r={22} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={3} />
            <circle cx={28} cy={28} r={22} fill="none" stroke={rc} strokeWidth={3}
              strokeDasharray={`${dash} ${circumference}`}
              strokeLinecap="round"
              transform="rotate(-90 28 28)"
              style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.16,1,0.3,1)' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: rc, lineHeight: 1 }}>{node.recall}%</span>
          </div>
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>{node.label}</div>
              <div style={{ fontSize: 11, color: rc, fontWeight: 600, marginTop: 2 }}>{rl}</div>
            </div>
            <button onClick={onDismiss} style={{ background: 'rgba(255,255,255,0.07)', border: 'none', borderRadius: 6, width: 26, height: 26, cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
          </div>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: '8px 0 12px', lineHeight: 1.55 }}>{node.summary}</p>

          {/* Recall bar */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recall Strength</span>
              <span style={{ fontSize: 10, color: rc, fontWeight: 600 }}>{node.recall}/100</span>
            </div>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${node.recall}%`, background: `linear-gradient(90deg, ${rc}88, ${rc})`, borderRadius: 2, transition: 'width 0.8s cubic-bezier(0.16,1,0.3,1)' }} />
            </div>
          </div>

          {/* Connected nodes */}
          <div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Connected · {connected.length}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {connected.map(c => (
                <span key={c.id} style={{ padding: '3px 9px', borderRadius: 5, fontSize: 11, background: `${recallColor(c.recall)}15`, color: recallColor(c.recall), border: `0.8px solid ${recallColor(c.recall)}40`, fontWeight: 500 }}>
                  {c.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function useVW() {
  const [vw, setVw] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setVw(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return vw;
}

export default function AuthPage({ mode: initialMode }: { mode: Mode }) {
  const navigate = useNavigate();
  const { login } = useApp();
  const [mode, setMode] = useState<Mode>(initialMode);
  const vw = useVW();
  const isMobile = vw < 640;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const [errors, setErrors] = useState<Record<string, string>>(() => {
    const msg = oauthErrorMessage(searchParams.get('error'));
    const init: Record<string, string> = {};
    if (msg) init.general = msg;
    return init;
  });

  // Drop ?error= from the URL once shown so a refresh doesn't repeat it.
  useEffect(() => {
    if (searchParams.get('error')) {
      const next = new URLSearchParams(searchParams);
      next.delete('error');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);

  const clear = () => { setErrors({}); setName(''); setEmail(''); setPassword(''); setSuccess(false); setLoading(false); };
  const switchMode = (m: Mode) => { setMode(m); clear(); };

  const validate = () => {
    const e: Record<string, string> = {};
    if (mode === 'signup' && !name.trim()) e.name = 'Required';
    if (!email.trim()) e.email = 'Required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Invalid email';
    if (!password) e.password = 'Required';
    else if (password.length < 6) e.password = 'Min 6 characters';
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    setErrors({});

    try {
      const body = mode === 'login'
        ? { email: email.trim(), password }
        : { email: email.trim(), password, name: name.trim() };
      const data = await api<{ accessToken?: string; refreshToken?: string }>(
        `/api/auth/${mode === 'login' ? 'login' : 'signup'}`,
        { method: 'POST', body, auth: false },
      );
      if (!data?.accessToken) {
        setErrors({ general: 'Something went wrong. Please try again.' });
        setLoading(false);
        return;
      }
      setTokens(data.accessToken, data.refreshToken);
    } catch (err) {
      let msg = 'Something went wrong. Please try again.';
      if (err instanceof ApiError) {
        if (err.status === 0) msg = 'Could not reach the server. Is the API running?';
        else if (err.status === 401) msg = 'Invalid email or password';
        else if (err.status === 403) msg = err.message || 'This email is not approved for signup. Ask an administrator for access.';
        else if (err.status === 409) msg = 'An account with this email already exists';
        else msg = err.message || msg;
      }
      setErrors({ general: msg });
      setLoading(false);
      return;
    }

    setSuccess(true);
    await new Promise(r => setTimeout(r, 550));
    login();
    navigate('/brain');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#080C12', color: '#fff', fontFamily: 'Inter, sans-serif', overflow: 'hidden', position: 'relative' }}>

      {/* ── Full-bleed graph background ── */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <InteractiveGraph selectedId={selectedNodeId} onSelect={id => setSelectedNodeId(prev => prev === id ? null : id)} />
      </div>
      {/* Right-side fade so form card pops */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(8,12,18,0.1) 0%, rgba(8,12,18,0.45) 55%, rgba(8,12,18,0.82) 100%)', pointerEvents: 'none' }} />

      {/* Logo top-left */}
      <div style={{ position: 'absolute', top: isMobile ? 20 : 32, left: isMobile ? '50%' : 36, transform: isMobile ? 'translateX(-50%)' : 'none', zIndex: 20, cursor: 'pointer' }} onClick={() => navigate('/')}>
        <span style={{ fontFamily: "'Anurati', sans-serif", fontSize: isMobile ? 16 : 18, letterSpacing: '7px', color: '#fff', opacity: 0.9 }}>KNODES</span>
      </div>

      {/* Bottom-left headline — hidden on mobile (form sheet covers it) */}
      {!isMobile && <div style={{ position: 'absolute', bottom: 40, left: 36, zIndex: 20, maxWidth: 380 }}>
        <h2 style={{ fontSize: 'clamp(24px, 2.6vw, 40px)', fontWeight: 800, margin: '0 0 12px', lineHeight: 1.1, letterSpacing: '-0.03em' }}>
          {mode === 'login'
            ? <>Your Brain<br /><span style={{ color: '#58CC02' }}>is waiting.</span></>
            : <>Knowledge<br /><span style={{ color: '#58CC02' }}>connected.</span></>
          }
        </h2>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', margin: '0 0 14px', lineHeight: 1.6 }}>Click any node to explore.</p>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {[{ value: '12', label: 'Concepts' }, { value: '92%', label: 'Top recall' }, { value: '3', label: 'Need review' }].map(({ value, label }) => (
            <div key={label} style={{ background: 'rgba(255,255,255,0.06)', border: '0.8px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '5px 11px', backdropFilter: 'blur(8px)' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#58CC02' }}>{value}</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginLeft: 6 }}>{label}</span>
            </div>
          ))}
        </div>
      </div>}

      {/* Node detail card */}
      {selectedNodeId !== null && (
        <NodeDetailCard nodeId={selectedNodeId} onDismiss={() => setSelectedNodeId(null)} />
      )}

      {/* ── Floating glass form — pinned right (desktop) / full screen (mobile) ── */}
      <div style={isMobile ? {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: '0', zIndex: 20,
      } : {
        position: 'absolute', top: 0, right: 0, bottom: 0,
        width: 420, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '32px 28px', zIndex: 20,
      }}>
      <div style={isMobile ? {
        width: '100%',
        background: 'rgba(8,12,18,0.96)',
        backdropFilter: 'blur(32px)',
        WebkitBackdropFilter: 'blur(32px)',
        borderTop: '0.8px solid rgba(255,255,255,0.12)',
        borderRadius: '24px 24px 0 0',
        padding: '28px 24px 36px',
        maxHeight: '88vh',
        overflowY: 'auto',
      } : {
        width: '100%',
        background: 'rgba(13,17,23,0.6)',
        backdropFilter: 'blur(32px)',
        WebkitBackdropFilter: 'blur(32px)',
        border: '0.8px solid rgba(255,255,255,0.1)',
        borderRadius: 20,
        boxShadow: '0 32px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.07)',
        padding: '36px 36px 30px',
      }}>
        {/* Mode toggle */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 4, marginBottom: 32 }}>
          {(['login', 'signup'] as const).map(m => (
            <button key={m} onClick={() => switchMode(m)} style={{
              flex: 1, padding: '9px', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 14, fontWeight: 500, transition: 'all 0.15s',
              background: mode === m ? 'rgba(255,255,255,0.1)' : 'transparent',
              color: mode === m ? '#fff' : 'rgba(255,255,255,0.38)',
            }}>
              {m === 'login' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        <div style={{ marginBottom: 26 }}>
          <h3 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 5px', letterSpacing: '-0.02em' }}>
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </h3>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)', margin: 0 }}>
            {mode === 'login' ? 'Sign in to access your Brain' : 'Start building your knowledge graph'}
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {mode === 'signup' && (
              <AuthField label="Name" type="text" value={name} onChange={setName} error={errors.name} placeholder="Chirag" autoFocus />
            )}
            <AuthField label="Email" type="email" value={email} onChange={setEmail} error={errors.email} placeholder="chirag@example.com" autoFocus={mode === 'login'} />
            <AuthField
              label="Password"
              type={showPw ? 'text' : 'password'}
              value={password} onChange={setPassword}
              error={errors.password}
              placeholder={mode === 'login' ? '••••••••' : 'Min. 6 characters'}
              suffix={
                <button type="button" onClick={() => setShowPw(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: '0 2px', display: 'flex' }}>
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              }
            />

            {errors.general && (
              <div style={{ background: 'rgba(255,75,75,0.1)', border: '0.8px solid #FF4B4B', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#FF4B4B', animation: 'fadeUp 0.2s ease' }}>
                {errors.general}
              </div>
            )}

            <button
              type="submit" disabled={loading || success}
              style={{
                marginTop: 4, padding: '13px', borderRadius: 10, border: 'none',
                cursor: loading || success ? 'default' : 'pointer',
                background: success ? '#58CC02' : loading ? 'rgba(88,204,2,0.35)' : '#58CC02',
                color: '#fff', fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.2s',
              }}
            >
              {success
                ? <><Check size={16} strokeWidth={2.5} /> Entering Brain...</>
                : loading ? <LoadingDots />
                : <>{mode === 'login' ? 'Sign In' : 'Create Account'} <ArrowRight size={16} /></>
              }
            </button>
          </div>
        </form>

        <div style={{ marginTop: 22, textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.32)' }}>
          {mode === 'login'
            ? <>No account?{' '}<span onClick={() => switchMode('signup')} style={{ color: '#58CC02', cursor: 'pointer', fontWeight: 600 }}>Sign up free</span></>
            : <>Have an account?{' '}<span onClick={() => switchMode('login')} style={{ color: '#58CC02', cursor: 'pointer', fontWeight: 600 }}>Sign in</span></>
          }
        </div>
        <div style={{ marginTop: 10, textAlign: 'center' }}>
          <span onClick={() => navigate('/')} style={{ fontSize: 12, color: 'rgba(255,255,255,0.18)', cursor: 'pointer' }}>← Back to home</span>
        </div>
      </div>{/* glass card */}
      </div>{/* right column */}
    </div>
  );
}

function AuthField({ label, type, value, onChange, error, placeholder, autoFocus, suffix }: {
  label: string; type: string; value: string; onChange: (v: string) => void;
  error?: string; placeholder?: string; autoFocus?: boolean; suffix?: React.ReactNode;
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: 6, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          type={type} value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} autoFocus={autoFocus}
          style={{
            width: '100%', padding: suffix ? '11px 42px 11px 14px' : '11px 14px',
            borderRadius: 9, background: 'rgba(255,255,255,0.05)',
            border: `1px solid ${error ? '#FF4B4B' : 'rgba(255,255,255,0.1)'}`,
            color: '#fff', fontSize: 14, fontFamily: 'inherit', outline: 'none',
            transition: 'border-color 0.15s', boxSizing: 'border-box',
          }}
          onFocus={e => { if (!error) e.currentTarget.style.borderColor = 'rgba(88,204,2,0.55)'; }}
          onBlur={e => { if (!error) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
        />
        {suffix && <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}>{suffix}</div>}
      </div>
      {error && <div style={{ marginTop: 4, fontSize: 12, color: '#FF4B4B', animation: 'fadeUp 0.15s ease' }}>{error}</div>}
    </div>
  );
}

function LoadingDots() {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', animation: `dotBounce 1.2s ${i * 0.2}s ease-in-out infinite` }} />
      ))}
    </div>
  );
}
