import React, { useEffect, useState } from 'react';
import { fetchApi } from '../api/client';
import { MetricCard } from '../components/MetricCard';
import { DataTable } from '../components/DataTable';

export const ClustersPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchApi('/clusters').then(setData).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: '#e0e0e0' }}>Loading...</div>;
  if (error) return <div style={{ color: '#e06060' }}>Error: {error}</div>;

  const lineageRows = data?.recent_lineage_events ? Object.entries(data.recent_lineage_events).map(([event, count]) => [event, count as number]) : [];

  return (
    <div>
      <h1 style={{ color: '#e0e0e0', marginBottom: '1.5rem' }}>Concept Clusters</h1>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <MetricCard title="Cluster Count" value={data?.cluster_count ?? 0} />
        <MetricCard title="Avg Cluster Size" value={data?.avg_cluster_size?.toFixed(2) ?? 0} />
        <MetricCard title="Modularity" value={data?.modularity?.toFixed(3) ?? 0} />
      </div>
      
      <h3 style={{ color: '#a0a0a0', marginBottom: '1rem' }}>Recent Lineage Events</h3>
      {lineageRows.length > 0 ? (
        <DataTable headers={['Event Type', 'Count']} rows={lineageRows} />
      ) : (
        <p style={{ color: '#808080', fontStyle: 'italic' }}>[below privacy threshold]</p>
      )}
    </div>
  );
};
