import React, { useEffect, useState } from 'react';
import { fetchApi } from '../api/client';
import { MetricCard } from '../components/MetricCard';

export const OverviewPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchApi('/overview').then(setData).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: '#e0e0e0' }}>Loading...</div>;
  if (error) return <div style={{ color: '#e06060' }}>Error: {error}</div>;

  return (
    <div>
      <h1 style={{ color: '#e0e0e0', marginBottom: '1.5rem' }}>Overview</h1>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <MetricCard title="Total Learners" value={data?.total_learners ?? 0} />
        <MetricCard title="Total Concepts" value={data?.total_concepts ?? 0} />
        <MetricCard title="Total Notes" value={data?.total_notes ?? 0} />
        <MetricCard title="Total Attempts" value={data?.total_attempts ?? 0} />
        <MetricCard title="Average Recall" value={data?.avg_recall ? `${(data.avg_recall * 100).toFixed(1)}%` : '0%'} />
        <MetricCard title="Mastery Rate" value={data?.mastery_rate ? `${(data.mastery_rate * 100).toFixed(1)}%` : '0%'} />
      </div>
    </div>
  );
};
