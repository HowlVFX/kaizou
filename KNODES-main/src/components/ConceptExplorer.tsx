import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GraphNode } from '../types';
import { recallStatus, demoNodes } from '../data/demo';
import { useApp } from '../context/AppContext';
import { useConceptDetail, formatRelative, type ConceptDetail } from '../lib/concepts';
import { Lock, FileText, X as XIcon, Target, RefreshCw, GitMerge, BarChart, Zap } from './Icon';

interface Props {
  node: GraphNode;
  onClose: () => void;
  onRetestClick: (nodeId: string) => void;
  onExplainClick: () => void;
  onPathLearnClick?: () => void;
}

type Tab = 'overview' | 'depth' | 'evidence';

const soloSteps = ['Prestructural', 'Unistructural', 'Multistructural', 'Relational', 'Extended Abstract'] as const;
const soloColor = (s: string) =>
  s === 'Extended Abstract' || s === 'Relational' ? 'var(--green)'
  : s === 'Multistructural' || s === 'Unistructural' ? 'var(--blue)'
  : 'var(--text-dim)';

export default function ConceptExplorer({ node, onClose, onRetestClick, onExplainClick, onPathLearnClick }: Props) {
  const navigate = useNavigate();
  const rs = recallStatus(node.recall);
  const [tab, setTab] = useState<Tab>('overview');
  const [visible, setVisible] = useState(false);
  const [barsFilled, setBarsFilled] = useState(false);

  // Animate in on mount / node change
  useEffect(() => {
    setVisible(false);
    setBarsFilled(false);
    setTab('overview');
    const t1 = setTimeout(() => setVisible(true), 30);
    const t2 = setTimeout(() => setBarsFilled(true), 350);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [node.id]);

  const circumference = 2 * Math.PI * 36;
  const recallDash = node.recall !== null ? (node.recall / 100) * circumference : 0;

  // Claims + edges come from GET /api/concepts/:id; neighbours resolve against the loaded graph.
  const { nodes: allNodes, isLoggedIn } = useApp();
  const { detail, loading: detailLoading, error: detailError } = useConceptDetail(node.id);
  const pool = isLoggedIn ? allNodes : demoNodes;
  const linkedIds = new Set<string>([
    ...(detail?.prerequisites ?? node.prerequisites ?? []),
    ...(detail?.related ?? node.related ?? []),
    ...(detail?.dependents ?? []),
  ]);
  const connected = pool.filter(n => n.id !== node.id && linkedIds.has(n.id));
  const viewNode: GraphNode = {
    ...node,
    claims: detail ? detail.claims : node.claims,
    lastReviewed: formatRelative(node.lastReviewed) ?? undefined,
  };

  return (
    <div style={{
      width: 420, height: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--bg-elevated)', borderLeft: '1px solid var(--border)',
      transform: visible ? 'translateX(0)' : 'translateX(24px)',
      opacity: visible ? 1 : 0,
      transition: 'transform 0.32s cubic-bezier(0.16,1,0.3,1), opacity 0.25s ease',
    }}>

      {/* ── Header ── */}
      <div style={{ padding: '18px 20px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 4 }}>
              {node.subject ?? 'Concept'}
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--text)', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              {node.label}
            </h2>
          </div>
          <button onClick={onClose} style={{
            background: 'var(--bg-input)', border: '1px solid var(--border)',
            borderRadius: 8, width: 30, height: 30, cursor: 'pointer',
            color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, marginLeft: 12, transition: 'background 0.15s',
          }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--border)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-input)'}
          >
            <XIcon size={14} />
          </button>
        </div>

        {/* Recall ring + status row */}
        {!node.locked && node.recall !== null && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16,
            padding: '14px 16px', background: 'var(--bg)', borderRadius: 12,
            border: '1px solid var(--border)',
          }}>
            {/* Animated ring */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <svg width={72} height={72} viewBox="0 0 80 80">
                <circle cx={40} cy={40} r={36} fill="none" stroke="var(--border-strong)" strokeWidth={5} />
                <circle cx={40} cy={40} r={36} fill="none" stroke={rs.color} strokeWidth={5}
                  strokeDasharray={`${barsFilled ? recallDash : 0} ${circumference}`}
                  strokeLinecap="round" transform="rotate(-90 40 40)"
                  style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.16,1,0.3,1)' }} />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: rs.color, lineHeight: 1 }}>{node.recall}%</span>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: rs.color, marginBottom: 4 }}>{rs.label}</div>
              {viewNode.lastReviewed && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>Last reviewed: {viewNode.lastReviewed}</div>}
              {node.halfLife ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Half-life: {Math.round(node.halfLife * 10) / 10} days</div> : null}
              {/* Mini decay bar */}
              <div style={{ marginTop: 8, height: 3, background: 'var(--border-strong)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  background: `linear-gradient(90deg, ${rs.color}66, ${rs.color})`,
                  width: barsFilled ? `${node.recall}%` : '0%',
                  transition: 'width 1s cubic-bezier(0.16,1,0.3,1)',
                }} />
              </div>
            </div>
          </div>
        )}

        {!node.locked && node.recall === null && (
          <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)' }}>
            Not reviewed yet. Retest this concept to start tracking recall.
          </div>
        )}

        {/* Locked state */}
        {node.locked && (
          <div style={{
            marginBottom: 16, padding: '14px 16px', borderRadius: 12,
            background: 'var(--bg)', border: '1px solid var(--border)',
            display: 'flex', gap: 12, alignItems: 'flex-start',
          }}>
            <span style={{ color: 'var(--text-dim)', marginTop: 1, flexShrink: 0 }}><Lock size={16} /></span>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-2)', fontSize: 13, marginBottom: 4 }}>Missing prerequisite</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55 }}>KNODES identified this as a prerequisite not yet established in your Brain.</div>
              <button onClick={() => navigate('/notes')} style={{
                marginTop: 10, padding: '6px 14px', borderRadius: 7, background: 'var(--blue)',
                border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}>Learn this concept</button>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {!node.locked && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 0 }}>
            {/* Learn This Path — primary action */}
            {onPathLearnClick && (
              <button onClick={onPathLearnClick} style={{
                width: '100%', padding: '10px 0', borderRadius: 9, background: 'var(--blue)',
                border: 'none', color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.88'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
              >
                Learn This Path →
              </button>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => onRetestClick(node.id)} style={{
                flex: 1, padding: '9px 0', borderRadius: 9, background: rs.color,
                border: 'none', color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.85'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
              >
                <Target size={14} strokeWidth={2} /> Retest
              </button>
              <button onClick={onExplainClick} style={{
                flex: 1, padding: '9px 0', borderRadius: 9, background: 'var(--bg-input)',
                border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s, border-color 0.15s, color 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(88,204,2,0.1)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(88,204,2,0.4)'; (e.currentTarget as HTMLElement).style.color = 'var(--green)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-input)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; }}
              >
                <Zap size={14} strokeWidth={1.8} /> Explain
              </button>
            </div>
          </div>
        )}

        {/* Tab bar */}
        <div style={{ display: 'flex', marginTop: 16, borderBottom: '1px solid var(--border)', gap: 0 }}>
          {([
            { key: 'overview', label: 'Overview', Icon: FileText },
            { key: 'depth', label: 'Depth', Icon: BarChart },
            { key: 'evidence', label: 'Evidence', Icon: GitMerge },
          ] as const).map(({ key, label, Icon }) => (
            <button key={key} onClick={() => setTab(key)} style={{
              flex: 1, padding: '9px 0', border: 'none', background: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 12, fontWeight: tab === key ? 600 : 400,
              color: tab === key ? 'var(--text)' : 'var(--text-muted)',
              borderBottom: tab === key ? `2px solid ${rs.color}` : '2px solid transparent',
              marginBottom: -1, transition: 'color 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}>
              <Icon size={12} strokeWidth={1.8} /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>

        {tab === 'overview' && (
          <>
            {detailLoading && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>Loading concept details…</div>}
            {detailError && <div role="alert" style={{ fontSize: 12, color: 'var(--red)', marginBottom: 12 }}>{detailError}</div>}
            <OverviewTab node={viewNode} connected={connected} navigate={navigate} />
          </>
        )}

        {tab === 'depth' && (
          <DepthTab node={node} detail={detail} rs={rs} />
        )}

        {tab === 'evidence' && (
          <EvidenceTab node={node} detail={detail} />
        )}
      </div>
    </div>
  );
}

/* ── Overview tab ── */
function OverviewTab({ node, connected, navigate }: { node: GraphNode; connected: GraphNode[]; navigate: ReturnType<typeof useNavigate> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {node.summary && (
        <Section title="What it is">
          <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7, margin: 0 }}>{node.summary}</p>
        </Section>
      )}

      {node.claims && node.claims.length > 0 && (
        <Section title="Key statements">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {node.claims.map((claim, i) => (
              <div key={i} style={{
                display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 8,
                background: 'var(--bg)', border: '1px solid var(--border)',
                fontSize: 13, color: 'var(--text-2)', alignItems: 'flex-start', lineHeight: 1.55,
              }}>
                <span style={{ color: 'var(--green)', fontWeight: 700, flexShrink: 0, fontSize: 14, lineHeight: 1.4 }}>✓</span>
                {claim}
              </div>
            ))}
          </div>
        </Section>
      )}

      {node.solo && !node.locked && (
        <Section title="SOLO taxonomy level">
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            {soloSteps.map((step, i) => {
              const isActive = step === node.solo;
              const isPast = soloSteps.indexOf(node.solo as typeof soloSteps[number]) > i;
              return (
                <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: isActive ? 700 : 400,
                    background: isActive ? soloColor(step) + '25' : isPast ? 'var(--bg-input)' : 'transparent',
                    color: isActive ? soloColor(step) : isPast ? 'var(--text-muted)' : 'var(--text-dim)',
                    border: isActive ? `1px solid ${soloColor(step)}60` : '1px solid transparent',
                    transition: 'all 0.2s',
                  }}>{step.split(' ')[0]}</div>
                  {i < soloSteps.length - 1 && <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>›</span>}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Current level: <span style={{ color: soloColor(node.solo), fontWeight: 600, fontStyle: 'normal' }}>{node.solo}</span>
          </div>
        </Section>
      )}

      {connected.length > 0 && (
        <Section title={`Connected concepts · ${connected.length}`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {connected.map(n => {
              const rs = recallStatus(n.recall);
              return (
                <div key={n.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                  borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)',
                  transition: 'border-color 0.15s', cursor: 'default',
                }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}
                >
                  {n.locked
                    ? <Lock size={12} stroke="var(--text-dim)" />
                    : <div style={{ width: 8, height: 8, borderRadius: '50%', background: rs.color, flexShrink: 0 }} />
                  }
                  <span style={{ flex: 1, fontSize: 13, color: n.locked ? 'var(--text-dim)' : 'var(--text-2)' }}>{n.label}</span>
                  {n.recall !== null && (
                    <span style={{ fontSize: 12, fontWeight: 600, color: rs.color }}>{n.recall}%</span>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {node.sourceNote && (
        <Section title="Source note">
          <button onClick={() => navigate('/notes')} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
            borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)',
            color: 'var(--blue)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
            width: '100%', transition: 'border-color 0.15s',
          }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--blue)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}
          >
            <FileText size={14} /> {node.sourceNote}
          </button>
        </Section>
      )}
    </div>
  );
}

/* ── Depth tab ── */
function DepthTab({ node, detail, rs }: { node: GraphNode; detail: ConceptDetail | null; rs: ReturnType<typeof recallStatus> }) {
  const [barsFilled, setBarsFilled] = useState(false);

  useEffect(() => {
    setBarsFilled(false);
    const t = setTimeout(() => setBarsFilled(true), 60);
    return () => clearTimeout(t);
  }, [node.id]);

  // Real concepts source depth from the detail endpoint; demo nodes fall back
  // to their embedded evidence shape.
  const evidence = detail?.evidence ?? node.evidence;
  const process = detail?.process ?? node.process;

  // Honest empty state: only when there is no evidence at all, or every
  // dimension is zero (learner has no relevant graded attempts).
  const hasDepth = !!evidence && Object.values(evidence).some(v => (v ?? 0) > 0);
  if (!hasDepth || node.locked) {
    return <EmptyState label="No depth data available yet" />;
  }

  const entries = Object.entries(evidence) as [string, number][];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Section title="Concept depth breakdown">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {entries.map(([key, val], idx) => {
            const pct = val ?? 0;
            const color = pct >= 70 ? 'var(--green)' : pct >= 45 ? 'var(--orange)' : 'var(--red)';
            const hex = pct >= 70 ? '#58CC02' : pct >= 45 ? '#FF9600' : '#FF4B4B';
            const label = pct >= 70 ? 'Strong' : pct >= 45 ? 'Developing' : pct >= 25 ? 'Weak' : 'Not yet';
            return (
              <div key={key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 500 }}>
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color, fontWeight: 600 }}>{label}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{pct}%</span>
                  </div>
                </div>
                <div style={{ height: 7, background: 'var(--bg-input)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 4,
                    background: `linear-gradient(90deg, ${hex}88, ${hex})`,
                    width: `${pct}%`,
                    transform: barsFilled ? 'scaleX(1)' : 'scaleX(0)',
                    transformOrigin: 'left center',
                    transition: `transform 0.9s cubic-bezier(0.16,1,0.3,1) ${idx * 70}ms`,
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {process && process.length > 0 && (
        <Section title="Process trace">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {process.map((step, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, paddingTop: 4 }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: rs.color + '20', border: `1.5px solid ${rs.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: rs.color }}>{i + 1}</div>
                  {i < process.length - 1 && <div style={{ width: 1.5, flex: 1, background: 'var(--border-strong)', minHeight: 20, marginTop: 3 }} />}
                </div>
                <div style={{ paddingBottom: i < process.length - 1 ? 16 : 0, paddingTop: 2 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55 }}>{step}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

/* ── Evidence tab ── */
function EvidenceTab({ node, detail }: { node: GraphNode; detail: ConceptDetail | null }) {
  // Real concepts source assessment evidence from the detail endpoint; demo
  // nodes fall back to their embedded shape.
  const assessment = detail?.assessmentEvidence ?? node.assessmentEvidence;

  // Honest empty state: only when there is no evidence at all, or every
  // category is 'none' (learner has never attempted any relevant probe).
  const hasEvidence = !!assessment && Object.values(assessment).some(v => v && v !== 'none');
  if (!hasEvidence || node.locked) {
    return <EmptyState label="No assessment evidence yet" />;
  }

  const items = [
    { key: 'recall', label: 'Recall', desc: 'Can reproduce the concept from memory' },
    { key: 'processTrace', label: 'Process trace', desc: 'Can explain the mechanism step-by-step' },
    { key: 'counterfactual', label: 'Counterfactual', desc: 'Can reason about what would change if X were different' },
    { key: 'transfer', label: 'Transfer', desc: 'Can apply the concept to novel situations' },
  ] as const;

  const sym = (v?: string) =>
    v === 'demonstrated' ? { icon: '✓', color: 'var(--green)', bg: 'var(--green)', label: 'Demonstrated' }
    : v === 'developing' ? { icon: '△', color: 'var(--orange)', bg: 'var(--orange)', label: 'Developing' }
    : { icon: '—', color: 'var(--text-dim)', bg: 'var(--text-dim)', label: 'Not yet' };

  const ev = assessment as Record<string, string>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Section title="Recent assessment evidence">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(({ key, label, desc }) => {
            const s = sym(ev[key]);
            return (
              <div key={key} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px',
                borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)',
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', background: s.bg + '18',
                  border: `1.5px solid ${s.bg}50`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, color: s.color, flexShrink: 0,
                }}>{s.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>{label}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: s.color }}>{s.label}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.45 }}>{desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Summary pill row */}
      <Section title="Summary">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { label: 'Demonstrated', count: Object.values(ev).filter(v => v === 'demonstrated').length, color: 'var(--green)' },
            { label: 'Developing', count: Object.values(ev).filter(v => v === 'developing').length, color: 'var(--orange)' },
            { label: 'Not yet', count: Object.values(ev).filter(v => !v || v === 'none').length, color: 'var(--text-dim)' },
            { label: 'Total checks', count: items.length, color: 'var(--blue)' },
          ].map(({ label, count, color }) => (
            <div key={label} style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color }}>{count}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
      <RefreshCw size={24} style={{ marginBottom: 10, opacity: 0.4 }} />
      <div>{label}</div>
    </div>
  );
}
