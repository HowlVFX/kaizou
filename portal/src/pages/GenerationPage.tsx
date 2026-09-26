import React, { useEffect, useState } from 'react';
import { fetchApi } from '../api/client';
import { MetricCard } from '../components/MetricCard';

export const GenerationPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchApi('/generation').then(setData).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: '#e0e0e0' }}>Loading...</div>;
  if (error) return <div style={{ color: '#e06060' }}>Error: {error}</div>;

  return (
    <div>
      <h1 style={{ color: '#e0e0e0', marginBottom: '1.5rem' }}>Generation Jobs</h1>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <MetricCard title="Total Generation Runs" value={data?.total_generation_runs ?? 0} />
        <MetricCard title="Inter-Run Agreement" value={data?.inter_run_agreement ? `${(data.inter_run_agreement * 100).toFixed(1)}%` : '0%'} />
        <MetricCard title="Avg Claims / Concept" value={data?.avg_claims_per_concept?.toFixed(2) ?? 0} />
        <MetricCard title="Claim Stability" value={data?.claim_stability_percentage ? `${(data.claim_stability_percentage * 100).toFixed(1)}%` : '0%'} />
      </div>
    </div>
  );
};
