import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { recallStatus } from '../data/demo';
import { Brain, CheckCircle, AlertTriangle, BarChart, ArrowUpRight, Check } from '../components/Icon';

function useVW() {
  const [vw, setVw] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setVw(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return vw;
}

// Mini SVG line chart data
const RECALL_HISTORY = [
  { date: 'Aug 1', avg: 52 }, { date: 'Aug 5', avg: 58 }, { date: 'Aug 9', avg: 55 },
  { date: 'Aug 13', avg: 63 }, { date: 'Aug 17', avg: 60 }, { date: 'Aug 21', avg: 68 },
  { date: 'Aug 25', avg: 65 }, { date: 'Aug 30', avg: 71 },
];

const GROWTH_DATA = [4, 6, 6, 8, 10, 11, 13, 17];

const MISCONCEPTIONS = [
  { concept: 'Hoisting', text: 'Hoisting moves code physically to the top of the file.', status: 'corrected' },
  { concept: 'TDZ', text: 'let and const are not hoisted at all.', status: 'active' },
  { concept: 'Scope', text: 'var is block-scoped like let.', status: 'corrected' },
];

const CAPABILITIES = [
  { label: 'Counterfactual on Hoisting', date: 'Aug 28', type: 'counterfactual' },
  { label: 'Transfer: var vs const in loops', date: 'Aug 25', type: 'transfer' },
  { label: 'Process trace: TCP 3-way handshake', date: 'Aug 22', type: 'process' },
  { label: 'Relational: Normalization ↔ Indexing', date: 'Aug 20', type: 'relational' },
];

function LineChart({ data }: { data: { date: string; avg: number }[] }) {
  const W = 500, H = 120, PAD = 20;
  const minV = 40, maxV = 100;
  const pts = data.map((d, i) => ({
    x: PAD + (i / (data.length - 1)) * (W - 2 * PAD),
    y: H - PAD - ((d.avg - minV) / (maxV - minV)) * (H - 2 * PAD),
    ...d,
  }));
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L ${pts[pts.length - 1].x} ${H - PAD} L ${pts[0].x} ${H - PAD} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 120, overflow: 'visible' }}>
      <defs>
        <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#58CC02" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#58CC02" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {[50, 60, 70, 80].map(v => {
        const y = H - PAD - ((v - minV) / (maxV - minV)) * (H - 2 * PAD);
        return (
          <g key={v}>
            <line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="var(--border)" strokeWidth={0.5} />
            <text x={PAD - 4} y={y + 3} textAnchor="end" fontSize={8} fill="var(--text-dim)">{v}%</text>
          </g>
        );
      })}
      {/* Area */}
      <path d={areaD} fill="url(#area-grad)" />
      {/* Line */}
      <path d={pathD} fill="none" stroke="var(--green)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {/* Points */}
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3} fill="var(--green)" />
          <text x={p.x} y={H - 4} textAnchor="middle" fontSize={7} fill="var(--text-dim)">{p.date}</text>
        </g>
      ))}
    </svg>
  );
}

function GrowthChart({ data }: { data: number[] }) {
  const max = Math.max(...data);
  const W = 500, H = 80, PAD = 20;
  const barW = (W - 2 * PAD) / data.length - 4;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 80 }}>
      {data.map((v, i) => {
        const bh = ((v / max) * (H - 2 * PAD));
        const x = PAD + i * ((W - 2 * PAD) / data.length) + 2;
        const y = H - PAD - bh;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={bh} rx={2} fill="var(--blue)" opacity={0.6 + (i / data.length) * 0.4} />
            <text x={x + barW / 2} y={H - 4} textAnchor="middle" fontSize={7} fill="var(--text-dim)">{['1', '5', '9', '13', '17', '21', '25', '30'][i]}</text>
          </g>
        );
      })}
    </svg>
  );
}

const SOLO_DISTRIBUTION = [
  { level: 'Extended Abstract', count: 2, color: 'var(--green)' },
  { level: 'Relational', count: 5, color: 'var(--green)' },
  { level: 'Multistructural', count: 4, color: 'var(--blue)' },
  { level: 'Unistructural', count: 3, color: 'var(--orange)' },
  { level: 'Prestructural', count: 3, color: 'var(--red)' },
];
const TOTAL_SOLO = SOLO_DISTRIBUTION.reduce((s, d) => s + d.count, 0);

export default function InsightsPage() {
  const { nodes } = useApp();
  const navigate = useNavigate();
  const vw = useVW();
  const isMobile = vw < 640;
  const [activeTab, setActiveTab] = useState<'overview' | 'transfer' | 'misconceptions'>('overview');

  const healthy = nodes.filter(n => n.recall !== null && n.recall >= 75).length;
  const weakening = nodes.filter(n => n.recall !== null && n.recall >= 50 && n.recall < 75).length;
  const review = nodes.filter(n => n.recall !== null && n.recall < 50).length;
  const avgRecall = Math.round(
    nodes.filter(n => n.recall !== null).reduce((s, n) => s + (n.recall ?? 0), 0) /
    nodes.filter(n => n.recall !== null).length
  );

  return (
    <div style={{ padding: isMobile ? '16px 16px' : '32px 40px', height: '100%', overflowY: 'auto', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Insights</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>August 2026 · 17 concepts</p>
      </div>

      {/* Overview cards — mobile: 2x2, desktop: 4-col */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 16, marginBottom: 24 }}>
        <OverviewCard Icon={Brain} label="Total Concepts" value={17} color="var(--text)" isMobile={isMobile} />
        <OverviewCard Icon={CheckCircle} label="Healthy" value={healthy} color="var(--green)" isMobile={isMobile} />
        <OverviewCard Icon={AlertTriangle} label="Needs Review" value={review} color="var(--red)" isMobile={isMobile} />
        <OverviewCard Icon={BarChart} label="Avg Recall" value={`${avgRecall}%`} color="var(--blue)" isMobile={isMobile} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {(['overview', 'transfer', 'misconceptions'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: isMobile ? '6px 10px' : '8px 16px', border: 'none', background: 'none',
              cursor: 'pointer', fontSize: isMobile ? 11 : 13, fontFamily: 'inherit',
              color: activeTab === tab ? 'var(--text)' : 'var(--text-muted)',
              fontWeight: activeTab === tab ? 600 : 400,
              borderBottom: activeTab === tab ? '2px solid var(--green)' : '2px solid transparent',
              marginBottom: -1, textTransform: 'capitalize',
            }}
          >{tab}</button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '3fr 1.4fr', gap: 20 }}>
          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Recall chart */}
            <Panel title="Recall Over Time" isMobile={isMobile}>
              <LineChart data={RECALL_HISTORY} />
            </Panel>

            {/* SOLO distribution */}
            <Panel title="Structural Level Distribution" isMobile={isMobile}>
              {SOLO_DISTRIBUTION.map(({ level, count, color }) => (
                <div key={level} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                    <span style={{ color: 'var(--text-2)' }}>{level}</span>
                    <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{count} concept{count !== 1 ? 's' : ''}</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--bg-input)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(count / TOTAL_SOLO) * 100}%`, background: color, borderRadius: 4, transition: 'width 0.6s ease' }} />
                  </div>
                </div>
              ))}
            </Panel>

            {/* Knowledge growth */}
            <Panel title="Knowledge Growth (August)" isMobile={isMobile}>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>Concepts added per period</div>
              <GrowthChart data={GROWTH_DATA} />
            </Panel>
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Recall breakdown */}
            <Panel title="Recall Breakdown" isMobile={isMobile}>
              {[
                { label: 'Healthy', val: healthy, color: 'var(--green)' },
                { label: 'Weakening', val: weakening, color: 'var(--orange)' },
                { label: 'Needs Review', val: review, color: 'var(--red)' },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                    <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{label}</span>
                  </div>
                  <span style={{ fontSize: 16, fontWeight: 700, color }}>{val}</span>
                </div>
              ))}
            </Panel>

            {/* Needs attention */}
            <Panel title="Needs Attention" isMobile={isMobile}>
              {nodes
                .filter(n => n.recall !== null && n.recall < 60)
                .sort((a, b) => (a.recall ?? 0) - (b.recall ?? 0))
                .slice(0, 5)
                .map(n => {
                  const rs = recallStatus(n.recall);
                  return (
                    <button
                      key={n.id}
                      onClick={() => navigate('/retest')}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                        padding: '8px', borderRadius: 6, marginBottom: 4,
                        background: 'none', border: 'none', cursor: 'pointer',
                        textAlign: 'left', fontFamily: 'inherit', transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-input)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
                    >
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: rs.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: 'var(--text-2)', flex: 1 }}>{n.label}</span>
                      <span style={{ fontSize: 13, color: rs.color, fontWeight: 600 }}>{n.recall}%</span>
                    </button>
                  );
                })}
              <button
                onClick={() => navigate('/retest')}
                style={{
                  marginTop: 8, width: '100%', padding: '8px', borderRadius: 6,
                  background: 'var(--green)', color: '#fff', border: 'none',
                  cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                }}
              >Start Review Session</button>
            </Panel>

            {/* Capabilities log */}
            <Panel title="Recent Capabilities" isMobile={isMobile}>
              {CAPABILITIES.map(({ label, date, type }) => {
                const colorMap: Record<string, string> = { counterfactual: 'var(--orange)', transfer: 'var(--blue)', process: 'var(--green)', relational: 'var(--green)' };
                return (
                  <div key={label} style={{ marginBottom: 10, paddingLeft: 10, borderLeft: `2px solid ${colorMap[type] ?? 'var(--border-strong)'}` }}>
                    <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{date}</div>
                  </div>
                );
              })}
            </Panel>
          </div>
        </div>
      )}

      {activeTab === 'transfer' && (
        <div style={{ maxWidth: 860 }}>
          <Panel title="Transfer Evidence" isMobile={isMobile}>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>Concepts where you have demonstrated transfer — applying knowledge outside the original example.</p>
            {[
              { concept: 'Hoisting', example: 'Applied to class declarations', date: 'Aug 27' },
              { concept: 'Scope', example: 'Used to explain module patterns', date: 'Aug 24' },
              { concept: 'TCP', example: 'Compared to QUIC connection setup', date: 'Aug 19' },
            ].map(({ concept, example, date }) => (
              <div key={concept} style={{
                padding: '14px 16px', borderRadius: 8, background: 'var(--bg-input)',
                border: '1px solid var(--border)', marginBottom: 10,
                display: 'flex', alignItems: 'center', gap: 16,
              }}>
                <div style={{ color: 'var(--blue)' }}><ArrowUpRight size={20} strokeWidth={1.5} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', marginBottom: 2 }}>{concept}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{example}</div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{date}</div>
              </div>
            ))}
          </Panel>
        </div>
      )}

      {activeTab === 'misconceptions' && (
        <div style={{ maxWidth: 860 }}>
          <Panel title="Misconception Tracker" isMobile={isMobile}>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>Common incorrect beliefs KNODES detected and helped you correct.</p>
            {MISCONCEPTIONS.map(({ concept, text, status }) => (
              <div key={concept} style={{
                padding: '14px 16px', borderRadius: 8, background: 'var(--bg-input)',
                border: `1px solid ${status === 'active' ? 'var(--orange)' : 'var(--border)'}`,
                marginBottom: 10, display: 'flex', gap: 12, alignItems: 'flex-start',
              }}>
                <span style={{ flexShrink: 0, color: status === 'active' ? 'var(--orange)' : 'var(--green)', display: 'flex' }}>{status === 'active' ? <AlertTriangle size={18} strokeWidth={1.5} /> : <Check size={18} strokeWidth={2} />}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', marginBottom: 4 }}>{concept}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-2)', fontStyle: 'italic' }}>"{text}"</div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                  color: status === 'active' ? 'var(--orange)' : 'var(--green)',
                  background: status === 'active' ? 'rgba(255,150,0,0.1)' : 'rgba(88,204,2,0.1)',
                }}>{status === 'active' ? 'Active' : 'Corrected'}</span>
              </div>
            ))}
          </Panel>
        </div>
      )}
    </div>
  );
}

function OverviewCard({ Icon, label, value, color, isMobile }: { Icon: React.FC<{ size?: number; strokeWidth?: number }>; label: string; value: string | number; color: string; isMobile: boolean }) {
  return (
    <div style={{
      padding: isMobile ? '14px 14px' : '20px 22px', borderRadius: 14, background: 'var(--bg-elevated)',
      border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 16,
    }}>
      <div style={{ width: isMobile ? 36 : 44, height: isMobile ? 36 : 44, borderRadius: 12, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ color, display: 'flex' }}><Icon size={isMobile ? 18 : 22} strokeWidth={1.5} /></span>
      </div>
      <div>
        <div style={{ fontSize: isMobile ? 20 : 26, fontWeight: 800, color, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: isMobile ? 11 : 12, color: 'var(--text-dim)', marginTop: 4 }}>{label}</div>
      </div>
    </div>
  );
}

function Panel({ title, children, isMobile }: { title: string; children: React.ReactNode; isMobile: boolean }) {
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
      borderRadius: 14, padding: isMobile ? '16px 16px' : '22px 24px',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  );
}
