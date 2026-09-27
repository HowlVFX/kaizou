import React from 'react';
import { useManagementData } from '../api/useManagementData';
import type { GraderResponse } from '../api/types';
import { fmtLabel, fmtNum, fmtPct } from '../api/format';
import { MetricCard } from '../components/MetricCard';
import { DataTable } from '../components/DataTable';
import { CardRow, ErrorMessage, Loading, PageTitle, SectionTitle, SuppressedNotice } from '../components/PageState';

const EMPTY = '[below privacy threshold or no data]';

export const GraderPage: React.FC = () => {
  const { data, loading, error } = useManagementData<GraderResponse>('/grader');

  if (loading) return <Loading />;
  if (error || !data) return <ErrorMessage message={error || 'No data'} />;

  const scores = data.avg_scores;
  const { cohens_kappa, inter_run_agreement } = data.system_metrics;

  return (
    <div>
      <PageTitle>Grader Performance</PageTitle>
      <SuppressedNotice envelope={data} />
      <CardRow>
        <MetricCard title="Graded Attempts" value={fmtNum(data.total_attempts)} />
        <MetricCard title="Pass Rate" value={fmtPct(data.pass_rate)} />
        <MetricCard title="Avg Composite" value={fmtNum(scores?.composite, 3)} />
        <MetricCard title="Avg Coverage" value={fmtNum(scores?.coverage, 3)} />
        <MetricCard title="Avg Ordering" value={fmtNum(scores?.ordering, 3)} />
        <MetricCard title="Avg Precision" value={fmtNum(scores?.precision, 3)} />
        <MetricCard title="Avg Verbatim" value={fmtNum(scores?.verbatim, 3)} />
      </CardRow>
      <SectionTitle>Reliability (from computed aggregates)</SectionTitle>
      <CardRow>
        <MetricCard
          title="Cohen's Kappa"
          value={fmtNum(cohens_kappa?.value, 3)}
          subtitle={cohens_kappa ? `n = ${cohens_kappa.sample_size}` : 'not computed yet'}
          color="#533483"
        />
        <MetricCard
          title="Inter-run Agreement"
          value={fmtPct(inter_run_agreement?.value)}
          subtitle={inter_run_agreement ? `n = ${inter_run_agreement.sample_size}` : 'not computed yet'}
          color="#533483"
        />
      </CardRow>
      <SectionTitle>Band Distribution</SectionTitle>
      <DataTable
        headers={['Band', 'Attempts']}
        rows={data.band_distribution.map((r) => [fmtLabel(r.band), r.count])}
        emptyMessage={EMPTY}
      />
    </div>
  );
};
