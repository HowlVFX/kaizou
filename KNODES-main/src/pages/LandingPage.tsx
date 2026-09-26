import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link, Puzzle, TrendDown, Shuffle, ArrowUpRight, BarChart, NotesIcon, Target, Network, ArrowRight } from '../components/Icon';

function useVW() {
  const [vw, setVw] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setVw(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return vw;
}

const DEMO_NODES = [
  { id: 'js', label: 'JavaScript', x: 50, y: 40, recall: 92, r: 28 },
  { id: 'hoist', label: 'Hoisting', x: 25, y: 65, recall: 42, r: 22 },
  { id: 'scope', label: 'Scope', x: 68, y: 68, recall: 64, r: 20 },
  { id: 'var', label: 'var', x: 15, y: 82, recall: 58, r: 16 },
  { id: 'tdz', label: 'TDZ', x: 35, y: 85, recall: 37, r: 16 },
  { id: 'exec', label: 'Execution', x: 75, y: 50, recall: 88, r: 18 },
  { id: 'creation', label: 'Creation Phase', x: 10, y: 55, recall: null, r: 15 },
];

const DEMO_EDGES = [
  { s: 'js', t: 'hoist' }, { s: 'js', t: 'scope' }, { s: 'js', t: 'exec' },
  { s: 'hoist', t: 'var' }, { s: 'hoist', t: 'tdz' }, { s: 'hoist', t: 'creation', dashed: true },
];

const recallColor = (r: number | null) => {
  if (r === null) return '#6B7280';
  if (r >= 75) return '#58CC02';
  if (r >= 50) return '#FF9600';
  return '#FF4B4B';
};

function DemoGraph({ animated }: { animated: boolean }) {
  const [visibleNodes, setVisibleNodes] = useState<Set<string>>(new Set());
  const [visibleEdges, setVisibleEdges] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!animated) { DEMO_NODES.forEach(n => setVisibleNodes(prev => new Set([...prev, n.id]))); return; }
    const delays = [0, 400, 700, 900, 1100, 1300, 1500];
    const timers: number[] = [];
    DEMO_NODES.forEach((n, i) => {
      timers.push(window.setTimeout(() => setVisibleNodes(prev => new Set([...prev, n.id])), delays[i] || 200 * i));
    });
    DEMO_EDGES.forEach((_, i) => {
      timers.push(window.setTimeout(() => setVisibleEdges(prev => new Set([...prev, String(i)])), 1700 + i * 200));
    });
    return () => timers.forEach(clearTimeout);
  }, [animated]);

  return (
    <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
      <defs>
        <filter id="lp-glow">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {DEMO_EDGES.map((e, i) => {
        const src = DEMO_NODES.find(n => n.id === e.s)!;
        const tgt = DEMO_NODES.find(n => n.id === e.t)!;
        return (
          <line key={i} x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
            stroke={visibleEdges.has(String(i)) ? 'rgba(255,255,255,0.2)' : 'transparent'}
            strokeWidth={0.5} strokeDasharray={e.dashed ? '2,2' : 'none'}
            style={{ transition: 'stroke 0.5s' }}
          />
        );
      })}
      {DEMO_NODES.map(n => (
        <g key={n.id} transform={`translate(${n.x},${n.y})`}
          style={{ opacity: visibleNodes.has(n.id) ? 1 : 0, transition: 'opacity 0.4s' }}>
          <circle r={n.r / 10 + 2.5} fill="rgba(255,255,255,0.06)" stroke={recallColor(n.recall)}
            strokeWidth={0.5} filter="url(#lp-glow)" />
          {n.recall !== null && (
            <circle cx={n.r / 10 + 1} cy={-(n.r / 10 + 1)} r={1.2} fill={recallColor(n.recall)} />
          )}
          {n.recall === null && <text textAnchor="middle" dominantBaseline="central" fontSize={3} fill="#6B7280">🔒</text>}
          <text y={n.r / 10 + 4.5} textAnchor="middle" fontSize={2.5} fill="rgba(255,255,255,0.7)" fontWeight={500}>{n.label}</text>
        </g>
      ))}
    </svg>
  );
}

const FEATURES = [
  { Icon: Link, title: 'Connected Knowledge', desc: 'Your ideas become an interconnected graph of concepts, relationships, and prerequisites.' },
  { Icon: Puzzle, title: 'Structural Understanding', desc: 'See mechanisms, relationships, and missing evidence — not just isolated facts.' },
  { Icon: TrendDown, title: 'Recall & Decay', desc: 'Know what is strengthening and what needs review before you forget it.' },
  { Icon: Shuffle, title: 'Counterfactual Testing', desc: 'Explore what changes when part of a mechanism changes.' },
  { Icon: ArrowUpRight, title: 'Transfer', desc: 'Apply concepts beyond the original example to demonstrate real understanding.' },
  { Icon: BarChart, title: 'Learning Insights', desc: 'See patterns in your knowledge over time. Structural evidence, not fake scores.' },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const vw = useVW();
  const isMobile = vw < 640;

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const handleStart = () => { navigate('/signup'); };
  const handleSignIn = () => { navigate('/login'); };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        padding: isMobile ? '0 16px' : '0 40px',
        height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: scrolled ? 'rgba(17,24,39,0.9)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '1px solid var(--border)' : 'none',
        transition: 'all 0.3s',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: "'Anurati', sans-serif", fontSize: isMobile ? 16 : 20, letterSpacing: '6px', color: 'var(--text)' }}>KNODES</span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {!isMobile && (
            <button onClick={handleSignIn} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>Sign In</button>
          )}
          <button
            onClick={handleStart}
            style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--green)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit' }}
          >Start Building</button>
        </div>
      </header>

      {/* Hero */}
      <section style={{
        minHeight: '88vh', display: 'flex', alignItems: 'center',
        flexDirection: isMobile ? 'column' : 'row',
        padding: isMobile ? '32px 6% 48px' : '0 8%',
        gap: isMobile ? 32 : 48,
        maxWidth: 1280, margin: '0 auto', width: '100%',
        boxSizing: 'border-box',
      }}>
        <div style={{ flex: 1, maxWidth: isMobile ? 'none' : 540 }}>
          <div style={{
            display: 'inline-block', padding: '4px 12px', borderRadius: 20,
            background: 'var(--green-dim)', color: 'var(--green)',
            fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', marginBottom: 24,
          }}>Knowledge Learning System</div>
          <h1 style={{ fontSize: 'clamp(40px, 5vw, 68px)', fontWeight: 800, lineHeight: 1.1, margin: '0 0 24px', letterSpacing: '-0.03em', color: 'var(--text)' }}>
            Build Understanding,<br />
            <span style={{ color: 'var(--green)' }}>Not Just Notes.</span>
          </h1>
          <p style={{ fontSize: 18, color: 'var(--text-2)', lineHeight: 1.7, margin: '0 0 40px', maxWidth: 460 }}>
            KNODES turns what you learn into a connected knowledge graph, then helps you remember, explain, and test how that knowledge works.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              onClick={handleStart}
              style={{
                padding: '14px 28px', borderRadius: 10, background: 'var(--green)', color: '#fff',
                border: 'none', cursor: 'pointer', fontSize: 16, fontWeight: 700, fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 8, transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.88'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
            >
              Start Building Your Brain <ArrowRight size={16} />
            </button>
            <button
              onClick={handleSignIn}
              style={{ padding: '14px 24px', borderRadius: 10, background: 'var(--bg-elevated)', color: 'var(--text-2)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 16, fontWeight: 500, fontFamily: 'inherit' }}
            >Sign In</button>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 16 }}>Your knowledge, connected.</p>
        </div>

        {/* Hero graph */}
        <div style={{
          flex: isMobile ? 'none' : '0 0 auto',
          width: isMobile ? 'min(80vw, 320px)' : 'min(45%, 460px)',
          position: isMobile ? 'relative' : 'relative',
          paddingRight: isMobile ? 0 : 32,
          alignSelf: isMobile ? 'center' : undefined,
        }}>
          <div style={{
            width: '100%', aspectRatio: '1/1',
            background: 'radial-gradient(ellipse at center, rgba(88,204,2,0.06) 0%, transparent 70%)',
            borderRadius: '50%', position: 'relative',
            border: '1px solid var(--border)',
          }}>
            <DemoGraph animated={true} />
          </div>
          {/* Floating recall card */}
          {isMobile ? (
            <div style={{
              marginTop: 12,
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '10px 14px', fontSize: 12,
              boxShadow: 'var(--shadow)',
            }}>
              <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Hoisting</div>
              <div style={{ color: 'var(--red)', fontWeight: 600 }}>42% · Needs Review</div>
              <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 2 }}>Last reviewed: 5 days ago</div>
            </div>
          ) : (
            <div style={{
              position: 'absolute', right: 0, top: '32%',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '10px 14px', fontSize: 12,
              boxShadow: 'var(--shadow)', animation: 'fadeUp 0.8s 1.5s ease both',
              whiteSpace: 'nowrap',
            }}>
              <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Hoisting</div>
              <div style={{ color: 'var(--red)', fontWeight: 600 }}>42% · Needs Review</div>
              <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 2 }}>Last reviewed: 5 days ago</div>
            </div>
          )}
        </div>
      </section>

      {/* How it works */}
      <section style={{ padding: '80px 8%', borderTop: '1px solid var(--border)' }}>
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <h2 style={{ fontSize: 'clamp(28px, 3vw, 42px)', fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 16px' }}>From Notes to Understanding</h2>
          <p style={{ fontSize: 16, color: 'var(--text-muted)', maxWidth: 500, margin: '0 auto' }}>Four steps that transform what you learn into connected, testable knowledge.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 24 }}>
          {[
            { num: '01', Icon: NotesIcon, title: 'Write', desc: 'Capture concepts and explanations naturally in Markdown.' },
            { num: '02', Icon: Puzzle, title: 'Structure', desc: 'KNODES extracts concepts, claims, and prerequisites automatically.' },
            { num: '03', Icon: Network, title: 'Connect', desc: 'Your knowledge becomes a connected graph with prerequisite relationships.' },
            { num: '04', Icon: Target, title: 'Retest', desc: 'Recall facts, explain mechanisms, test changes, and transfer what you know.' },
          ].map(({ num, Icon, title, desc }) => (
            <div key={num} style={{
              padding: 24, borderRadius: 16, background: 'var(--bg-elevated)',
              border: '1px solid var(--border)', position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', letterSpacing: '0.06em', marginBottom: 12 }}>{num}</div>
              <div style={{ marginBottom: 16, color: 'var(--text-muted)' }}><Icon size={26} strokeWidth={1.4} /></div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{title}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>{desc}</div>
              <div style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80, background: 'var(--green-dim)', borderRadius: '0 0 0 80px', opacity: 0.5 }} />
            </div>
          ))}
        </div>
      </section>

      {/* Understanding vs Recall */}
      <section style={{ padding: '80px 8%', borderTop: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h2 style={{ fontSize: 'clamp(24px, 3vw, 40px)', fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 16px' }}>
            Remembering a fact isn't the same<br />as understanding it.
          </h2>
          <p style={{ fontSize: 16, color: 'var(--text-muted)', maxWidth: 520, margin: '0 auto' }}>
            KNODES looks beyond surface recall — exploring relationships, mechanisms, counterfactuals, and transfer.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 24, maxWidth: 800, margin: '0 auto' }}>
          <div style={{ padding: 28, borderRadius: 16, background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-dim)', marginBottom: 16 }}>TRADITIONAL REVIEW</div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 8 }}>What is hoisting?</div>
              <div style={{ padding: '8px 12px', borderRadius: 6, background: 'rgba(88,204,2,0.1)', color: 'var(--green)', fontSize: 13, display: 'flex', gap: 6 }}>
                <span>✓</span> Answered
              </div>
            </div>
          </div>

          <div style={{ padding: 28, borderRadius: 16, border: '2px solid var(--green)', background: 'var(--bg)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--green)', marginBottom: 16 }}>KNODES</div>
            {[
              'How does hoisting work from creation to execution?',
              'What changes if var becomes let?',
              'What remains invariant?',
              'Can you apply the mechanism to a new case?',
            ].map((q, i) => (
              <div key={i} style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 8, paddingLeft: 12, borderLeft: '2px solid var(--green-dim)', lineHeight: 1.4 }}>{q}</div>
            ))}
          </div>
        </div>
      </section>

      {/* Structural evidence */}
      <section style={{ padding: isMobile ? '48px 6%' : '80px 8%', borderTop: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center', marginBottom: 48 }}>
          <h2 style={{ fontSize: 'clamp(24px, 3vw, 40px)', fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 16px' }}>See how deep your knowledge goes.</h2>
          <p style={{ fontSize: 16, color: 'var(--text-muted)' }}>Structural evidence — not a fake understanding percentage.</p>
        </div>
        <div style={{ maxWidth: 540, margin: '0 auto', padding: 28, borderRadius: 16, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          {[
            { label: 'Definition', val: 88 },
            { label: 'Mechanism', val: 72 },
            { label: 'Relationships', val: 60 },
            { label: 'Boundary', val: 45 },
            { label: 'Application', val: 65 },
            { label: 'Counterfactual', val: 35 },
          ].map(({ label, val }) => (
            <div key={label} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13, color: 'var(--text-2)' }}>
                <span>{label}</span>
                <span style={{ color: val > 60 ? 'var(--green)' : val > 40 ? 'var(--orange)' : 'var(--text-dim)', fontSize: 12 }}>
                  {val > 70 ? 'Strong' : val > 50 ? 'Developing' : 'Weak'}
                </span>
              </div>
              <div style={{ height: 6, background: 'var(--bg-input)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${val}%`, borderRadius: 3,
                  background: val > 60 ? 'var(--green)' : val > 40 ? 'var(--orange)' : 'var(--red)',
                }} />
              </div>
            </div>
          ))}
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic' }}>Structural Evidence for: Hoisting</div>
        </div>
      </section>

      {/* Feature grid */}
      <section style={{ padding: '80px 8%', borderTop: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <h2 style={{ fontSize: 'clamp(24px, 3vw, 40px)', fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 16px' }}>Everything your learning needs.</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 20, maxWidth: 960, margin: '0 auto' }}>
          {FEATURES.map(({ Icon, title, desc }) => (
            <div
              key={title}
              style={{
                padding: '24px 24px', borderRadius: 14, background: 'var(--bg)',
                border: '1px solid var(--border)', transition: 'all 0.2s', cursor: 'default',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
            >
              <div style={{ marginBottom: 14, color: 'var(--text-muted)' }}><Icon size={24} strokeWidth={1.4} /></div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{title}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ padding: isMobile ? '64px 6%' : '100px 8%', textAlign: 'center', borderTop: '1px solid var(--border)' }}>
        <h2 style={{ fontSize: 'clamp(32px, 4vw, 56px)', fontWeight: 800, letterSpacing: '-0.03em', margin: '0 0 20px' }}>Build your Brain.</h2>
        <p style={{ fontSize: 18, color: 'var(--text-muted)', margin: '0 0 40px' }}>Start with one note. End with a connected understanding.</p>
        <button
          onClick={handleStart}
          style={{
            padding: '16px 36px', borderRadius: 12, background: 'var(--green)', color: '#fff',
            border: 'none', cursor: 'pointer', fontSize: 18, fontWeight: 700, fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 16,
          }}
        >
          Start Building Your Brain <ArrowRight size={16} />
        </button>
        <div>
          <button onClick={handleSignIn} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>
            I already have an account
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        padding: '32px 8%', borderTop: '1px solid var(--border)',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: isMobile ? undefined : 'space-between',
        alignItems: 'center',
        gap: isMobile ? 8 : undefined,
        textAlign: isMobile ? 'center' : undefined,
      }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 4,fontFamily: "'Anurati', sans-serif",
            letterSpacing: '8px',
            color: 'var(--text)',}}>KNODES</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Build Understanding, Not Just Notes.</div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>© 2026 KNODES</div>
      </footer>
    </div>
  );
}
