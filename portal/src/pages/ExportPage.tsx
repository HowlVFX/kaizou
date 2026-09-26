import React from 'react';

export const ExportPage: React.FC = () => {
  return (
    <div>
      <h1 style={{ color: '#e0e0e0', marginBottom: '1.5rem' }}>Export Data</h1>
      <div style={{ background: '#16213e', padding: '2rem', borderRadius: '12px', marginBottom: '2rem' }}>
        <h3 style={{ color: '#e0e0e0', marginBottom: '1rem' }}>Data Downloads</h3>
        <p style={{ color: '#a0a0a0', marginBottom: '2rem', fontSize: '0.9rem' }}>
          <strong>Privacy Notice:</strong> The N=5 privacy floor is strictly enforced. Any metrics or groups with fewer than 5 members will be aggregated or omitted from these exports to protect user privacy.
        </p>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <a
            href="/api/management/exports/learner-data"
            style={{
              display: 'inline-block', padding: '0.75rem 1.5rem', background: '#0f3460', color: '#e0e0e0',
              textDecoration: 'none', borderRadius: '8px', fontWeight: 'bold'
            }}
          >
            Export Learner Data
          </a>
          <a
            href="/api/management/exports/anonymised-metrics"
            style={{
              display: 'inline-block', padding: '0.75rem 1.5rem', background: '#533483', color: '#e0e0e0',
              textDecoration: 'none', borderRadius: '8px', fontWeight: 'bold'
            }}
          >
            Export Anonymised Metrics
          </a>
        </div>
      </div>
    </div>
  );
};
