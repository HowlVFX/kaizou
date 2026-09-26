import React, { useEffect, useState } from 'react';
import { fetchApi } from '../api/client';
import { MetricCard } from '../components/MetricCard';
import { DataTable } from '../components/DataTable';

export const GraphPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchApi('/graph').then(setData).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: '#e0e0e0' }}>Loading...</div>;
  if (error) return <div style={{ color: '#e06060' }}>Error: {error}</div>;

  const edgeTypeRows = data?.edge_type_distribution ? Object.entries(data.edge_type_distribution).map(([type, count]) => [type, count as number]) : [];

  return (
    <div>
      <h1 style={{ color: '#e0e0e0', marginBottom: '1.5rem' }}>Knowledge Graph</h1>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <MetricCard title="Total Nodes" value={data?.total_nodes ?? 0} />
        <MetricCard title="Total Edges" value={data?.total_edges ?? 0} />
        <MetricCard title="Avg Degree" value={data?.avg_degree?.toFixed(2) ?? 0} />
        <MetricCard title="Modularity" value={data?.modularity?.toFixed(3) ?? 0} />
        <MetricCard title="Connected Components" value={data?.connected_components_count ?? 0} />
      </div>
      
      <h3 style={{ color: '#a0a0a0', marginBottom: '1rem' }}>Edge Type Distribution</h3>
      {edgeTypeRows.length > 0 ? (
        <DataTable headers={['Edge Type', 'Count']} rows={edgeTypeRows} />
      ) : (
        <p style={{ color: '#808080', fontStyle: 'italic' }}>[below privacy threshold]</p>
      )}
    </div>
  );
};
