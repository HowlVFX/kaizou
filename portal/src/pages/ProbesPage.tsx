import React, { useEffect, useState } from 'react';
import { fetchApi } from '../api/client';
import { MetricCard } from '../components/MetricCard';
import { DataTable } from '../components/DataTable';

export const ProbesPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchApi('/probes').then(setData).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: '#e0e0e0' }}>Loading...</div>;
  if (error) return <div style={{ color: '#e06060' }}>Error: {error}</div>;

  const discriminationBandRows = data?.discrimination_bands ? Object.entries(data.discrimination_bands).map(([band, count]) => [band, count as number]) : [];
  const probeTypeRows = data?.probe_type_distribution ? Object.entries(data.probe_type_distribution).map(([type, count]) => [type, count as number]) : [];

  return (
    <div>
      <h1 style={{ color: '#e0e0e0', marginBottom: '1.5rem' }}>Probes Analysis</h1>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <MetricCard title="Total Probes" value={data?.total_probes ?? 0} />
        <MetricCard title="Avg Discrimination (r_pb)" value={data?.avg_discrimination?.toFixed(3) ?? 0} />
        <MetricCard title="Leakage Rate" value={data?.leakage_rate ? `${(data.leakage_rate * 100).toFixed(1)}%` : '0%'} color="#e06060" />
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div>
          <h3 style={{ color: '#a0a0a0', marginBottom: '1rem' }}>Discrimination Bands</h3>
          {discriminationBandRows.length > 0 ? (
            <DataTable headers={['Band', 'Count']} rows={discriminationBandRows} />
          ) : (
            <p style={{ color: '#808080', fontStyle: 'italic' }}>[below privacy threshold]</p>
          )}
        </div>
        <div>
          <h3 style={{ color: '#a0a0a0', marginBottom: '1rem' }}>Probe Type Distribution</h3>
          {probeTypeRows.length > 0 ? (
            <DataTable headers={['Type', 'Count']} rows={probeTypeRows} />
          ) : (
            <p style={{ color: '#808080', fontStyle: 'italic' }}>[below privacy threshold]</p>
          )}
        </div>
      </div>
    </div>
  );
};
