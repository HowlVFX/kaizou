import React from 'react';
import { useManagementData } from '../api/useManagementData';
import type { PopulationResponse } from '../api/types';
import { fmtLabel, fmtNum } from '../api/format';
import { MetricCard } from '../components/MetricCard';
import { DataTable } from '../components/DataTable';
import { CardRow, ErrorMessage, Loading, PageTitle, SectionTitle, SuppressedNotice, TwoColumns } from '../components/PageState';

const EMPTY = '[below privacy threshold or no data]';

export const PopulationPage: React.FC = () => {
  const { data, loading, error } = useManagementData<PopulationResponse>('/population');

  if (loading) return <Loading />;
  if (error || !data) return <ErrorMessage message={error || 'No data'} />;

  const maxCount = Math.max(1, ...data.recall_distribution.map((r) => r.count));

  return (
    <div>
      <PageTitle>Population</PageTitle>
      <SuppressedNotice envelope={data} />
      <CardRow>
        <MetricCard title="Active Learners" value={fmtNum(data.active_learners)} subtitle="notes or attempts in last 30 days" color="#533483" />
        <MetricCard title="Inactive Learners" value={fmtNum(data.inactive_learners)} color="#e06060" />
      </CardRow>
      <TwoColumns>
        <div>
          <SectionTitle>Latest Predicted Recall Distribution</SectionTitle>
          {data.recall_distribution.length === 0 && <p style={{ color: '#808080', fontStyle: 'italic' }}>{EMPTY}</p>}
          <ul aria-label="Predicted recall distribution" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {data.recall_distribution.map((row) => (
              <li key={row.bucket} style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div style={{ width: '70px', color: '#e0e0e0', fontSize: '0.85rem' }}>{row.bucket}</div>
                <div style={{ flex: 1, background: '#16213e', height: '1.5rem', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${(row.count / maxCount) * 100}%`, background: '#0f3460', height: '100%' }} />
                </div>
                <div style={{ width: '50px', textAlign: 'right', color: '#808080', fontSize: '0.85rem' }}>{row.count}</div>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <SectionTitle>SOLO Level Distribution</SectionTitle>
          <DataTable
            headers={['SOLO Level', 'Concepts']}
            rows={data.solo_distribution.map((r) => [fmtLabel(r.level), r.count])}
            emptyMessage={EMPTY}
          />
        </div>
      </TwoColumns>
    </div>
  );
};
