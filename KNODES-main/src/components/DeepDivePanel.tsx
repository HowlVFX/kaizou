import { useEffect, useState } from 'react';
import type { DeeperStep, GraphNode } from '../types';
import { api, describeApiError } from '../lib/api';
import { useApp } from '../context/AppContext';

// "Go deeper": one step down the why-ladder at a time. Each step shows an
// enticing question, a short primer at the learner's level, and the deeper
// explanations as locked nodes (each with a teaser). The learner writes a note
// to unlock each one, and decides after every step whether to keep going.
// Primer and teasers are never part of a note and are never tested.

const LEVEL_LABEL: Record<string, string> = {
  young_child: 'Everyday', school: 'School', university: 'University', expert: 'Expert',
};
const DEEP = '#f5b942'; // why-ladder accent (upgraded ring, explanation links)

interface Props {
  node: GraphNode;
  onLearn: (id: string, label: string) => void;
  onUpdateNote: () => void;
}

export default function DeepDivePanel({ node, onLearn, onUpdateNote }: Props) {
  const { refreshGraph } = useApp();
  const [step, setStep] = useState<DeeperStep | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'generating' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStep(null);
    setError(null);
    if (node.locked) return;
    setStatus('loading');
    api<DeeperStep>(`/api/concepts/${node.id}/deeper`)
      .then(s => { if (!cancelled) { setStep(s); setStatus('idle'); } })
      .catch(() => { if (!cancelled) setStatus('idle'); }); // no step yet is fine
    return () => { cancelled = true; };
  }, [node.id, node.locked]);

  const goDeeper = async (regenerate = false) => {
    setStatus('generating');
    setError(null);
    try {
      const s = await api<DeeperStep>(`/api/concepts/${node.id}/deeper`, { method: 'POST', body: { regenerate } });
      setStep(s);
      setStatus('idle');
      refreshGraph();
    } catch (err) {
      setError(describeApiError(err, 'Could not go deeper right now.'));
      setStatus('error');
    }
  };

  if (node.locked) {
    // An explanation node from a deep dive: show what it will reveal.
    if (!node.teaser) return null;
    return (
      <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 12, background: 'rgba(245,185,66,0.08)', border: `1px solid ${DEEP}55` }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: DEEP, marginBottom: 4 }}>
          Deeper explanation{node.levelBand ? ` · ${LEVEL_LABEL[node.levelBand] ?? node.levelBand}` : ''}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55 }}>{node.teaser}</div>
      </div>
    );
  }

  const chain = step?.chain ?? [];
  const busy = status === 'generating';

  return (
    <section aria-label="Go deeper" style={{ marginTop: 12, marginBottom: 4 }}>
      {chain.length > 0 && (
        <nav aria-label="How you got here" style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8, lineHeight: 1.6 }}>
          {chain.map(c => <span key={c.concept_id}>{c.label} <span aria-hidden="true">↓</span> </span>)}
          <span style={{ color: 'var(--text-2)', fontWeight: 600 }}>{node.label}</span>
        </nav>
      )}

      {node.upgraded && (
        <div style={{ marginBottom: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(245,185,66,0.08)', border: `1px solid ${DEEP}66` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: DEEP, marginBottom: 3 }}>⬆ Upgraded node</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 8 }}>
            You&apos;ve learnt what&apos;s underneath this. You can update this note with what you now know (optional).
          </div>
          <button onClick={onUpdateNote} style={{
            padding: '5px 12px', borderRadius: 7, background: DEEP, border: 'none', color: '#1a1300',
            fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}>Update your note</button>
        </div>
      )}

      {step?.simplification && (
        <div role="note" style={{ marginBottom: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,150,0,0.08)', border: '1px solid rgba(255,150,0,0.3)', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--orange)' }}>Heads up: </strong>{step.simplification}
        </div>
      )}

      {step?.stale && (
        <button onClick={() => goDeeper(true)} disabled={busy} style={{
          marginBottom: 10, padding: '5px 12px', borderRadius: 7, background: 'var(--bg-input)',
          border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 11, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit',
        }}>Your note changed. Refresh this step</button>
      )}

      {step?.has_step && step.is_bedrock && (
        <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--border-strong)' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>◼ Bedrock truth</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55 }}>{step.bedrock_reason}</div>
        </div>
      )}

      {step?.has_step && !step.is_bedrock && step.question && (
        <div style={{ padding: '14px', borderRadius: 12, background: 'var(--bg)', border: `1px solid ${DEEP}44` }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', lineHeight: 1.35, marginBottom: 10 }}>{step.question}</div>
          {step.primer && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.65 }}>{step.primer}</div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6 }}>A teaser to get you started. It isn&apos;t part of your notes and you&apos;re never tested on it.</div>
            </div>
          )}
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 6 }}>
            What explains it
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {step.explanations.map(ex => (
              <li key={ex.concept_id} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span aria-hidden="true">{ex.locked ? '🔒' : '✓'}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{ex.label}</span>
                  {ex.level_band && (
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-dim)', border: '1px solid var(--border)', borderRadius: 6, padding: '1px 6px' }}>
                      {LEVEL_LABEL[ex.level_band] ?? ex.level_band}
                    </span>
                  )}
                </div>
                {ex.teaser && <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{ex.teaser}</div>}
                {ex.locked ? (
                  <button onClick={() => onLearn(ex.concept_id, ex.label)} style={{
                    marginTop: 8, padding: '5px 12px', borderRadius: 7, background: 'var(--blue)', border: 'none',
                    color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  }}>Write a note to unlock</button>
                ) : (
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--green)' }}>Learnt. Open it in your Brain to go deeper again.</div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!step?.has_step && (
        <button onClick={() => goDeeper(false)} disabled={busy || status === 'loading'} aria-describedby="go-deeper-hint" style={{
          width: '100%', padding: '9px 0', borderRadius: 9, background: 'transparent',
          border: `1px dashed ${DEEP}`, color: DEEP, fontSize: 13, fontWeight: 700,
          cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', opacity: busy ? 0.6 : 1,
        }}>{busy ? 'Digging deeper…' : 'Go deeper ↓'}</button>
      )}
      {!step?.has_step && (
        <div id="go-deeper-hint" style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 5, textAlign: 'center' }}>
          What explains this? One level deeper, only if you want.
        </div>
      )}
      {error && <div role="alert" style={{ fontSize: 11, color: 'var(--red)', marginTop: 6 }}>{error}</div>}
    </section>
  );
}
