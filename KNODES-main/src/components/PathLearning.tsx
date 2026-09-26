import { useState, useEffect, useRef } from 'react';
import type { GraphNode } from '../types';
import { demoNodes, recallStatus } from '../data/demo';
import { X as XIcon } from './Icon';

// ── Data model ──────────────────────────────────────────────────────────────

interface DeepLessonSection {
  id: string;
  type: 'context' | 'definition' | 'mental-model' | 'why' | 'mechanism'
    | 'example' | 'walkthrough' | 'boundary' | 'contrast'
    | 'misconception' | 'connection' | 'carry-forward';
  title: string;
  body?: string;
  bullets?: string[];
  code?: string;
  codeAnnotations?: string[];
}

interface DeepPathStep {
  node: GraphNode;
  role: 'foundation' | 'required' | 'target' | 'related';
  prerequisiteReason: string;
  sections: DeepLessonSection[];
  keyIdeas: string[];
  bridgeToNext?: string;
}

// ── Path builder ─────────────────────────────────────────────────────────────

function buildDeepPath(targetNode: GraphNode, allNodes: GraphNode[]): DeepPathStep[] {
  const visited = new Set<string>();
  const steps: DeepPathStep[] = [];

  function collectPrereqs(nodeId: string, depth: number): void {
    if (visited.has(nodeId) || depth > 6) return;
    visited.add(nodeId);
    const node = allNodes.find(n => n.id === nodeId);
    if (!node) return;
    for (const pid of (node.prerequisites ?? [])) {
      collectPrereqs(pid, depth + 1);
    }
    if (nodeId !== targetNode.id) {
      steps.push(buildStep(node, nodeId === targetNode.id ? 'target' : depth === 0 ? 'required' : 'foundation', allNodes, targetNode));
    }
  }

  collectPrereqs(targetNode.id, 0);
  steps.push(buildStep(targetNode, 'target', allNodes, null));
  return steps;
}

function buildStep(node: GraphNode, role: DeepPathStep['role'], allNodes: GraphNode[], target: GraphNode | null): DeepPathStep {
  const isTarget = role === 'target';
  const sections: DeepLessonSection[] = [];

  // Context
  sections.push({
    id: 'context',
    type: 'context',
    title: 'Context',
    body: isTarget
      ? `${node.label} is the concept at the end of this path. Understanding the foundations brings you here.`
      : target
        ? `${node.label} is a required foundation before understanding ${target.label}.`
        : `${node.label} establishes foundational context.`,
  });

  // Definition
  if (node.summary) {
    sections.push({
      id: 'definition',
      type: 'definition',
      title: 'Core Definition',
      body: node.summary,
    });
  }

  // Mental model (for concepts with clear structure)
  if (node.prerequisites && node.prerequisites.length > 0) {
    const prereqLabels = node.prerequisites
      .map(pid => allNodes.find(n => n.id === pid)?.label)
      .filter(Boolean);
    sections.push({
      id: 'mental-model',
      type: 'mental-model',
      title: 'Mental Model',
      bullets: [...prereqLabels.map(l => `${l} → ${node.label}`), `${node.label} builds on these foundations`],
    });
  }

  // Why it exists (for target always, others if role is 'required' or 'target')
  if (isTarget || role === 'required') {
    sections.push({
      id: 'why',
      type: 'why',
      title: 'Why It Exists',
      body: isTarget
        ? `${node.label} exists to solve a specific need in its domain. Understanding why it was introduced makes its behavior predictable.`
        : `${node.label} exists as a building block that ${target?.label ?? 'the target concept'} directly depends on.`,
    });
  }

  // Mechanism / process
  if (node.process && node.process.length > 0) {
    sections.push({
      id: 'mechanism',
      type: 'mechanism',
      title: 'How It Works',
      bullets: node.process,
    });
  }

  // Claims as key ideas
  if (node.claims && node.claims.length > 0) {
    sections.push({
      id: 'claims',
      type: 'definition',
      title: 'Key Facts',
      bullets: node.claims,
    });
  }

  // Boundary (for target and required)
  if (isTarget || role === 'required') {
    const related = (node.related ?? []).map(rid => allNodes.find(n => n.id === rid)?.label).filter(Boolean);
    if (related.length > 0) {
      sections.push({
        id: 'boundary',
        type: 'boundary',
        title: 'Boundary',
        body: `${node.label} is distinct from related concepts.`,
        bullets: related.map(l => `Not to be confused with: ${l}`),
      });
    }
  }

  // Carry forward
  const keyIdeas = node.claims?.slice(0, 2) ?? [`${node.label} is a necessary foundation.`];
  sections.push({
    id: 'carry-forward',
    type: 'carry-forward',
    title: 'Carry Forward',
    bullets: keyIdeas,
  });

  return {
    node,
    role,
    prerequisiteReason: target
      ? `${node.label} comes before ${target.label} because ${target.label} relies on it directly.`
      : '',
    sections,
    keyIdeas,
    bridgeToNext: target
      ? `With ${node.label} established, the path continues toward ${target.label}.`
      : undefined,
  };
}

// ── Section type meta ─────────────────────────────────────────────────────────

const sectionMeta: Record<string, { icon: string; color: string }> = {
  context: { icon: '◈', color: 'var(--text-dim)' },
  definition: { icon: '◆', color: 'var(--blue)' },
  'mental-model': { icon: '⬡', color: 'var(--blue)' },
  why: { icon: '◎', color: 'var(--orange)' },
  mechanism: { icon: '◧', color: 'var(--text-2)' },
  example: { icon: '◉', color: 'var(--green)' },
  walkthrough: { icon: '◐', color: 'var(--green)' },
  boundary: { icon: '◫', color: 'var(--orange)' },
  contrast: { icon: '⊟', color: 'var(--text-dim)' },
  misconception: { icon: '⚠', color: 'var(--red)' },
  connection: { icon: '◈', color: 'var(--blue)' },
  'carry-forward': { icon: '→', color: 'var(--green)' },
};

// ── Component ─────────────────────────────────────────────────────────────────

function useVW() {
  const [vw, setVw] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setVw(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return vw;
}

interface Props {
  node: GraphNode;
  nodes: GraphNode[];
  onClose: () => void;
  onBack?: () => void;
}

export default function PathLearning({ node, nodes, onClose, onBack }: Props) {
  const [activeStep, setActiveStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [whyExpanded, setWhyExpanded] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [reviewingPrereqOf, setReviewingPrereqOf] = useState<string | null>(null);
  const lessonRef = useRef<HTMLDivElement>(null);

  const vw = useVW();
  const isMobile = vw < 640;
  const allNodes = nodes.length > 0 ? nodes : demoNodes;
  const steps = buildDeepPath(node, allNodes);
  const totalSteps = steps.length;
  const currentStep = steps[activeStep];
  const isLast = activeStep === totalSteps - 1;

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    setActiveStep(0);
    setWhyExpanded(false);
    setCompleted(false);
    setExpandedSections(new Set());
    setReviewingPrereqOf(null);
  }, [node.id]);

  useEffect(() => {
    lessonRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    setExpandedSections(new Set());
  }, [activeStep]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const goNext = () => {
    if (isLast) {
      setCompleted(true);
    } else {
      setActiveStep(s => s + 1);
      setWhyExpanded(false);
      setReviewingPrereqOf(null);
    }
  };

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const stepState = (idx: number): 'done' | 'active' | 'upcoming' => {
    if (idx < activeStep || completed) return 'done';
    if (idx === activeStep) return 'active';
    return 'upcoming';
  };

  const goToStep = (idx: number) => {
    if (completed) return;
    if (idx < activeStep) {
      setReviewingPrereqOf(steps[activeStep]?.node.label ?? null);
    } else {
      setReviewingPrereqOf(null);
    }
    setActiveStep(idx);
    setWhyExpanded(false);
  };

  const roleMap = {
    foundation: { label: 'Foundation', color: 'var(--blue)', bg: 'rgba(28,176,246,0.09)' },
    required: { label: 'Required first', color: 'var(--orange)', bg: 'rgba(255,150,0,0.09)' },
    target: { label: 'Target concept', color: 'var(--green)', bg: 'rgba(88,204,2,0.09)' },
    related: { label: 'Related next', color: 'var(--text-dim)', bg: 'rgba(120,120,140,0.09)' },
  };

  const recall = recallStatus(currentStep?.node.recall ?? null);

  if (isMobile) {
    return (
      <>
        {!onBack && <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 195 }} />}
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'var(--bg-elevated)', display: 'flex', flexDirection: 'column',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.35s cubic-bezier(0.16,1,0.3,1)',
        }}>
          {/* Mobile header */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            {onBack && (
              <button onClick={onBack} style={{
                height: 32, borderRadius: 10, border: '1px solid var(--border)',
                background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                color: 'var(--blue)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', padding: '0 10px', flexShrink: 0,
              }}>← Back</button>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 2 }}>Learn This Path</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {completed ? 'Path complete ✓' : `${node.label}`}
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0, textAlign: 'right' }}>
              {completed ? `${totalSteps}/${totalSteps}` : `${activeStep + 1}/${totalSteps}`}
            </div>
            <button onClick={onClose} style={{
              width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--border)',
              background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', flexShrink: 0,
            }}><XIcon size={14} /></button>
          </div>

          {/* Progress bar */}
          <div style={{ height: 3, background: 'var(--border)', flexShrink: 0 }}>
            <div style={{ height: '100%', background: 'var(--green)', width: `${completed ? 100 : (activeStep / totalSteps) * 100}%`, transition: 'width 0.5s cubic-bezier(0.16,1,0.3,1)' }} />
          </div>

          {/* Step pills — horizontal scrollable */}
          <div style={{ flexShrink: 0, borderBottom: '1px solid var(--border)', overflowX: 'auto', display: 'flex', gap: 6, padding: '8px 16px', scrollbarWidth: 'none' }}>
            {steps.map((s, i) => {
              const state = stepState(i);
              const isActive = i === activeStep && !completed;
              const rm = roleMap[s.role];
              return (
                <button key={s.node.id} onClick={() => goToStep(i)} style={{
                  flexShrink: 0, padding: '5px 12px', borderRadius: 20,
                  background: isActive ? rm.color : state === 'done' ? 'rgba(88,204,2,0.12)' : 'var(--bg-input)',
                  border: isActive ? 'none' : state === 'done' ? '1px solid rgba(88,204,2,0.3)' : '1px solid var(--border)',
                  color: isActive ? '#fff' : state === 'done' ? 'var(--green)' : 'var(--text-muted)',
                  fontSize: 11, fontWeight: isActive ? 700 : 400, cursor: 'pointer',
                  fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'all 0.2s',
                }}>
                  {state === 'done' && !isActive ? '✓ ' : ''}{s.node.label}
                </button>
              );
            })}
          </div>

          {/* Lesson content */}
          <div ref={lessonRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 16px' }}>
            {completed ? (
              <CompletionScreen steps={steps} targetNode={node} onClose={onClose} allNodes={allNodes} />
            ) : (
              <div style={{ animation: 'fadeUp 0.2s ease' }} key={activeStep}>
                {/* Step label */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: roleMap[currentStep.role].color, padding: '3px 10px', borderRadius: 6, background: roleMap[currentStep.role].bg }}>
                    {roleMap[currentStep.role].label}
                  </span>
                  {currentStep.node.recall !== null && (
                    <span style={{ fontSize: 11, color: recall.color, fontWeight: 600 }}>Recall: {recall.label}</span>
                  )}
                </div>
                <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--text)', marginBottom: 16, letterSpacing: '-0.025em', lineHeight: 1.2 }}>
                  {currentStep.node.label}
                </div>

                {/* Why first? */}
                {currentStep.role !== 'target' && currentStep.prerequisiteReason && (
                  <div style={{ marginBottom: 16 }}>
                    <button onClick={() => setWhyExpanded(!whyExpanded)} style={{
                      display: 'flex', alignItems: 'center', gap: 6, background: 'none',
                      border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--blue)',
                      fontFamily: 'inherit', fontWeight: 600, padding: 0,
                    }}>
                      <span style={{ transform: whyExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>▶</span>
                      Why do I need this first?
                    </button>
                    {whyExpanded && (
                      <div style={{ marginTop: 8, padding: '10px 14px', borderRadius: 8, background: 'rgba(28,176,246,0.06)', border: '1px solid rgba(28,176,246,0.2)', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.65, animation: 'fadeUp 0.15s ease' }}>
                        {currentStep.prerequisiteReason}
                      </div>
                    )}
                  </div>
                )}

                {/* Lesson sections */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {currentStep.sections.map((section, si) => {
                    const meta = sectionMeta[section.type] ?? { icon: '·', color: 'var(--text-dim)' };
                    const isCollapsible = currentStep.role !== 'target' && si > 1;
                    const isOpen = !isCollapsible || expandedSections.has(section.id);
                    return (
                      <div key={section.id} style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', background: section.type === 'carry-forward' ? 'rgba(88,204,2,0.05)' : section.type === 'misconception' ? 'rgba(255,75,75,0.05)' : 'var(--bg)' }}>
                        <button onClick={isCollapsible ? () => toggleSection(section.id) : undefined} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: isCollapsible ? 'pointer' : 'default', fontFamily: 'inherit', textAlign: 'left' }}>
                          <span style={{ fontSize: 12, color: meta.color, flexShrink: 0 }}>{meta.icon}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-dim)', flex: 1 }}>{section.title}</span>
                          {isCollapsible && <span style={{ fontSize: 12, color: 'var(--text-dim)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>}
                        </button>
                        {isOpen && (
                          <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)' }}>
                            {section.body && <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7, margin: '10px 0 0' }}>{section.body}</p>}
                            {section.bullets && <ul style={{ margin: '10px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>{section.bullets.map((b, bi) => <li key={bi} style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>{b}</li>)}</ul>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {currentStep.bridgeToNext && (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.65, fontStyle: 'italic', marginTop: 16, marginBottom: 0 }}>{currentStep.bridgeToNext}</p>
                )}
              </div>
            )}
          </div>

          {/* Mobile bottom nav */}
          {!completed && (
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', gap: 8 }}>
              {activeStep > 0 && (
                <button onClick={() => goToStep(activeStep - 1)} style={{
                  flex: 1, height: 44, borderRadius: 10, background: 'var(--bg-input)',
                  border: '1px solid var(--border)', color: 'var(--text-2)',
                  cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                }}>← Previous</button>
              )}
              <button onClick={goNext} style={{
                flex: 2, height: 44, borderRadius: 10,
                background: isLast ? 'var(--green)' : 'var(--blue)',
                color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14,
                fontWeight: 700, fontFamily: 'inherit',
              }}>
                {isLast ? 'Finish path →' : `Next →`}
              </button>
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      {/* Backdrop — when no parent scrim, dim graph */}
      {!onBack && <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 150 }} />}

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(90vw, 1180px)',
        background: 'var(--bg-elevated)', borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', zIndex: 200,
        transform: visible ? 'translateX(0)' : 'translateX(40px)',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.35s cubic-bezier(0.16,1,0.3,1), opacity 0.28s ease',
        boxShadow: '-8px 0 40px rgba(0,0,0,0.35)',
      }}>

        {/* Header */}
        <div style={{
          padding: '16px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 5 }}>
              Learn This Path
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {steps.map((s, i) => (
                <span key={s.node.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => goToStep(i)}
                    style={{
                      fontSize: 13, fontWeight: i === activeStep && !completed ? 700 : 400,
                      color: stepState(i) === 'done' ? 'var(--green)' : i === activeStep && !completed ? 'var(--text)' : 'var(--text-dim)',
                      background: 'none', border: 'none', cursor: completed ? 'default' : 'pointer',
                      fontFamily: 'inherit', padding: 0, transition: 'color 0.2s',
                    }}
                  >{stepState(i) === 'done' ? '✓ ' : ''}{s.node.label}</button>
                  {i < steps.length - 1 && <span style={{ color: 'var(--border-strong)', fontSize: 11 }}>→</span>}
                </span>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0, textAlign: 'right' }}>
            {completed ? 'Path complete' : `Step ${activeStep + 1} of ${totalSteps}`}
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>
              {steps.filter((_, i) => i < activeStep).length} foundations established
            </div>
          </div>
          {onBack && (
            <button onClick={onBack} style={{
              height: 32, borderRadius: 8, border: '1px solid var(--border)',
              background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              color: 'var(--blue)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', padding: '0 12px', flexShrink: 0,
            }}>← Back</button>
          )}
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--border)',
            background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: 'var(--text-muted)', flexShrink: 0,
          }}><XIcon size={14} /></button>
        </div>

        {/* Progress bar */}
        <div style={{ height: 2, background: 'var(--border)', flexShrink: 0 }}>
          <div style={{
            height: '100%', background: 'var(--green)',
            width: `${completed ? 100 : (activeStep / totalSteps) * 100}%`,
            transition: 'width 0.5s cubic-bezier(0.16,1,0.3,1)',
          }} />
        </div>

        {/* Body — three columns */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>

          {/* Left rail — Path Map */}
          <div style={{
            width: 240, flexShrink: 0, borderRight: '1px solid var(--border)',
            padding: '20px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 14 }}>
              Path to: {node.label}
            </div>
            {steps.map((step, i) => {
              const state = stepState(i);
              const isActive = i === activeStep && !completed;
              const rm = roleMap[step.role];
              return (
                <div key={step.node.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                    <button onClick={() => goToStep(i)} style={{
                      width: 26, height: 26, borderRadius: '50%',
                      border: isActive ? `1.5px solid ${rm.color}` : state === 'done' ? 'none' : '1px solid var(--border)',
                      background: state === 'done' ? 'var(--green)' : isActive ? rm.bg : 'var(--bg-input)',
                      color: state === 'done' ? '#fff' : isActive ? rm.color : 'var(--text-dim)',
                      cursor: completed ? 'default' : 'pointer',
                      fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'inherit', transition: 'all 0.25s', flexShrink: 0,
                    }}>
                      {state === 'done' ? '✓' : isActive ? '●' : '○'}
                    </button>
                    {i < steps.length - 1 && (
                      <div style={{ width: 1, height: 28, background: state === 'done' ? 'var(--green)' : 'var(--border)', opacity: 0.5, margin: '3px 0' }} />
                    )}
                  </div>
                  <div style={{ paddingTop: 3, paddingBottom: i < steps.length - 1 ? 24 : 0, minWidth: 0 }}>
                    <button onClick={() => goToStep(i)} style={{
                      background: 'none', border: 'none', cursor: completed ? 'default' : 'pointer',
                      fontFamily: 'inherit', padding: 0, textAlign: 'left',
                    }}>
                      <div style={{
                        fontSize: 12, fontWeight: isActive ? 600 : 400,
                        color: isActive ? 'var(--text)' : state === 'done' ? 'var(--green)' : 'var(--text-dim)',
                        marginBottom: 1,
                      }}>{step.node.label}</div>
                      <div style={{ fontSize: 10, color: rm.color, fontWeight: 600 }}>{rm.label}</div>
                    </button>
                    {/* Why here? */}
                    {step.prerequisiteReason && i !== steps.length - 1 && (
                      <button
                        onClick={() => setWhyExpanded(w => !w && i === activeStep ? !w : false)}
                        style={{
                          fontSize: 9, color: 'var(--blue)', background: 'none',
                          border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                          padding: '2px 0', marginTop: 2, letterSpacing: '0.03em',
                        }}
                      >Why here?</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Center — Deep Lesson */}
          <div ref={lessonRef} style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', minWidth: 0 }}>

            {completed ? (
              <CompletionScreen steps={steps} targetNode={node} onClose={onClose} allNodes={allNodes} />
            ) : (
              <div style={{ maxWidth: 680, animation: 'fadeUp 0.25s ease' }} key={activeStep}>

                {/* Reviewing prerequisite banner */}
                {reviewingPrereqOf && (
                  <div style={{
                    padding: '8px 14px', borderRadius: 8, marginBottom: 16,
                    background: 'rgba(28,176,246,0.08)', border: '1px solid rgba(28,176,246,0.25)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  }}>
                    <span style={{ fontSize: 12, color: 'var(--blue)' }}>
                      Reviewing prerequisite of {reviewingPrereqOf}
                    </span>
                    <button
                      onClick={() => { setActiveStep(steps.length - 1); setReviewingPrereqOf(null); }}
                      style={{
                        fontSize: 11, color: 'var(--blue)', background: 'none', border: 'none',
                        cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, whiteSpace: 'nowrap',
                      }}
                    >Return to {node.label} →</button>
                  </div>
                )}

                {/* Step header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                  <span style={{
                    fontSize: 28, fontWeight: 900, color: 'var(--border-strong)',
                    letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums',
                  }}>
                    {String(activeStep + 1).padStart(2, '0')}
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
                      color: roleMap[currentStep.role].color,
                      padding: '2px 8px', borderRadius: 4,
                      background: roleMap[currentStep.role].bg,
                    }}>
                      Step {activeStep + 1} · {roleMap[currentStep.role].label}
                    </span>
                    {currentStep.node.recall !== null && (
                      <span style={{ fontSize: 10, color: recall.color, fontWeight: 600 }}>
                        Recall: {recall.label}
                      </span>
                    )}
                  </div>
                </div>

                {/* Concept name */}
                <div style={{
                  fontSize: 30, fontWeight: 900, color: 'var(--text)',
                  marginBottom: 20, letterSpacing: '-0.025em', lineHeight: 1.15,
                }}>
                  {currentStep.node.label}
                </div>

                {/* Why first? */}
                {currentStep.role !== 'target' && currentStep.prerequisiteReason && (
                  <div style={{ marginBottom: 20 }}>
                    <button
                      onClick={() => setWhyExpanded(!whyExpanded)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, background: 'none',
                        border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--blue)',
                        fontFamily: 'inherit', fontWeight: 600, padding: 0, marginBottom: whyExpanded ? 8 : 0,
                      }}
                    >
                      <span style={{ transform: whyExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>▶</span>
                      Why do I need this first?
                    </button>
                    {whyExpanded && (
                      <div style={{
                        padding: '12px 14px', borderRadius: 8,
                        background: 'rgba(28,176,246,0.06)', border: '1px solid rgba(28,176,246,0.2)',
                        fontSize: 13, color: 'var(--text-2)', lineHeight: 1.65, animation: 'fadeUp 0.15s ease',
                      }}>
                        {currentStep.prerequisiteReason}
                      </div>
                    )}
                  </div>
                )}

                {/* Lesson sections */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {currentStep.sections.map((section, si) => {
                    const meta = sectionMeta[section.type] ?? { icon: '·', color: 'var(--text-dim)' };
                    const isCollapsible = currentStep.role !== 'target' && si > 1;
                    const isOpen = !isCollapsible || expandedSections.has(section.id);

                    return (
                      <div key={section.id} style={{
                        borderRadius: 10, overflow: 'hidden',
                        border: '1px solid var(--border)',
                        background: section.type === 'carry-forward' ? 'rgba(88,204,2,0.05)'
                          : section.type === 'misconception' ? 'rgba(255,75,75,0.05)'
                          : 'var(--bg)',
                        animation: 'fadeUp 0.2s ease',
                      }}>
                        <button
                          onClick={isCollapsible ? () => toggleSection(section.id) : undefined}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                            padding: '10px 14px', background: 'none', border: 'none',
                            cursor: isCollapsible ? 'pointer' : 'default',
                            fontFamily: 'inherit', textAlign: 'left',
                          }}
                        >
                          <span style={{ fontSize: 12, color: meta.color, flexShrink: 0 }}>{meta.icon}</span>
                          <span style={{
                            fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
                            textTransform: 'uppercase', color: 'var(--text-dim)', flex: 1,
                          }}>{section.title}</span>
                          {isCollapsible && (
                            <span style={{
                              fontSize: 12, color: 'var(--text-dim)',
                              transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s',
                            }}>▾</span>
                          )}
                        </button>

                        {isOpen && (
                          <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)' }}>
                            {section.body && (
                              <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.7, margin: '10px 0 0' }}>
                                {section.body}
                              </p>
                            )}
                            {section.bullets && (
                              <ul style={{ margin: '10px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {section.bullets.map((b, bi) => (
                                  <li key={bi} style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>{b}</li>
                                ))}
                              </ul>
                            )}
                            {section.code && (
                              <pre style={{
                                margin: '10px 0 0', padding: '12px 14px', borderRadius: 8,
                                background: 'var(--bg-input)', border: '1px solid var(--border)',
                                fontSize: 12, fontFamily: 'monospace', color: 'var(--text)',
                                overflowX: 'auto', lineHeight: 1.65,
                              }}>{section.code}</pre>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Bridge */}
                {currentStep.bridgeToNext && (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.65, fontStyle: 'italic', marginTop: 20, marginBottom: 0 }}>
                    {currentStep.bridgeToNext}
                  </p>
                )}

                {/* Continue */}
                <button
                  onClick={goNext}
                  style={{
                    marginTop: 24, padding: '12px 28px', borderRadius: 10,
                    background: isLast ? 'var(--green)' : 'var(--blue)',
                    color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14,
                    fontWeight: 700, fontFamily: 'inherit', letterSpacing: '-0.01em',
                    transition: 'opacity 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.88'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
                >
                  {isLast ? 'Finish path →' : `Continue to ${steps[activeStep + 1]?.node.label} →`}
                </button>
              </div>
            )}
          </div>

          {/* Right rail — Context (desktop only) */}
          <ContextRail step={currentStep} allNodes={allNodes} completed={completed} targetNode={node} />
        </div>
      </div>
    </>
  );
}

// ── Context Rail ──────────────────────────────────────────────────────────────

function ContextRail({ step, allNodes, completed, targetNode }: {
  step: DeepPathStep | undefined;
  allNodes: GraphNode[];
  completed: boolean;
  targetNode: GraphNode;
}) {
  if (!step || completed) return null;
  const related = (step.node.related ?? []).slice(0, 4)
    .map(rid => allNodes.find(n => n.id === rid))
    .filter(Boolean) as GraphNode[];

  return (
    <div style={{
      width: 240, flexShrink: 0, borderLeft: '1px solid var(--border)',
      padding: '20px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18,
    }}>
      {/* Connection */}
      <div>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 8 }}>
          Connection
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>
          {step.role === 'target'
            ? `Target of this path`
            : `Required before ${targetNode.label}`}
        </div>
        {step.node.prerequisites && step.node.prerequisites.length > 0 && (
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-dim)' }}>
            {step.node.prerequisites.map(pid => allNodes.find(n => n.id === pid)?.label).filter(Boolean).join(' → ')}
            {' → '}<span style={{ color: 'var(--text-2)', fontWeight: 600 }}>{step.node.label}</span>
          </div>
        )}
      </div>

      {/* Key claims */}
      {step.keyIdeas.length > 0 && (
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 8 }}>
            Key Claims
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {step.keyIdeas.map((idea, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--green)', fontSize: 11, flexShrink: 0, marginTop: 1 }}>✓</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55 }}>{idea}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Related concepts */}
      {related.length > 0 && (
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 8 }}>
            Related
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {related.map(rn => {
              const rs = recallStatus(rn.recall);
              return (
                <div key={rn.id} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 8px', borderRadius: 6,
                  background: 'var(--bg)', border: '1px solid var(--border)',
                }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: rs.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{rn.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recall */}
      {step.node.recall !== null && (
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 6 }}>
            Recall Status
          </div>
          <div style={{
            fontSize: 12, fontWeight: 600,
            color: recallStatus(step.node.recall).color,
          }}>{recallStatus(step.node.recall).label}</div>
        </div>
      )}
    </div>
  );
}

// ── Completion Screen ─────────────────────────────────────────────────────────

function CompletionScreen({ steps, targetNode, onClose, allNodes }: {
  steps: DeepPathStep[];
  targetNode: GraphNode;
  onClose: () => void;
  allNodes: GraphNode[];
}) {
  const nextConcepts = (targetNode.related ?? []).slice(0, 3)
    .map(rid => allNodes.find(n => n.id === rid))
    .filter(Boolean) as GraphNode[];

  return (
    <div style={{ maxWidth: 600, animation: 'fadeUp 0.3s ease' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--green)', marginBottom: 6 }}>
        Path Completed
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', marginBottom: 8, letterSpacing: '-0.02em' }}>
        You traced {targetNode.label} back through its foundations.
      </div>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 28, lineHeight: 1.6 }}>
        {steps.length} concepts covered. You reached the explanatory target — not mastery, but the foundational structure needed to understand {targetNode.label}.
      </p>

      {/* Path summary */}
      <div style={{
        padding: '18px 20px', borderRadius: 12, background: 'var(--bg)',
        border: '1px solid var(--border)', marginBottom: 24,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 12 }}>
          Path Coverage
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)' }}>{steps.length}</div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>concepts</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--blue)' }}>{steps.filter(s => s.role === 'foundation' || s.role === 'required').length}</div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>foundations</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>1</div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>target</div>
          </div>
        </div>
        {steps.map((s, i) => (
          <div key={s.node.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: i < steps.length - 1 ? 8 : 0 }}>
            <span style={{ fontSize: 13, color: 'var(--green)', flexShrink: 0, marginTop: 2 }}>✓</span>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{s.node.label}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}> · {s.keyIdeas[0]}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Where to go next */}
      {nextConcepts.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 10 }}>
            Where to Go Next
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {nextConcepts.map(rn => (
              <div key={rn.id} style={{
                padding: '8px 12px', borderRadius: 8, background: 'var(--bg)',
                border: '1px solid var(--border)', fontSize: 12,
              }}>
                <div style={{ fontWeight: 500, color: 'var(--text-2)', marginBottom: 2 }}>{rn.label}</div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>Related next</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button style={{
          padding: '10px 20px', borderRadius: 8, background: 'var(--green)',
          color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13,
          fontWeight: 600, fontFamily: 'inherit',
        }}>Retest {targetNode.label}</button>
        <button onClick={onClose} style={{
          padding: '10px 20px', borderRadius: 8, background: 'none',
          color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer',
          fontSize: 13, fontFamily: 'inherit',
        }}>← Back to Brain</button>
      </div>
    </div>
  );
}
