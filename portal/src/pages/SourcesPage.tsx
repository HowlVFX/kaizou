import React from 'react';
import { useManagementData } from '../api/useManagementData';
import type { SourcesResponse } from '../api/types';
import { fmtLabel, fmtNum, fmtPct } from '../api/format';
import { MetricCard } from '../components/MetricCard';
import { DataTable } from '../components/DataTable';
import { CardRow, ErrorMessage, Loading, PageTitle, SectionTitle, SuppressedNotice, TwoColumns } from '../components/PageState';

const EMPTY = '[below privacy threshold or no data]';

export const SourcesPage: React.FC = () => {
  const { data, loading, error } = useManagementData<SourcesResponse>('/sources');

  if (loading) return <Loading />;
  if (error || !data) return <ErrorMessage message={error || 'No data'} />;

  const v = data.validations;

  return (
    <div>
      <PageTitle>Sources Analysis</PageTitle>
      <SuppressedNotice envelope={data} />
      <CardRow>
        <MetricCard title="Total Sources" value={fmtNum(data.total_sources)} />
        <MetricCard title="Distinct Domains" value={fmtNum(data.distinct_domains)} />
        <MetricCard title="Robots-Blocked" value={fmtPct(data.robots_blocked_rate)} />
        <MetricCard title="Validations" value={fmtNum(v?.total)} />
        <MetricCard title="Avg Source Coverage" value={fmtPct(v?.avg_coverage)} />
        <MetricCard title="Notes with Contradictions" value={fmtPct(v?.contradiction_rate)} color="#e06060" />
      </CardRow>
      <TwoColumns>
        <div>
          <SectionTitle>Trust Tier Distribution</SectionTitle>
          <DataTable
            headers={['Tier', 'Sources']}
            rows={data.trust_tier_distribution.map((r) => [fmtLabel(r.tier), r.count])}
            emptyMessage={EMPTY}
          />
        </div>
        <div>
          <SectionTitle>Top Domains (used by 5+ learners)</SectionTitle>
          <DataTable
            headers={['Domain', 'Sources']}
            rows={data.top_domains.map((r) => [r.domain, r.count])}
            emptyMessage={EMPTY}
          />
        </div>
      </TwoColumns>
    </div>
  );
};
