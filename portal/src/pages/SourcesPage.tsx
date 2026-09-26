import React, { useEffect, useState } from 'react';
import { fetchApi } from '../api/client';
import { MetricCard } from '../components/MetricCard';
import { DataTable } from '../components/DataTable';

export const SourcesPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchApi('/sources').then(setData).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: '#e0e0e0' }}>Loading...</div>;
  if (error) return <div style={{ color: '#e06060' }}>Error: {error}</div>;

  const trustTierRows = data?.trust_tier_distribution ? Object.entries(data.trust_tier_distribution).map(([tier, count]) => [tier, count as number]) : [];
  const domainRows = data?.sources_by_domain ? Object.entries(data.sources_by_domain).map(([domain, count]) => [domain, count as number]) : [];

  return (
    <div>
      <h1 style={{ color: '#e0e0e0', marginBottom: '1.5rem' }}>Sources Analysis</h1>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <MetricCard title="Total Sources" value={data?.total_sources ?? 0} />
        <MetricCard title="Avg Coverage" value={data?.avg_coverage ? `${(data.avg_coverage * 100).toFixed(1)}%` : '0%'} />
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div>
          <h3 style={{ color: '#a0a0a0', marginBottom: '1rem' }}>Trust Tier Distribution</h3>
          {trustTierRows.length > 0 ? (
            <DataTable headers={['Tier', 'Count']} rows={trustTierRows} />
          ) : (
            <p style={{ color: '#808080', fontStyle: 'italic' }}>[below privacy threshold]</p>
          )}
        </div>
        <div>
          <h3 style={{ color: '#a0a0a0', marginBottom: '1rem' }}>Sources by Domain</h3>
          {domainRows.length > 0 ? (
            <DataTable headers={['Domain', 'Count']} rows={domainRows} />
          ) : (
            <p style={{ color: '#808080', fontStyle: 'italic' }}>[below privacy threshold]</p>
          )}
        </div>
      </div>
    </div>
  );
};
