import React, { useEffect, useState } from 'react';
import { fetchApi } from '../api/client';
import { MetricCard } from '../components/MetricCard';
import { DataTable } from '../components/DataTable';

export const MemoryPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchApi('/memory').then(setData).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: '#e0e0e0' }}>Loading...</div>;
  if (error) return <div style={{ color: '#e06060' }}>Error: {error}</div>;

  const halfLifeRows = data?.half_life_distribution ? Object.entries(data.half_life_distribution).map(([bucket, count]) => [bucket, count as number]) : [];
  const recallByComplexityRows = data?.avg_recall_by_complexity ? Object.entries(data.avg_recall_by_complexity).map(([band, recall]) => [band, `${((recall as number) * 100).toFixed(1)}%`]) : [];

  return (
    <div>
      <h1 style={{ color: '#e0e0e0', marginBottom: '1.5rem' }}>Memory & Retention</h1>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <MetricCard title="Calibration ECE" value={data?.ece?.toFixed(3) ?? 0} />
        <MetricCard title="Calibration AUC" value={data?.auc?.toFixed(3) ?? 0} />
        <MetricCard title="Calibration Brier" value={data?.brier_score?.toFixed(3) ?? 0} />
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div>
          <h3 style={{ color: '#a0a0a0', marginBottom: '1rem' }}>Half-Life Distribution</h3>
          {halfLifeRows.length > 0 ? (
            <DataTable headers={['Bucket', 'Count']} rows={halfLifeRows} />
          ) : (
            <p style={{ color: '#808080', fontStyle: 'italic' }}>[below privacy threshold]</p>
          )}
        </div>
        <div>
          <h3 style={{ color: '#a0a0a0', marginBottom: '1rem' }}>Avg Recall by Complexity</h3>
          {recallByComplexityRows.length > 0 ? (
            <DataTable headers={['Complexity Band', 'Average Recall']} rows={recallByComplexityRows} />
          ) : (
            <p style={{ color: '#808080', fontStyle: 'italic' }}>[below privacy threshold]</p>
          )}
        </div>
      </div>
    </div>
  );
};
