import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp, recallToPercent } from '../context/AppContext';
import { recallStatus } from '../data/demo';
import { api, describeApiError } from '../lib/api';
import { Zap, Puzzle, PartyPopper, Target, Check, X as XIcon, RefreshCw } from '../components/Icon';

type ReviewMode = 'abstract' | 'understand';

function useVW() {
  const [vw, setVw] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setVw(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return vw;
}

// ── API shapes (coded defensively; the queue is being revised server-side) ──
interface QueueItem {
  conceptId: string;
  label: string;
  /** 0..100 or null when never reviewed */
  recall: number | null;
  subject?: string;
  isDetour: boolean;
  detourReason: string | null;
  probeId: string | null;
  prompt: string | null;
}

interface GapHint {
  hint?: string;
  category?: string;
  prerequisite_concept_label?: string | null;
}

interface GradeResult {
  band?: string;
  passed?: boolean;
  gap_report?: { missing_claims?: GapHint[]; correct?: boolean; misconception_tag?: string | null; empty_answer?: boolean };
  mastery?: { mastered?: boolean; newly_mastered?: boolean } | null;
  solo_level?: string | null;
  next_review_at?: string | null;
}

/** A probe served by POST /api/review/probe (learner-visible fields only). */
interface Probe {
  probeId: string;
  prompt: string;
  type: string;
  /** MCQ: options[]; CONCEPT_SORT: items[] */
  options: string[];
  items: string[];
}

interface SessionResult {
  label: string;
  /** Understanding band (Full / Shallow / Incomplete / Not yet engaged); null if not graded */
  band: string | null;
  passed: boolean | null;
  before: number | null;
}

const SORT_GROUPS = ['A', 'B', 'C'];

function bandLabel(band: string | null | undefined): string {
  if (!band) return '';
  return band === 'Not_Yet_Engaged' ? 'Not yet engaged' : band.replace(/_/g, ' ');
}

function bandColor(band: string | null): string {
  if (band === 'Full') return '#58CC02';
  if (band === 'Shallow') return '#1CB0F6';
  if (band === 'Incomplete') return '#FF9600';
  if (band) return '#FF4B4B';
  return '#6B7280';
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapQueueItem(raw: any, recallById: Map<string, number | null>, subjectById: Map<string, string | undefined>): QueueItem | null {
  const conceptId = raw?.concept_id ?? raw?.conceptId ?? raw?.id;
  if (!conceptId) return null;
  const probe = raw?.probe ?? null;
  const graphRecall = recallById.has(conceptId) ? recallById.get(conceptId)! : undefined;
  return {
    conceptId,
    label: raw?.concept_label ?? raw?.canonical_label ?? raw?.label ?? 'Concept',
    recall: graphRecall !== undefined ? graphRecall : recallToPercent(raw?.recall_probability ?? raw?.recall ?? null),
    subject: subjectById.get(conceptId),
    isDetour: !!raw?.is_detour,
    detourReason: raw?.detour_reason ?? null,
    probeId: raw?.probe_id ?? probe?.id ?? probe?.probe_id ?? null,
    prompt: raw?.prompt ?? raw?.question ?? probe?.prompt ?? probe?.question ?? probe?.text ?? null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function isGrade(r: unknown): r is GradeResult {
  return !!r && typeof r === 'object' && typeof (r as GradeResult).passed === 'boolean';
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapProbe(raw: any): Probe | null {
  if (!raw?.probe_id || !raw?.prompt_text) return null;
  const payload = raw.payload && typeof raw.payload === 'object' ? raw.payload : {};
  return {
    probeId: String(raw.probe_id),
    prompt: String(raw.prompt_text),
    type: String(raw.probe_type || ''),
    options: Array.isArray(payload.options) ? payload.options.map(String) : [],
    items: Array.isArray(payload.items) ? payload.items.map(String) : [],
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function fallbackPrompt(label: string, mode: ReviewMode) {
  return mode === 'abstract'
    ? `In a sentence or two, what is ${label}?`
    : `Explain ${label} in your own words: what it is, how it works, and why it matters.`;
}

export default function RetestPage() {
  const { nodes, refreshGraph } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const focusNodeId = (location.state as { nodeId?: string } | null)?.nodeId ?? null;
  const vw = useVW();
  const isMobile = vw < 640;

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueStatus, setQueueStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [queueError, setQueueError] = useState<string | null>(null);

  const [mode, setMode] = useState<ReviewMode | null>(null);
  const [queueIndex, setQueueIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [grade, setGrade] = useState<GradeResult | null>(null);
  const [ungraded, setUngraded] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [results, setResults] = useState<SessionResult[]>([]);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [probeStatus, setProbeStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [probeError, setProbeError] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [sortAssignment, setSortAssignment] = useState<string[]>([]);

  const loadQueue = useCallback(async () => {
    setQueueStatus('loading');
    setQueueError(null);
    try {
      const data = await api<unknown>('/api/review/queue');
      const rawItems: unknown[] = Array.isArray(data)
        ? data
        : Array.isArray((data as { queue?: unknown[] })?.queue) ? (data as { queue: unknown[] }).queue
        : Array.isArray((data as { items?: unknown[] })?.items) ? (data as { items: unknown[] }).items
        : [];
      const recallById = new Map(nodes.map(n => [n.id, n.recall]));
      const subjectById = new Map(nodes.map(n => [n.id, n.subject]));
      let items = rawItems
        .map(r => mapQueueItem(r, recallById, subjectById))
        .filter((i): i is QueueItem => i !== null);
      // "Retest" from a concept panel: put that concept first (add it if the queue doesn't have it).
      if (focusNodeId) {
        const existing = items.find(i => i.conceptId === focusNodeId);
        const n = nodes.find(x => x.id === focusNodeId);
        const focused: QueueItem | null = existing ?? (n && !n.locked ? {
          conceptId: n.id, label: n.label, recall: n.recall, subject: n.subject,
          isDetour: false, detourReason: null, probeId: null, prompt: null,
        } : null);
        if (focused) items = [focused, ...items.filter(i => i.conceptId !== focusNodeId)];
      }
      setQueue(items);
      setQueueStatus('ready');
    } catch (err) {
      setQueueError(describeApiError(err, 'Could not load your review queue.'));
      setQueueStatus('error');
    }
    // nodes are read for enrichment only; don't refetch the queue on every graph refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNodeId]);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  // Fetch a probe (question) for the current concept once a mode is chosen.
  // Abstract mode asks for a short cloze; Understand lets the backend pick by SOLO level.
  const currentConceptId = queue[queueIndex]?.conceptId ?? null;
  const loadProbe = useCallback(async () => {
    if (!mode || !currentConceptId) return;
    setProbe(null);
    setProbeStatus('loading');
    setProbeError(null);
    setSelectedOption(null);
    setSortAssignment([]);
    try {
      const body: Record<string, unknown> = { concept_id: currentConceptId };
      if (mode === 'abstract') body.probe_type = 'CLOZE';
      const res = await api<unknown>('/api/review/probe', { method: 'POST', body });
      const p = mapProbe(res);
      if (!p) throw new Error('Malformed probe');
      setProbe(p);
      setSortAssignment(p.items.map(() => ''));
      setProbeStatus('ready');
    } catch (err) {
      setProbeError(describeApiError(err, 'Could not prepare a question for this concept.'));
      setProbeStatus('error');
    }
  }, [mode, currentConceptId]);

  useEffect(() => { loadProbe(); }, [loadProbe]);

  if (!mode) {
    return (
      <ModeSelector
        queue={queue}
        status={queueStatus}
        error={queueError}
        onRetry={loadQueue}
        onSelect={setMode}
      />
    );
  }

  if (completed) {
    return <ReviewComplete results={results} onDone={() => navigate('/brain')} />;
  }

  const currentItem = queue[queueIndex];
  if (!currentItem) {
    return <ReviewComplete results={results} onDone={() => navigate('/brain')} />;
  }

  const rs = recallStatus(currentItem.recall);
  const probeId = probe?.probeId ?? currentItem.probeId;
  const prompt = probe?.prompt || currentItem.prompt || (probeStatus === 'loading' ? 'Preparing a question…' : fallbackPrompt(currentItem.label, mode));
  const answered = grade !== null || ungraded;
  const isMcq = !!probe && probe.type === 'MISCONCEPTION_MCQ' && probe.options.length > 0;
  const isSort = !!probe && probe.type === 'CONCEPT_SORT' && probe.items.length > 0;
  const canSubmit = !!probeId && !submitting && (
    isMcq ? selectedOption !== null
      : isSort ? sortAssignment.length > 0 && sortAssignment.every(g => g)
      : !!answer.trim()
  );

  const handleSubmit = async () => {
    if (!canSubmit || !probeId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const body: Record<string, unknown> = { probe_id: probeId };
      if (isMcq) body.answer_payload = { selected_index: selectedOption };
      else if (isSort) body.answer_payload = { assignment: sortAssignment };
      else body.answer_text = answer.trim();
      const res = await api<unknown>('/api/review/answer', { method: 'POST', body });
      if (isGrade(res)) setGrade(res);
      else setUngraded(true);
    } catch (err) {
      setSubmitError(describeApiError(err, 'Could not submit your answer.'));
    } finally {
      setSubmitting(false);
    }
  };

  const advance = (skipped = false) => {
    setResults(prev => [...prev, {
      label: currentItem.label,
      band: !skipped && grade?.band ? grade.band : null,
      passed: !skipped && grade && typeof grade.passed === 'boolean' ? grade.passed : null,
      before: currentItem.recall,
    }]);
    setAnswer('');
    setGrade(null);
    setUngraded(false);
    setSubmitError(null);
    if (queueIndex + 1 >= queue.length) {
      setCompleted(true);
      refreshGraph();
    } else {
      setQueueIndex(queueIndex + 1);
    }
  };

  const missing = grade?.gap_report?.missing_claims ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
      {/* Top bar */}
      <div style={{
        height: isMobile ? 52 : 60, flexShrink: 0, display: 'flex', alignItems: 'center',
        padding: isMobile ? '0 14px' : '0 28px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-elevated)', position: 'relative', gap: 12,
      }}>
        <div style={{ display: 'flex', gap: 5, flex: 1, flexWrap: 'wrap' }}>
          {queue.map((item, i) => {
            const done = i < queueIndex;
            const active = i === queueIndex;
            const irs = recallStatus(item.recall);
            return (
              <div key={item.conceptId} title={item.label} style={{
                width: 8, height: 8, borderRadius: '50%',
                background: done ? 'var(--green)' : active ? irs.color : 'var(--bg-input)',
                border: `1.5px solid ${done ? 'var(--green)' : active ? irs.color : 'var(--border-strong)'}`,
                transition: 'all 0.2s',
              }} />
            );
          })}
        </div>
        <div style={{ fontSize: isMobile ? 14 : 15, fontWeight: 700, color: 'var(--text)', maxWidth: '50%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {currentItem.label}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', flexShrink: 0 }}>{queueIndex + 1}/{queue.length}</div>
        <button
          onClick={() => navigate('/brain')}
          aria-label="Exit review"
          style={{
            width: 32, height: 32, borderRadius: 8, background: 'transparent',
            border: '1px solid var(--border)', color: 'var(--text-muted)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <XIcon size={14} />
        </button>
      </div>

      {/* Main */}
      <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '20px 16px' : '40px 28px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 720 }}>
          {currentItem.isDetour && currentItem.detourReason && (
            <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(28,176,246,0.06)', border: '1px solid rgba(28,176,246,0.2)', fontSize: 13, color: 'var(--text-2)' }}>
              {currentItem.detourReason}
            </div>
          )}

          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 16, padding: isMobile ? '20px 16px' : '28px 28px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6,
                background: rs.color + '18', border: `1px solid ${rs.color}40`,
                fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: rs.color,
              }}>
                {mode === 'abstract' ? '⚡ Recall' : '💬 Explain'}
              </div>
              <span style={{ fontSize: 11, color: rs.color, fontWeight: 600 }}>
                {currentItem.recall !== null ? `${currentItem.recall}% · ${rs.label}` : 'Not reviewed yet'}
              </span>
              {currentItem.subject && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{currentItem.subject}</span>}
            </div>

            <p style={{ fontSize: 15, color: 'var(--text)', lineHeight: 1.65, margin: '0 0 20px', whiteSpace: 'pre-line' }}>{prompt}</p>

            {probeStatus === 'error' && (
              <div role="alert" style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(255,75,75,0.08)', border: '1px solid rgba(255,75,75,0.3)', fontSize: 13, color: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span>{probeError}</span>
                <button onClick={loadProbe} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                  <RefreshCw size={12} /> Retry
                </button>
              </div>
            )}

            {isMcq ? (
              <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <legend style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Choose one answer</legend>
                {probe!.options.map((opt, i) => {
                  const selected = selectedOption === i;
                  return (
                    <label key={i} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 10,
                      border: `1.5px solid ${selected ? rs.color : 'var(--border)'}`, background: 'var(--bg)',
                      cursor: answered || submitting ? 'default' : 'pointer', fontSize: 14, color: 'var(--text)', lineHeight: 1.5,
                    }}>
                      <input
                        type="radio" name="retest-mcq" checked={selected}
                        disabled={answered || submitting}
                        onChange={() => setSelectedOption(i)}
                        style={{ marginTop: 3 }}
                      />
                      <span>{opt}</span>
                    </label>
                  );
                })}
              </fieldset>
            ) : isSort ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Put each item into a group (A, B or C) so items that work the same way end up together.</div>
                {probe!.items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)' }}>
                    <span style={{ flex: 1, fontSize: 14, color: 'var(--text)' }}>{item}</span>
                    <label htmlFor={`sort-${i}`} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Group for item {i + 1}</label>
                    <select
                      id={`sort-${i}`}
                      value={sortAssignment[i] ?? ''}
                      disabled={answered || submitting}
                      onChange={e => setSortAssignment(prev => prev.map((g, j) => (j === i ? e.target.value : g)))}
                      style={{ padding: '6px 8px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }}
                    >
                      <option value="">Group…</option>
                      {SORT_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <label htmlFor="retest-answer" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Your answer</label>
                <textarea
                  id="retest-answer"
                  value={answer}
                  onChange={e => setAnswer(e.target.value)}
                  disabled={answered || submitting || probeStatus !== 'ready'}
                  placeholder={mode === 'abstract' ? 'Type a short answer...' : 'Write your explanation here...'}
                  rows={mode === 'abstract' ? 3 : 6}
                  style={{
                    width: '100%', padding: '12px 14px', borderRadius: 10,
                    background: 'var(--bg)', border: '1.5px solid var(--border)',
                    color: 'var(--text)', fontSize: 14, fontFamily: 'inherit',
                    resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: 1.65,
                  }}
                  onFocus={e => (e.currentTarget as HTMLElement).style.borderColor = rs.color}
                  onBlur={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}
                />
              </>
            )}

            {submitError && (
              <div role="alert" style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(255,75,75,0.08)', border: '1px solid rgba(255,75,75,0.3)', fontSize: 13, color: 'var(--red)' }}>
                {submitError}
              </div>
            )}

            {grade && (
              <div style={{ marginTop: 16, padding: '14px 14px', borderRadius: 10, background: grade.passed ? 'rgba(88,204,2,0.07)' : 'rgba(255,150,0,0.07)', border: `1px solid ${grade.passed ? 'rgba(88,204,2,0.25)' : 'rgba(255,150,0,0.3)'}`, animation: 'fadeUp 0.3s ease' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: missing.length || grade.mastery?.newly_mastered ? 10 : 0 }}>
                  <span style={{ fontWeight: 700, color: grade.passed ? 'var(--green)' : 'var(--orange)', fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    {grade.passed ? 'Passed' : 'Not yet'}{grade.band ? ` · ${bandLabel(grade.band)}` : ''}
                  </span>
                  {grade.solo_level && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{grade.solo_level}</span>}
                </div>
                {grade.mastery?.newly_mastered && (
                  <div style={{ fontSize: 13, color: 'var(--green)', fontWeight: 600, marginBottom: missing.length ? 10 : 0 }}>Concept mastered. It leaves your review queue.</div>
                )}
                {missing.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>What to add</div>
                    <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {missing.map((m, i) => (
                        <li key={i} style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55 }}>
                          {m.hint || m.category || 'A key idea is missing'}
                          {m.prerequisite_concept_label ? ` (review ${m.prerequisite_concept_label} first)` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {ungraded && (
              <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55 }}>
                Answer received, but automatic grading isn&apos;t available for this concept yet, so it wasn&apos;t scored.
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            {!answered ? (
              <>
                <button
                  onClick={() => advance(true)}
                  style={{ flex: 1, padding: '13px', borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit' }}
                >Skip</button>
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  style={{
                    flex: 2, padding: '13px', borderRadius: 12, background: rs.color, color: '#fff', border: 'none',
                    cursor: !canSubmit ? 'not-allowed' : 'pointer', opacity: !canSubmit ? 0.5 : 1,
                    fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
                  }}
                >{submitting ? 'Checking…' : 'Submit answer'}</button>
              </>
            ) : (
              <button
                onClick={() => advance(false)}
                style={{ flex: 1, padding: '13px', borderRadius: 12, background: 'var(--green)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}
              >{queueIndex + 1 >= queue.length ? 'Finish session →' : 'Next concept →'}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Mode Selector ── */
function ModeSelector({ queue, status, error, onRetry, onSelect }: {
  queue: QueueItem[];
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  onRetry: () => void;
  onSelect: (m: ReviewMode) => void;
}) {
  const navigate = useNavigate();
  const vw = useVW();
  const isMobile = vw < 640;
  const shown = queue.slice(0, 8);

  return (
    <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '32px 16px' : '48px 40px', background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: 860 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: isMobile ? 28 : 48 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16, color: 'var(--green)' }}>
            <Target size={isMobile ? 32 : 40} strokeWidth={1.4} />
          </div>
          <h1 style={{ fontSize: isMobile ? 28 : 36, fontWeight: 800, margin: '0 0 12px', letterSpacing: '-0.03em', color: 'var(--text)' }}>Retest</h1>
          <p role="status" style={{ fontSize: 15, color: 'var(--text-muted)', margin: 0 }}>
            {status === 'loading' ? 'Loading your review queue…'
              : status === 'error' ? (error || 'Could not load your review queue.')
              : queue.length === 0 ? 'Nothing is due for review right now.'
              : `${queue.length} concept${queue.length === 1 ? '' : 's'} due for review`}
          </p>
          {status === 'error' && (
            <button onClick={onRetry} style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
              <RefreshCw size={13} /> Retry
            </button>
          )}
        </div>

        {/* Queue cards */}
        {shown.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12, marginBottom: isMobile ? 28 : 48 }}>
            {shown.map(item => {
              const rs = recallStatus(item.recall);
              const r = item.recall;
              const hex = r === null ? '#6B7280' : r >= 75 ? '#58CC02' : r >= 50 ? '#FF9600' : '#FF4B4B';
              return (
                <div key={item.conceptId} style={{
                  padding: isMobile ? '14px 12px' : '18px 16px', borderRadius: 14,
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 6 }}>
                    <span style={{ fontSize: isMobile ? 13 : 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
                    <span style={{ fontSize: 12, color: rs.color, fontWeight: 700, flexShrink: 0 }}>{r !== null ? `${r}%` : '—'}</span>
                  </div>
                  <div style={{ height: 5, background: 'var(--bg-input)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{ height: '100%', borderRadius: 3, width: `${r ?? 0}%`, background: `linear-gradient(90deg, ${hex}88, ${hex})` }} />
                  </div>
                  <div style={{ fontSize: 11, color: rs.color, fontWeight: 600 }}>{item.isDetour ? 'Prerequisite first' : rs.label}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Mode cards */}
        {status === 'ready' && queue.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 16, textAlign: 'center' }}>Choose Mode</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 12 : 20 }}>
              <ModeCard
                title="Abstract"
                Icon={Zap}
                color="var(--blue)"
                desc="Fast recall. A short answer per concept. Best when you're short on time."
                features={['One quick prompt per concept', 'Short free-text answers', 'Tests surface memory']}
                onSelect={() => onSelect('abstract')}
              />
              <ModeCard
                title="Understand"
                Icon={Puzzle}
                color="var(--green)"
                desc="Explain the mechanism in your own words. The real test of knowledge."
                features={['Explain what, how and why', 'Feedback on missing key ideas when graded', 'Prerequisites tested first']}
                recommended
                onSelect={() => onSelect('understand')}
              />
            </div>
          </>
        )}

        <button
          onClick={() => navigate('/brain')}
          style={{
            display: 'block', margin: '24px auto 0', background: 'none', border: 'none',
            color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
          }}
        >← Back to Brain</button>
      </div>
    </div>
  );
}

function ModeCard({ title, Icon, color, desc, features, recommended, onSelect }: {
  title: string;
  Icon: React.FC<{ size?: number; strokeWidth?: number }>;
  color: string;
  desc: string;
  features: string[];
  recommended?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      style={{
        padding: '28px 28px', borderRadius: 16, textAlign: 'left',
        background: 'var(--bg-elevated)', fontFamily: 'inherit',
        border: recommended ? `2px solid ${color}` : '1px solid var(--border)',
        cursor: 'pointer', position: 'relative', transition: 'all 0.2s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)'; (e.currentTarget as HTMLElement).style.boxShadow = `0 12px 40px rgba(0,0,0,0.3)`; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
    >
      {recommended && (
        <div style={{
          position: 'absolute', top: -11, right: 16, padding: '3px 10px',
          borderRadius: 6, background: color, color: '#fff',
          fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
        }}>RECOMMENDED</div>
      )}
      <div style={{ width: 48, height: 48, borderRadius: 12, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
        <span style={{ color }}><Icon size={24} strokeWidth={1.4} /></span>
      </div>
      <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--text)', marginBottom: 10, letterSpacing: '-0.02em' }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 18 }}>{desc}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {features.map(f => (
          <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-2)' }}>
            <div style={{ width: 16, height: 16, borderRadius: '50%', background: color + '20', border: `1px solid ${color}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Check size={9} strokeWidth={2.5} style={{ color }} />
            </div>
            {f}
          </div>
        ))}
      </div>
    </button>
  );
}

/* ── Review Complete ── */
function ReviewComplete({ results, onDone }: { results: SessionResult[]; onDone: () => void }) {
  const navigate = useNavigate();
  const vw = useVW();
  const isMobile = vw < 640;
  const graded = results.filter(r => r.band !== null);
  const passed = results.filter(r => r.passed === true).length;
  const full = results.filter(r => r.band === 'Full').length;

  return (
    <div style={{ height: '100%', overflowY: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '24px 16px' : '40px', background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16, color: 'var(--green)' }}>
            <PartyPopper size={isMobile ? 40 : 48} strokeWidth={1.2} />
          </div>
          <h2 style={{ fontSize: isMobile ? 26 : 32, fontWeight: 800, margin: '0 0 10px', letterSpacing: '-0.03em' }}>Session Complete</h2>
          <p style={{ fontSize: 15, color: 'var(--text-muted)', margin: 0 }}>{results.length} concept{results.length === 1 ? '' : 's'} reviewed</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Passed', value: passed, color: 'var(--green)' },
            { label: 'Full understanding', value: graded.length ? full : '—', color: 'var(--blue)' },
            { label: 'Concepts done', value: results.length, color: 'var(--text)' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ padding: '14px', borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border)', textAlign: 'center' }}>
              <div style={{ fontSize: isMobile ? 22 : 26, fontWeight: 800, color, letterSpacing: '-0.02em' }}>{value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>

        {results.length > 0 && (
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 18px', marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 14 }}>Results</div>
            {results.map((r, i) => {
              const hex = bandColor(r.band);
              return (
                <div key={`${r.label}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 13, color: 'var(--text)', flex: 1, fontWeight: 500 }}>{r.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: r.band ? hex : 'var(--text-dim)', width: isMobile ? 110 : 140, textAlign: 'right' }}>
                    {r.band ? bandLabel(r.band) : 'Not graded'}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => navigate('/insights')}
            style={{
              flex: 1, padding: '13px', borderRadius: 12,
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              color: 'var(--text-2)', cursor: 'pointer', fontSize: 14,
              fontWeight: 600, fontFamily: 'inherit',
            }}
          >View Insights</button>
          <button
            onClick={onDone}
            style={{
              flex: 2, padding: '13px', borderRadius: 12, background: 'var(--green)',
              color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14,
              fontWeight: 700, fontFamily: 'inherit',
            }}
          >Back to Brain →</button>
        </div>
      </div>
    </div>
  );
}
