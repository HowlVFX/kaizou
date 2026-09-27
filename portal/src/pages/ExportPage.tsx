import React, { useState } from 'react';
import { downloadExport } from '../api/client';
import type { ExportFormat, ExportReport } from '../api/types';
import { PageTitle } from '../components/PageState';

const REPORTS: { id: ExportReport; label: string; description: string; color: string }[] = [
  {
    id: 'anonymised-metrics',
    label: 'Anonymised Metrics',
    description: 'Latest published aggregate per metric (sample size >= 5).',
    color: '#533483',
  },
  {
    id: 'learner-data',
    label: 'Learner Activity',
    description: 'Per-learner activity counts for opted-in learners only, without identifiers.',
    color: '#0f3460',
  },
];

const buttonStyle = (color: string, disabled: boolean): React.CSSProperties => ({
  padding: '0.6rem 1.2rem', background: color, color: '#e0e0e0', border: 'none',
  borderRadius: '8px', fontWeight: 'bold', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
});

export const ExportPage: React.FC = () => {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);

  const handleExport = async (report: ExportReport, format: ExportFormat) => {
    setBusy(`${report}:${format}`);
    setMessage(null);
    try {
      const result = await downloadExport(report, format);
      setMessage(result.status === 'downloaded'
        ? { kind: 'info', text: `Downloaded ${result.filename}.` }
        : { kind: 'info', text: `Export withheld: ${result.reason}.` });
    } catch (err: unknown) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Export failed.' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageTitle>Export Data</PageTitle>
      <div style={{ background: '#16213e', padding: '2rem', borderRadius: '12px', marginBottom: '2rem' }}>
        <h3 style={{ color: '#e0e0e0', marginBottom: '1rem' }}>Data Downloads</h3>
        <p style={{ color: '#a0a0a0', marginBottom: '2rem', fontSize: '0.9rem' }}>
          <strong>Privacy Notice:</strong> The N=5 privacy floor is strictly enforced. Reports never contain note, claim or answer text or learner identifiers, and are withheld when fewer than 5 learners contribute.
        </p>
        {message && (
          <div role={message.kind === 'error' ? 'alert' : 'status'} style={{ color: message.kind === 'error' ? '#e06060' : '#c0a0ff', marginBottom: '1rem' }}>
            {message.text}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {REPORTS.map((r) => (
            <div key={r.id}>
              <div style={{ color: '#e0e0e0', fontWeight: 600 }}>{r.label}</div>
              <div style={{ color: '#808080', fontSize: '0.85rem', margin: '0.25rem 0 0.75rem' }}>{r.description}</div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                {(['csv', 'json'] as ExportFormat[]).map((format) => {
                  const key = `${r.id}:${format}`;
                  return (
                    <button
                      key={format}
                      type="button"
                      disabled={busy !== null}
                      onClick={() => handleExport(r.id, format)}
                      style={buttonStyle(r.color, busy !== null)}
                    >
                      {busy === key ? 'Preparing...' : `Download ${format.toUpperCase()}`}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
