import React, { useEffect, useState } from 'react';
import { fetchApi } from '../api/client';
import { MetricCard } from '../components/MetricCard';
import { DataTable } from '../components/DataTable';

export const EvaluationPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchApi('/evaluation').then(setData).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: '#e0e0e0' }}>Loading...</div>;
  if (error) return <div style={{ color: '#e06060' }}>Error: {error}</div>;

  const baselineRows = data?.baselines ? data.baselines.map((b: any) => [
    b.model,
    b.recall?.toFixed(3) ?? 'N/A',
    b.precision?.toFixed(3) ?? 'N/A',
    b.f1?.toFixed(3) ?? 'N/A'
  ]) : [];

  return (
    <div>
      <h1 style={{ color: '#e0e0e0', marginBottom: '1.5rem' }}>Evaluation Metrics</h1>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <MetricCard title="Last Run Date" value={data?.last_run_date ? new Date(data.last_run_date).toLocaleDateString() : 'Never'} />
      </div>
      
      <h3 style={{ color: '#a0a0a0', marginBottom: '1rem' }}>Baseline Comparisons</h3>
      {baselineRows.length > 0 ? (
        <DataTable headers={['Model', 'Recall', 'Precision', 'F1']} rows={baselineRows} />
      ) : (
        <p style={{ color: '#808080', fontStyle: 'italic' }}>[below privacy threshold]</p>
      )}
    </div>
  );
};
