import React, { useCallback, useEffect, useState } from 'react';
import { authFetch, fetchApi } from '../api/client';
import type { GraderAgreement, GraderLabelsSample } from '../api/types';
import { fmtLabel, fmtNum } from '../api/format';
import { MetricCard } from '../components/MetricCard';
import {
  CardRow,
  ErrorMessage,
  Loading,
  PageTitle,
  SectionTitle,
  SuppressedNotice,
} from '../components/PageState';

const SAMPLE_PATH = '/grader/labels/sample?limit=50';
const AGREEMENT_PATH = '/grader/labels/agreement';

// Landis & Koch (1977) strength-of-agreement bands for Cohen's kappa.
function interpretKappa(k: number | null | undefined): { label: string; color: string } {
  if (k === null || k === undefined || Number.isNaN(k)) {
    return { label: 'not computed yet', color: '#808080' };
  }
  if (k < 0) return { label: 'poor (worse than chance)', color: '#e06060' };
  if (k < 0.2) return { label: 'slight', color: '#e0a060' };
  if (k < 0.4) return { label: 'fair', color: '#e0c060' };
  if (k < 0.6) return { label: 'moderate', color: '#c0d060' };
  if (k < 0.8) return { label: 'substantial', color: '#80c080' };
  return { label: 'almost perfect', color: '#60c090' };
}

// Kappa is a signed [-1, 1] coefficient, so show 3 dp rather than a percentage.
function fmtKappa(k: number | null | undefined): string {
  return fmtNum(k, 3);
}

/** Per-attempt save feedback that clears itself after a moment. */
type RowState = { status: 'saving' | 'saved' | 'error'; message?: string };

export const GraderLabelingPage: React.FC = () => {
  const [sample, setSample] = useState<GraderLabelsSample | null>(null);
  const [agreement, setAgreement] = useState<GraderAgreement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});

  const refresh = useCallback(async () => {
    // Load the sample + agreement together; a manual fetch (not useManagementData)
    // so we can re-run this after a POST to pull fresh kappa + has_label flags.
    const [s, a] = await Promise.all([
      fetchApi<GraderLabelsSample>(SAMPLE_PATH),
      fetchApi<GraderAgreement>(AGREEMENT_PATH),
    ]);
    setSample(s);
    setAgreement(a);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    refresh()
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Request failed.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const submitLabel = useCallback(
    async (attemptId: string, humanBand: string) => {
      setRowState((prev) => ({ ...prev, [attemptId]: { status: 'saving' } }));
      try {
        const res = await authFetch('/api/management/grader/labels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attempt_id: attemptId, human_band: humanBand }),
        });
        if (!res.ok) {
          // Surface the backend's {error} message, never raw internals.
          let message = `Could not save label (${res.status}).`;
          try {
            const body = await res.json();
            if (body && typeof body.error === 'string') message = body.error;
          } catch {
            // non-JSON body; keep the generic message
          }
          setRowState((prev) => ({ ...prev, [attemptId]: { status: 'error', message } }));
          return;
        }
        // Refetch so kappa and the has_label markers reflect the new label.
        await refresh();
        setRowState((prev) => ({ ...prev, [attemptId]: { status: 'saved' } }));
        window.setTimeout(() => {
          setRowState((prev) => {
            if (prev[attemptId]?.status !== 'saved') return prev;
            const next = { ...prev };
            delete next[attemptId];
            return next;
          });
        }, 2500);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Could not save label.';
        setRowState((prev) => ({ ...prev, [attemptId]: { status: 'error', message } }));
      }
    },
    [refresh],
  );

  if (loading) return <Loading />;
  if (error || !sample || !agreement) return <ErrorMessage message={error || 'No data'} />;

  const live = agreement.live;
  const published = agreement.published;
  const liveInterp = interpretKappa(live.cohens_kappa);
  const publishedInterp = interpretKappa(published?.value);
  const bands = sample.bands.length > 0 ? sample.bands : ['Full', 'Shallow', 'Incomplete', 'Not_Yet_Engaged'];

  return (
    <div>
      <PageTitle>Grader QA — Cohen's κ Labelling</PageTitle>

      <p style={{ color: '#a0a0a0', maxWidth: '760px', lineHeight: 1.6, marginBottom: '1.5rem' }}>
        This is the human-rater quality-assurance workflow behind Cohen's κ. For each sampled
        attempt below you assign the band you think is correct; that gold label is compared against
        the auto-grader's band to measure how well the machine agrees with a human. Your labels feed
        the live κ above, and the evaluation job later rolls all raters' labels into the published
        figure.
      </p>

      <SuppressedNotice envelope={sample} />

      <SectionTitle>Agreement (Cohen's κ)</SectionTitle>
      <CardRow>
        <MetricCard
          title="Live κ (your labels)"
          value={fmtKappa(live.cohens_kappa)}
          subtitle={`n = ${fmtNum(live.n)} · ${liveInterp.label}`}
          color={liveInterp.color}
        />
        <MetricCard
          title="Published κ (all raters)"
          value={fmtKappa(published?.value)}
          subtitle={published ? `n = ${fmtNum(published.sample_size)} · ${publishedInterp.label}` : 'not computed yet'}
          color={publishedInterp.color}
        />
      </CardRow>
      <p style={{ color: '#808080', fontSize: '0.75rem', marginBottom: '2rem' }}>
        κ scale: &lt;0 poor · 0–0.2 slight · 0.2–0.4 fair · 0.4–0.6 moderate · 0.6–0.8 substantial · 0.8–1 almost perfect.
      </p>

      <SectionTitle>Attempts to label</SectionTitle>
      {sample.attempts.length === 0 ? (
        <p style={{ color: '#808080', fontStyle: 'italic' }}>
          No graded attempts are available to label yet.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {sample.attempts.map((a) => {
            const state = rowState[a.attempt_id];
            return (
              <div
                key={a.attempt_id}
                style={{
                  background: '#16213e',
                  border: '1px solid #0f3460',
                  borderRadius: '12px',
                  padding: '1.25rem',
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span style={{ color: '#e0e0e0', fontWeight: 600 }}>{a.concept_label}</span>
                  <span style={{ color: '#808080', fontSize: '0.8rem' }}>{fmtLabel(a.probe_type)}</span>
                  <span
                    style={{
                      background: '#0f3460', color: '#c0c0c0', fontSize: '0.75rem',
                      padding: '0.15rem 0.6rem', borderRadius: '999px',
                    }}
                  >
                    machine: {fmtLabel(a.machine_band)}
                  </span>
                  {a.has_label && (
                    <span
                      style={{
                        background: '#533483', color: '#e0e0e0', fontSize: '0.7rem',
                        padding: '0.15rem 0.6rem', borderRadius: '999px',
                      }}
                    >
                      ✓ labelled
                    </span>
                  )}
                </div>

                <p style={{ color: '#c0c0c0', fontSize: '0.9rem', lineHeight: 1.5, margin: '0 0 1rem', whiteSpace: 'pre-wrap' }}>
                  {a.answer_text || <span style={{ color: '#808080', fontStyle: 'italic' }}>(empty answer)</span>}
                  {a.answer_truncated && <span style={{ color: '#808080' }}>…</span>}
                </p>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ color: '#808080', fontSize: '0.8rem', marginRight: '0.25rem' }}>Your band:</span>
                  {bands.map((band) => (
                    <button
                      key={band}
                      type="button"
                      disabled={state?.status === 'saving'}
                      onClick={() => submitLabel(a.attempt_id, band)}
                      style={{
                        background: 'transparent',
                        border: '1px solid #533483',
                        color: '#e0e0e0',
                        padding: '0.4rem 0.8rem',
                        borderRadius: '8px',
                        cursor: state?.status === 'saving' ? 'wait' : 'pointer',
                        fontSize: '0.8rem',
                        opacity: state?.status === 'saving' ? 0.6 : 1,
                      }}
                    >
                      {fmtLabel(band)}
                    </button>
                  ))}
                  {state?.status === 'saving' && (
                    <span style={{ color: '#a0a0a0', fontSize: '0.8rem' }}>Saving…</span>
                  )}
                  {state?.status === 'saved' && (
                    <span style={{ color: '#60c090', fontSize: '0.8rem' }}>✓ Saved</span>
                  )}
                  {state?.status === 'error' && (
                    <span role="alert" style={{ color: '#e06060', fontSize: '0.8rem' }}>
                      {state.message}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
