import React from 'react';
import { useManagementData } from '../api/useManagementData';
import type { GraderResponse } from '../api/types';
import { fmtLabel, fmtNum, fmtPct } from '../api/format';
import { MetricCard } from '../components/MetricCard';
import { DataTable } from '../components/DataTable';
import { CardRow, ErrorMessage, Loading, PageTitle, SectionTitle } from '../components/PageState';

const EMPTY = '[no graded attempts yet]';

export const GraderPage: React.FC = () => {
  const { data, loading, error } = useManagementData<GraderResponse>('/grader');

  if (loading) return <Loading />;
  if (error || !data) return <ErrorMessage message={error || 'No data'} />;

  const scores = data.avg_scores;
  const { cohens_kappa, inter_run_agreement } = data.system_metrics;

  return (
    <div>
      <PageTitle>Grader Performance</PageTitle>
      {data.cohort_below_floor && (
        <div
          role="note"
          style={{
            background: '#16213e', border: '1px solid #533483', borderRadius: '8px',
            padding: '1rem', marginBottom: '1.5rem', color: '#c0c0c0', fontSize: '0.9rem',
          }}
        >
          Showing grader aggregates from {fmtNum(data.contributing_learners)} learners.
          The usual privacy floor is {data.min_learners}.
        </div>
      )}
      <CardRow>
        <MetricCard
          title="Graded Attempts"
          value={fmtNum(data.total_attempts)}
          subtitle={data.contributing_learners != null ? `from ${fmtNum(data.contributing_learners)} learners` : undefined}
        />
        <MetricCard title="Pass Rate" value={fmtPct(data.pass_rate)} />
        <MetricCard title="Avg Composite" value={fmtNum(scores?.composite, 3)} />
        <MetricCard title="Avg Coverage" value={fmtNum(scores?.coverage, 3)} />
        <MetricCard title="Avg Ordering" value={fmtNum(scores?.ordering, 3)} subtitle={scores?.ordering == null ? 'not scored on these attempts' : undefined} />
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
