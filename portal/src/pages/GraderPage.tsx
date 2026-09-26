import React, { useEffect, useState } from 'react';
import { fetchApi } from '../api/client';
import { MetricCard } from '../components/MetricCard';
import { DataTable } from '../components/DataTable';

export const GraderPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchApi('/grader').then(setData).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: '#e0e0e0' }}>Loading...</div>;
  if (error) return <div style={{ color: '#e06060' }}>Error: {error}</div>;

  const bandDistributionRows = data?.band_distribution ? Object.entries(data.band_distribution).map(([band, count]) => [band, count as number]) : [];

  return (
    <div>
      <h1 style={{ color: '#e0e0e0', marginBottom: '1.5rem' }}>Grader Performance</h1>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <MetricCard title="Cohen's Kappa" value={data?.cohens_kappa?.toFixed(3) ?? 0} />
        <MetricCard title="Brier Score" value={data?.brier_score?.toFixed(3) ?? 0} />
        <MetricCard title="Expected Calibration Error (ECE)" value={data?.ece?.toFixed(3) ?? 0} />
        <MetricCard title="AUC" value={data?.auc?.toFixed(3) ?? 0} />
        <MetricCard title="Inter-run Agreement" value={data?.inter_run_agreement ? `${(data.inter_run_agreement * 100).toFixed(1)}%` : '0%'} color="#533483" />
      </div>
      <h3 style={{ color: '#a0a0a0', marginBottom: '1rem' }}>Band Distribution</h3>
      {bandDistributionRows.length > 0 ? (
        <DataTable headers={['Band', 'Count']} rows={bandDistributionRows} />
      ) : (
        <p style={{ color: '#808080', fontStyle: 'italic' }}>[below privacy threshold]</p>
      )}
    </div>
  );
};
