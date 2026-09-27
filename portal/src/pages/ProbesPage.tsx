import React from 'react';
import { useManagementData } from '../api/useManagementData';
import type { ProbesResponse } from '../api/types';
import { fmtLabel, fmtNum, fmtPct } from '../api/format';
import { MetricCard } from '../components/MetricCard';
import { DataTable } from '../components/DataTable';
import { CardRow, ErrorMessage, Loading, PageTitle, SectionTitle, SuppressedNotice, TwoColumns } from '../components/PageState';

const EMPTY = '[below privacy threshold or no data]';

export const ProbesPage: React.FC = () => {
  const { data, loading, error } = useManagementData<ProbesResponse>('/probes');

  if (loading) return <Loading />;
  if (error || !data) return <ErrorMessage message={error || 'No data'} />;

  const disc = data.discrimination;

  return (
    <div>
      <PageTitle>Probes Analysis</PageTitle>
      <SuppressedNotice envelope={data} />
      <CardRow>
        <MetricCard title="Total Probes" value={fmtNum(data.total_probes)} />
        <MetricCard title="Leakage Rate" value={fmtPct(data.leakage_rate)} color="#e06060" />
        <MetricCard title="Avg Retries" value={fmtNum(data.avg_retries, 2)} />
        <MetricCard
          title="Avg Discrimination (r_pb)"
          value={fmtNum(disc?.avg_r_pb, 3)}
          subtitle={disc ? `${disc.evaluated_probes} probe(s) with >= 5 learners` : undefined}
        />
      </CardRow>
      <TwoColumns>
        <div>
          <SectionTitle>Discrimination Bands</SectionTitle>
          <DataTable
            headers={['Band', 'Probes']}
            rows={disc && disc.evaluated_probes > 0 ? disc.bands.map((b) => [fmtLabel(b.band), b.count]) : []}
            emptyMessage={EMPTY}
          />
        </div>
        <div>
          <SectionTitle>Probe Types</SectionTitle>
          <DataTable
            headers={['Type', 'Probes', 'Attempts', 'Pass Rate', 'Avg Score']}
            rows={data.probe_type_distribution.map((r) => [
              fmtLabel(r.type), r.probes, r.attempts, fmtPct(r.pass_rate), fmtNum(r.avg_score, 3),
            ])}
            emptyMessage={EMPTY}
          />
        </div>
      </TwoColumns>
    </div>
  );
};
