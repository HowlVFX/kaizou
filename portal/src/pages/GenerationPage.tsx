import React from 'react';
import { useManagementData } from '../api/useManagementData';
import type { GenerationResponse } from '../api/types';
import { fmtLabel, fmtNum, fmtPct } from '../api/format';
import { MetricCard } from '../components/MetricCard';
import { DataTable } from '../components/DataTable';
import { CardRow, ErrorMessage, Loading, PageTitle, SectionTitle, SuppressedNotice } from '../components/PageState';

const EMPTY = '[below privacy threshold or no data]';

export const GenerationPage: React.FC = () => {
  const { data, loading, error } = useManagementData<GenerationResponse>('/generation');

  if (loading) return <Loading />;
  if (error || !data) return <ErrorMessage message={error || 'No data'} />;

  const t = data.templates;
  const sys = data.system_metrics;

  return (
    <div>
      <PageTitle>Generation</PageTitle>
      <SuppressedNotice envelope={data} />
      <SectionTitle>Claims</SectionTitle>
      <CardRow>
        <MetricCard title="Total Claims" value={fmtNum(data.total_claims)} />
        <MetricCard title="Avg Claims / Concept" value={fmtNum(data.avg_claims_per_concept, 2)} />
        <MetricCard title="Load-Bearing" value={fmtPct(data.load_bearing_rate)} />
        <MetricCard title="Transitions" value={fmtPct(data.transition_rate)} />
      </CardRow>
      <SectionTitle>Process Templates</SectionTitle>
      <CardRow>
        <MetricCard title="Templates" value={fmtNum(t?.total)} />
        <MetricCard title="Stable" value={fmtPct(t?.stable_rate)} />
        <MetricCard title="Avg Order Tau" value={fmtNum(t?.avg_order_tau, 3)} />
        <MetricCard title="Avg Disputed Count" value={fmtNum(t?.avg_disputed_count, 2)} />
      </CardRow>
      <DataTable
        headers={['Template Tier', 'Templates']}
        rows={(t?.tier_distribution || []).map((r) => [fmtLabel(r.tier), r.count])}
        emptyMessage={EMPTY}
      />
      <div style={{ marginTop: '2rem' }}>
        <SectionTitle>System Metrics (from computed aggregates)</SectionTitle>
        <CardRow>
          <MetricCard title="Inter-run Agreement" value={fmtPct(sys.generation_agreement?.value)} subtitle={sys.generation_agreement ? `n = ${sys.generation_agreement.sample_size}` : 'not computed yet'} color="#533483" />
          <MetricCard title="Leakage Rejection" value={fmtPct(sys.leakage_rejection_rate?.value)} subtitle={sys.leakage_rejection_rate ? `n = ${sys.leakage_rejection_rate.sample_size}` : 'not computed yet'} color="#533483" />
          <MetricCard title="Retry Rate" value={fmtPct(sys.retry_rate?.value)} subtitle={sys.retry_rate ? `n = ${sys.retry_rate.sample_size}` : 'not computed yet'} color="#533483" />
        </CardRow>
      </div>
    </div>
  );
};
