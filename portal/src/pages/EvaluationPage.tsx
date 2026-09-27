import React from 'react';
import { useManagementData } from '../api/useManagementData';
import type { EvaluationResponse } from '../api/types';
import { fmtDate, fmtLabel, fmtNum } from '../api/format';
import { MetricCard } from '../components/MetricCard';
import { DataTable } from '../components/DataTable';
import { CardRow, ErrorMessage, Loading, PageTitle, SectionTitle } from '../components/PageState';

export const EvaluationPage: React.FC = () => {
  const { data, loading, error } = useManagementData<EvaluationResponse>('/evaluation');

  if (loading) return <Loading />;
  if (error || !data) return <ErrorMessage message={error || 'No data'} />;

  return (
    <div>
      <PageTitle>Evaluation Metrics</PageTitle>
      <CardRow>
        <MetricCard title="Last Evaluation Run" value={fmtDate(data.last_run_at)} />
        <MetricCard title="Published Metrics" value={fmtNum(data.metrics.length)} />
      </CardRow>
      <SectionTitle>System-Trust Metrics</SectionTitle>
      <DataTable
        headers={['Metric', 'Breakdown', 'Cohort', 'Value', 'Sample Size', 'Computed']}
        rows={data.metrics.map((m) => [
          fmtLabel(m.metric_key),
          Object.entries(m.dimensions || {}).map(([k, v]) => `${k}: ${fmtLabel(String(v))}`).join(', ') || '-',
          m.cohort_key,
          fmtNum(m.value, 3),
          m.sample_size,
          fmtDate(m.computed_at),
        ])}
        emptyMessage={`No metrics computed yet (only aggregates with sample size >= ${data.min_learners} are shown).`}
      />
    </div>
  );
};
