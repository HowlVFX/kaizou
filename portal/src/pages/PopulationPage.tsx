import React, { useEffect, useState } from 'react';
import { fetchApi } from '../api/client';
import { MetricCard } from '../components/MetricCard';
import { DataTable } from '../components/DataTable';

export const PopulationPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchApi('/population').then(setData).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: '#e0e0e0' }}>Loading...</div>;
  if (error) return <div style={{ color: '#e06060' }}>Error: {error}</div>;

  const soloDistributionRows = data?.solo_distribution ? Object.entries(data.solo_distribution).map(([level, count]) => [level, count as number]) : [];

  return (
    <div>
      <h1 style={{ color: '#e0e0e0', marginBottom: '1.5rem' }}>Population</h1>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <MetricCard title="Active Learners" value={data?.active_learners ?? 0} color="#533483" />
        <MetricCard title="Inactive Learners" value={data?.inactive_learners ?? 0} color="#e06060" />
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div>
          <h3 style={{ color: '#a0a0a0', marginBottom: '1rem' }}>Recall Distribution</h3>
          {data?.recall_distribution && Object.entries(data.recall_distribution).map(([bin, count]) => (
            <div key={bin} style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
              <div style={{ width: '60px', color: '#e0e0e0', fontSize: '0.85rem' }}>{bin}</div>
              <div style={{ flex: 1, background: '#16213e', height: '1.5rem', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min((count as number) * 5, 100)}%`, background: '#0f3460', height: '100%' }}></div>
              </div>
              <div style={{ width: '40px', textAlign: 'right', color: '#808080', fontSize: '0.85rem' }}>{count as React.ReactNode}</div>
            </div>
          ))}
          {(!data?.recall_distribution || Object.keys(data.recall_distribution).length === 0) && (
            <p style={{ color: '#808080', fontStyle: 'italic' }}>[below privacy threshold]</p>
          )}
        </div>
        
        <div>
          <h3 style={{ color: '#a0a0a0', marginBottom: '1rem' }}>SOLO Level Distribution</h3>
          {soloDistributionRows.length > 0 ? (
            <DataTable headers={['SOLO Level', 'Count']} rows={soloDistributionRows} />
          ) : (
            <p style={{ color: '#808080', fontStyle: 'italic' }}>[below privacy threshold]</p>
          )}
        </div>
      </div>
    </div>
  );
};
