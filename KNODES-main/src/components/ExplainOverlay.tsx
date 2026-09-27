import { useState, useEffect } from 'react';
import type { GraphNode, GraphEdge } from '../types';
import { recallStatus, demoNodes, demoEdges } from '../data/demo';
import { useApp } from '../context/AppContext';
import { useConceptDetail } from '../lib/concepts';
import { X as XIcon, Lock, BarChart } from './Icon';

interface Props {
  node: GraphNode;
  onClose: () => void;
  onBack?: () => void;
}

// Derive relationship graph from the node's prerequisite/related ids and the graph edges
function getRelationships(node: GraphNode, pool: GraphNode[], edges: GraphEdge[], dependentIds: string[] = []) {
  const prereqs = pool.filter(n => node.prerequisites?.includes(n.id));
  const related = pool.filter(n => node.related?.includes(n.id));
  const dependents = pool.filter(n =>
    n.id !== node.id && (
      dependentIds.includes(n.id) ||
      n.related?.includes(node.id) || n.prerequisites?.includes(node.id) ||
      edges.some(e => e.type === 'requires' && e.source === n.id && e.target === node.id)
    )
  );
  return { prereqs, related, dependents };
}

// Small radial SVG showing this node + its direct connections
function ConceptWeb({ node, allNodes, edges }: { node: GraphNode; allNodes: GraphNode[]; edges: GraphEdge[] }) {
  const rs = recallStatus(node.recall);
  const CX = 160, CY = 130, R = 95;

  // Place connected nodes in a circle
  const positions = allNodes.map((n, i) => {
    const angle = (i / allNodes.length) * 2 * Math.PI - Math.PI / 2;
    return {
      ...n,
      x: CX + Math.cos(angle) * R,
      y: CY + Math.sin(angle) * R,
    };
  });

  return (
    <svg viewBox={`0 0 320 260`} style={{ width: '100%', height: 260 }}>
      <defs>
        <filter id="eo-glow">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <radialGradient id="eo-center" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={rs.color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={rs.color} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Soft glow around center */}
      <circle cx={CX} cy={CY} r={28} fill="url(#eo-center)" />

      {/* Edges */}
      {positions.map(p => {
        const edgeType = edges.find(e =>
          (e.source === node.id && e.target === p.id) ||
          (e.source === p.id && e.target === node.id)
        )?.type;
        const dashed = edgeType === 'requires';
        const prs = recallStatus(p.recall);
        return (
          <line
            key={p.id}
            x1={CX} y1={CY} x2={p.x} y2={p.y}
            stroke={prs.color}
            strokeWidth={1}
            strokeOpacity={0.35}
            strokeDasharray={dashed ? '4,3' : 'none'}
          />
        );
      })}

      {/* Connected nodes */}
      {positions.map(p => {
        const prs = recallStatus(p.recall);
        const hex = p.recall !== null
          ? p.recall >= 75 ? '#58CC02' : p.recall >= 50 ? '#FF9600' : '#FF4B4B'
          : '#6B7280';
        return (
          <g key={p.id} transform={`translate(${p.x},${p.y})`}>
            <circle r={11} fill={`${hex}18`} stroke={prs.color} strokeWidth={1.2} filter="url(#eo-glow)" />
            {p.locked && (
              <text textAnchor="middle" dominantBaseline="central" fontSize={9} fill="#6B7280">🔒</text>
            )}
            {!p.locked && p.recall !== null && (
              <text textAnchor="middle" dominantBaseline="central" fontSize={7} fontWeight="700" fill={prs.color}>
                {p.recall}%
              </text>
            )}
            <text y={18} textAnchor="middle" fontSize={8} fill="var(--overlay-text-mid)" fontWeight={500}>
              {p.label.length > 10 ? p.label.slice(0, 9) + '…' : p.label}
            </text>
          </g>
        );
      })}

      {/* Center node */}
      <circle cx={CX} cy={CY} r={22} fill={rs.color} fillOpacity={0.12} stroke={rs.color} strokeWidth={2} filter="url(#eo-glow)" />
      {node.recall !== null && (
        <text x={CX} y={CY} textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight="800" fill={rs.color}>
          {node.recall}%
        </text>
      )}
      <text x={CX} y={CY + 31} textAnchor="middle" fontSize={9} fontWeight="700" fill="var(--text)">
        {node.label}
      </text>
    </svg>
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

export default function ExplainOverlay({ node: baseNode, onClose, onBack }: Props) {
  const [visible, setVisible] = useState(false);
  const [barsFilled, setBarsFilled] = useState(false);
  const vw = useVW();
  const isMobile = vw < 640;
  // Logged in: claims/edges from GET /api/concepts/:id, neighbours from the real graph.
  const { nodes: graphNodes, edges: graphEdges, isLoggedIn } = useApp();
  const { detail } = useConceptDetail(baseNode.id);
  const pool = isLoggedIn ? graphNodes : demoNodes;
  const poolEdges = isLoggedIn ? graphEdges : demoEdges;
  const node: GraphNode = detail
    ? {
        ...baseNode,
        claims: detail.claims,
        prerequisites: detail.prerequisites,
        related: detail.related,
        // Real depth/assessment/process from the graded-attempts endpoint.
        evidence: detail.evidence ?? baseNode.evidence,
        assessmentEvidence: detail.assessmentEvidence ?? baseNode.assessmentEvidence,
        process: detail.process ?? baseNode.process,
      }
    : baseNode;
  const rs = recallStatus(node.recall);
  const { prereqs, related, dependents } = getRelationships(node, pool, poolEdges, detail?.dependents);
  const webNodes = [...new Set([...prereqs, ...related, ...dependents])].slice(0, 8);

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 20);
    const t2 = setTimeout(() => setBarsFilled(true), 300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Only show depth bars when there is real signal (any dimension > 0);
  // an all-zero evidence object means the learner has no graded attempts yet.
  const entries = node.evidence && Object.values(node.evidence).some(v => (v ?? 0) > 0)
    ? (Object.entries(node.evidence) as [string, number][])
    : [];

  if (isMobile) {
    return (
      <>
        {!onBack && <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 195 }} />}
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'var(--bg-elevated)', display: 'flex', flexDirection: 'column',
          transform: visible ? 'translateY(0)' : 'translateY(30px)',
          opacity: visible ? 1 : 0,
          transition: 'transform 0.3s cubic-bezier(0.16,1,0.3,1), opacity 0.22s ease',
        }}>
          {/* Mobile header */}
          <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            {onBack && (
              <button onClick={onBack} style={{
                height: 32, borderRadius: 10, border: '1px solid var(--border)',
                background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                color: 'var(--blue)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', padding: '0 10px', flexShrink: 0, marginTop: 4,
              }}>← Back</button>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 3 }}>
                {node.subject ?? 'Concept'} · Explanation
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em', lineHeight: 1.2 }}>{node.label}</div>
              {node.recall !== null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: rs.color }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: rs.color }}>{node.recall}% · {rs.label}</span>
                </div>
              )}
            </div>
            <button onClick={onClose} style={{
              width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--bg-input)', cursor: 'pointer', color: 'var(--text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <XIcon size={14} />
            </button>
          </div>
          {/* Mobile body — single column */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {node.summary && (
                <Section title="What it is">
                  <p style={{ fontSize: 14, color: 'var(--overlay-text)', lineHeight: 1.7, margin: 0 }}>{node.summary}</p>
                </Section>
              )}
              {node.claims && node.claims.length > 0 && (
                <Section title="Key statements">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {node.claims.map((claim, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'var(--bg-input)', border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-2)', alignItems: 'flex-start', lineHeight: 1.6 }}>
                        <span style={{ color: rs.color, fontWeight: 800, flexShrink: 0 }}>✓</span>
                        {claim}
                      </div>
                    ))}
                  </div>
                </Section>
              )}
              {node.process && node.process.length > 0 && (
                <Section title="Mechanism — step by step">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {node.process.map((step, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, paddingTop: 3 }}>
                          <div style={{ width: 22, height: 22, borderRadius: '50%', background: rs.bg, border: `1.5px solid ${rs.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: rs.color }}>{i + 1}</div>
                          {i < node.process!.length - 1 && <div style={{ width: 1.5, flex: 1, background: 'var(--border)', minHeight: 16, marginTop: 3 }} />}
                        </div>
                        <div style={{ paddingBottom: i < node.process!.length - 1 ? 14 : 0, paddingTop: 3 }}>
                          <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>{step}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}
              {webNodes.length > 0 && (
                <Section title={`Concept web · ${webNodes.length} connections`}>
                  <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                    <ConceptWeb node={node} allNodes={webNodes} edges={poolEdges} />
                  </div>
                </Section>
              )}
              {prereqs.length > 0 && (
                <Section title="Prerequisites">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {prereqs.map(n => <RelationCard key={n.id} node={n} tag="prerequisite" tagColor="#FF4B4B" />)}
                  </div>
                </Section>
              )}
              {related.length > 0 && (
                <Section title="Related concepts">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {related.map(n => <RelationCard key={n.id} node={n} tag="related" tagColor="#1CB0F6" />)}
                  </div>
                </Section>
              )}
            </div>
          </div>
          {/* Mobile footer */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', gap: 8 }}>
            {onBack && (
              <button onClick={onBack} style={{
                flex: 1, height: 44, borderRadius: 10, background: 'var(--bg-input)',
                border: '1px solid var(--blue)', color: 'var(--blue)', cursor: 'pointer',
                fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
              }}>← Back</button>
            )}
            <button onClick={onClose} style={{
              flex: onBack ? 1 : undefined, width: onBack ? undefined : '100%',
              height: 44, borderRadius: 10, background: 'var(--bg-input)',
              border: '1px solid var(--border)', color: 'var(--text-2)', cursor: 'pointer',
              fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
            }}>Close</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Backdrop — only show when no parent scrim is already active */}
      {!onBack && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 195,
            background: 'var(--overlay-backdrop)',
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
            opacity: visible ? 1 : 0,
            transition: 'opacity 0.28s ease',
          }}
        />
      )}

      {/* Glass panel */}
      <div
        style={{
          position: 'fixed',
          top: '50%', left: '50%',
          transform: visible
            ? 'translate(-50%, -50%) scale(1)'
            : 'translate(-50%, -48%) scale(0.97)',
          width: '82%', maxHeight: '88vh',
          zIndex: 200,
          display: 'flex', flexDirection: 'column',
          background: 'var(--overlay-bg)',
          backdropFilter: 'blur(36px) saturate(1.6)',
          WebkitBackdropFilter: 'blur(36px) saturate(1.6)',
          border: '1px solid var(--overlay-border)',
          borderRadius: 20,
          boxShadow: '0 40px 120px rgba(0,0,0,0.35), inset 0 1px 0 var(--overlay-border)',
          opacity: visible ? 1 : 0,
          transition: 'transform 0.32s cubic-bezier(0.16,1,0.3,1), opacity 0.25s ease',
          overflow: 'hidden',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          padding: '22px 28px 18px',
          borderBottom: '1px solid var(--overlay-line)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--overlay-text-dim)', marginBottom: 6 }}>
              {node.subject ?? 'Concept'} · Explanation
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 28, fontWeight: 900, margin: 0, color: 'var(--text)', letterSpacing: '-0.03em', lineHeight: 1 }}>
                {node.label}
              </h2>
              {node.recall !== null && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '4px 12px', borderRadius: 20,
                  background: rs.bg,
                  border: `1px solid ${rs.color}`,
                  opacity: 0.85,
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: rs.color }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: rs.color }}>{node.recall}% · {rs.label}</span>
                </div>
              )}
              {node.solo && (
                <span style={{ fontSize: 11, color: 'var(--overlay-text-dim)', fontWeight: 500 }}>
                  SOLO: {node.solo}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 16 }}>
            {onBack && (
              <button onClick={onBack} style={{
                height: 34, borderRadius: 9, border: '1px solid var(--overlay-surface-hover)',
                background: 'none', cursor: 'pointer', color: 'var(--blue)',
                fontSize: 12, fontWeight: 600, fontFamily: 'inherit', padding: '0 14px',
              }}>← Back</button>
            )}
            <button
              onClick={onClose}
              style={{
                width: 34, height: 34, borderRadius: 9, border: '1px solid var(--overlay-surface-hover)',
                background: 'var(--overlay-surface)', cursor: 'pointer',
                color: 'var(--overlay-text-mid)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--overlay-surface-hover)'; (e.currentTarget as HTMLElement).style.color = '#fff'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--overlay-surface)'; (e.currentTarget as HTMLElement).style.color = 'var(--overlay-text-mid)'; }}
            >
              <XIcon size={15} />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>

          {/* LEFT: explanation */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

            {/* What it is */}
            {node.summary && (
              <Section title="What it is">
                <p style={{ fontSize: 14, color: 'var(--overlay-text)', lineHeight: 1.75, margin: 0 }}>
                  {node.summary}
                </p>
              </Section>
            )}

            {/* Key claims */}
            {node.claims && node.claims.length > 0 && (
              <Section title="Key statements">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {node.claims.map((claim, i) => (
                    <div key={i} style={{
                      display: 'flex', gap: 10, padding: '10px 14px', borderRadius: 10,
                      background: 'var(--overlay-surface)', border: '1px solid var(--overlay-line)',
                      fontSize: 13, color: 'var(--overlay-text)', alignItems: 'flex-start', lineHeight: 1.6,
                    }}>
                      <span style={{ color: rs.color, fontWeight: 800, flexShrink: 0, fontSize: 13, lineHeight: 1.55 }}>✓</span>
                      {claim}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Process / mechanism */}
            {node.process && node.process.length > 0 && (
              <Section title="Mechanism — step by step">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {node.process.map((step, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, paddingTop: 3 }}>
                        <div style={{
                          width: 22, height: 22, borderRadius: '50%',
                          background: rs.bg, border: `1.5px solid ${rs.color}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 800, color: rs.color,
                        }}>{i + 1}</div>
                        {i < node.process!.length - 1 && (
                          <div style={{ width: 1.5, flex: 1, background: 'var(--overlay-border)', minHeight: 16, marginTop: 3 }} />
                        )}
                      </div>
                      <div style={{ paddingBottom: i < node.process!.length - 1 ? 14 : 0, paddingTop: 3 }}>
                        <span style={{ fontSize: 13, color: 'var(--overlay-text)', lineHeight: 1.6 }}>{step}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Depth bars */}
            {entries.length > 0 && (
              <Section title="Understanding depth">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {entries.map(([key, val], idx) => {
                    const pct = val ?? 0;
                    const hex = pct >= 70 ? '#58CC02' : pct >= 45 ? '#FF9600' : '#FF4B4B';
                    const depthLabel = pct >= 70 ? 'Strong' : pct >= 45 ? 'Developing' : pct >= 25 ? 'Weak' : 'Not yet';
                    return (
                      <div key={key}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                          <span style={{ fontSize: 12, color: 'var(--overlay-text-mid)', fontWeight: 500 }}>
                            {key.charAt(0).toUpperCase() + key.slice(1)}
                          </span>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <span style={{ fontSize: 11, color: hex, fontWeight: 600 }}>{depthLabel}</span>
                            <span style={{ fontSize: 11, color: 'var(--overlay-text-dim)' }}>{pct}%</span>
                          </div>
                        </div>
                        <div style={{ height: 5, background: 'var(--overlay-surface)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', borderRadius: 3,
                            background: `linear-gradient(90deg, ${hex}88, ${hex})`,
                            width: `${pct}%`,
                            transform: barsFilled ? 'scaleX(1)' : 'scaleX(0)',
                            transformOrigin: 'left center',
                            transition: `transform 0.9s cubic-bezier(0.16,1,0.3,1) ${idx * 65}ms`,
                          }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}
          </div>

          {/* RIGHT: correlations */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

            {/* Concept web SVG */}
            {webNodes.length > 0 && (
              <Section title={`Concept web · ${webNodes.length} connections`}>
                <div style={{ background: 'var(--overlay-surface)', border: '1px solid var(--overlay-line)', borderRadius: 12, overflow: 'hidden' }}>
                  <ConceptWeb node={node} allNodes={webNodes} edges={poolEdges} />
                </div>
              </Section>
            )}

            {/* Prerequisites */}
            {prereqs.length > 0 && (
              <Section title="Prerequisites — understand these first">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {prereqs.map(n => <RelationCard key={n.id} node={n} tag="prerequisite" tagColor="#FF4B4B" />)}
                </div>
              </Section>
            )}

            {/* Related concepts */}
            {related.length > 0 && (
              <Section title="Related concepts">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {related.map(n => <RelationCard key={n.id} node={n} tag="related" tagColor="#1CB0F6" />)}
                </div>
              </Section>
            )}

            {/* Dependents */}
            {dependents.length > 0 && (
              <Section title="Concepts that build on this">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {dependents.slice(0, 4).map(n => <RelationCard key={n.id} node={n} tag="depends on this" tagColor="#58CC02" />)}
                </div>
              </Section>
            )}

            {/* Assessment evidence summary */}
            {node.assessmentEvidence && Object.values(node.assessmentEvidence).some(v => v && v !== 'none') && (
              <Section title="Assessment evidence">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                  {(Object.entries(node.assessmentEvidence) as [string, string][]).map(([key, val]) => {
                    const c = val === 'demonstrated' ? '#58CC02' : val === 'developing' ? '#FF9600' : 'var(--text-dim)';
                    const sym = val === 'demonstrated' ? '✓' : val === 'developing' ? '△' : '—';
                    const labelMap: Record<string, string> = { recall: 'Recall', processTrace: 'Process trace', counterfactual: 'Counterfactual', transfer: 'Transfer' };
                    return (
                      <div key={key} style={{
                        padding: '10px 12px', borderRadius: 9,
                        background: `${c}10`, border: `1px solid ${c}30`,
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}>
                        <span style={{ fontSize: 14, color: c, fontWeight: 700, flexShrink: 0 }}>{sym}</span>
                        <span style={{ fontSize: 12, color: 'var(--overlay-text-mid)' }}>{labelMap[key] ?? key}</span>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: '14px 28px', borderTop: '1px solid var(--overlay-line)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          {node.sourceNote && (
            <span style={{ fontSize: 12, color: 'var(--overlay-text-dim)' }}>
              Source: <span style={{ color: 'var(--overlay-text-mid)' }}>{node.sourceNote}</span>
            </span>
          )}
          <button
            onClick={onClose}
            style={{
              marginLeft: 'auto', padding: '8px 22px', borderRadius: 9,
              background: 'var(--overlay-line)', border: '1px solid var(--overlay-surface-hover)',
              color: 'var(--overlay-text-mid)', cursor: 'pointer', fontSize: 13,
              fontWeight: 600, fontFamily: 'inherit', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--overlay-surface-hover)'; (e.currentTarget as HTMLElement).style.color = '#fff'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--overlay-line)'; (e.currentTarget as HTMLElement).style.color = 'var(--overlay-text-mid)'; }}
          >Close <kbd style={{ fontSize: 10, opacity: 0.6, fontFamily: 'inherit' }}>Esc</kbd></button>
        </div>
      </div>
    </>
  );
}

// ── Relation card ─────────────────────────────────────────────────
function RelationCard({ node, tag, tagColor }: { node: GraphNode; tag: string; tagColor: string }) {
  const rs = recallStatus(node.recall);
  const hex = node.recall !== null
    ? node.recall >= 75 ? '#58CC02' : node.recall >= 50 ? '#FF9600' : '#FF4B4B'
    : '#6B7280';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
      borderRadius: 9, background: 'var(--overlay-surface)', border: '1px solid var(--overlay-line)',
      transition: 'border-color 0.15s',
    }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--overlay-border)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--overlay-line)'}
    >
      {node.locked
        ? <Lock size={12} stroke="var(--overlay-text-dim)" />
        : <div style={{ width: 7, height: 7, borderRadius: '50%', background: rs.color, flexShrink: 0 }} />
      }
      <span style={{ flex: 1, fontSize: 13, color: node.locked ? 'var(--overlay-text-dim)' : 'var(--overlay-text)', fontWeight: 500 }}>{node.label}</span>
      {!node.locked && node.recall !== null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 40, height: 3, background: 'var(--overlay-border)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${node.recall}%`, background: `linear-gradient(90deg, ${hex}88, ${hex})`, borderRadius: 2 }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: rs.color, width: 28, textAlign: 'right' }}>{node.recall}%</span>
        </div>
      )}
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: tagColor, background: `${tagColor}18`, padding: '2px 7px', borderRadius: 4, flexShrink: 0 }}>{tag}</span>
    </div>
  );
}

// ── Section ────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--overlay-text-dim)' }}>{title}</span>
        <div style={{ flex: 1, height: 1, background: 'var(--overlay-line)' }} />
      </div>
      {children}
    </div>
  );
}
