import React from 'react';
import { useManagementData } from '../api/useManagementData';
import type { MemoryResponse } from '../api/types';
import { fmtLabel, fmtNum, fmtPct } from '../api/format';
import { MetricCard } from '../components/MetricCard';
import { DataTable } from '../components/DataTable';
import { CardRow, ErrorMessage, Loading, PageTitle, SectionTitle, SuppressedNotice, TwoColumns } from '../components/PageState';

const EMPTY = '[below privacy threshold or no data]';

export const MemoryPage: React.FC = () => {
  const { data, loading, error } = useManagementData<MemoryResponse>('/memory');

  if (loading) return <Loading />;
  if (error || !data) return <ErrorMessage message={error || 'No data'} />;

  const cal = data.calibration;

  return (
    <div>
      <PageTitle>Memory &amp; Retention</PageTitle>
      <SuppressedNotice envelope={data} />
      <CardRow>
        <MetricCard title="Tracked Memory States" value={fmtNum(data.tracked_states)} />
        <MetricCard title="Avg Half-Life (days)" value={fmtNum(data.avg_half_life, 2)} />
        <MetricCard title="Median Half-Life (days)" value={fmtNum(data.median_half_life, 2)} />
        <MetricCard title="Mastery Rate" value={fmtPct(data.mastery_rate)} />
        <MetricCard
          title="Due for Review"
          value={fmtPct(data.due_for_review_rate)}
          subtitle={data.review_threshold !== undefined ? `latest recall < ${data.review_threshold}` : undefined}
          color="#e06060"
        />
        <MetricCard title="Decay Exempt" value={fmtPct(data.decay_exempt_rate)} />
      </CardRow>
      <SectionTitle>Recall Calibration (predicted recall vs pass)</SectionTitle>
      <CardRow>
        <MetricCard title="Brier Score" value={fmtNum(cal?.brier_score, 3)} subtitle="lower is better" />
        <MetricCard title="ECE" value={fmtNum(cal?.ece, 3)} subtitle="10 bins, lower is better" />
        <MetricCard title="AUC" value={fmtNum(cal?.auc, 3)} subtitle={cal ? `n = ${cal.sample_size}` : undefined} />
      </CardRow>
      <TwoColumns>
        <div>
          <SectionTitle>Half-Life Distribution</SectionTitle>
          <DataTable
            headers={['Half-life', 'States']}
            rows={data.half_life_distribution.map((r) => [r.bucket, r.count])}
            emptyMessage={EMPTY}
          />
        </div>
        <div>
          <SectionTitle>Avg Predicted Recall by Concept Shape</SectionTitle>
          <DataTable
            headers={['Shape', 'Avg Recall', 'Attempts']}
            rows={data.recall_by_shape.map((r) => [fmtLabel(r.shape), fmtPct(r.avg_recall), r.attempts])}
            emptyMessage={EMPTY}
          />
        </div>
      </TwoColumns>
    </div>
  );
};
