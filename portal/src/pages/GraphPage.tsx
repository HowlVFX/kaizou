import React from 'react';
import { useManagementData } from '../api/useManagementData';
import type { GraphResponse } from '../api/types';
import { fmtLabel, fmtNum, fmtPct } from '../api/format';
import { MetricCard } from '../components/MetricCard';
import { DataTable } from '../components/DataTable';
import { CardRow, ErrorMessage, Loading, PageTitle, SectionTitle, SuppressedNotice, TwoColumns } from '../components/PageState';

const EMPTY = '[below privacy threshold or no data]';

export const GraphPage: React.FC = () => {
  const { data, loading, error } = useManagementData<GraphResponse>('/graph');

  if (loading) return <Loading />;
  if (error || !data) return <ErrorMessage message={error || 'No data'} />;

  return (
    <div>
      <PageTitle>Knowledge Graph</PageTitle>
      <SuppressedNotice envelope={data} />
      <CardRow>
        <MetricCard title="Total Nodes" value={fmtNum(data.total_nodes)} />
        <MetricCard title="Total Edges" value={fmtNum(data.total_edges)} />
        <MetricCard title="Avg Degree" value={fmtNum(data.avg_degree, 2)} />
        <MetricCard title="Isolated Nodes" value={fmtPct(data.isolated_node_rate)} />
        <MetricCard title="Avg Modularity" value={fmtNum(data.avg_modularity, 3)} subtitle="active clusters" />
      </CardRow>
      <TwoColumns>
        <div>
          <SectionTitle>Edge Type Distribution</SectionTitle>
          <DataTable
            headers={['Edge Type', 'Count', 'Avg Weight']}
            rows={data.edge_type_distribution.map((r) => [fmtLabel(r.type), r.count, fmtNum(r.avg_weight, 3)])}
            emptyMessage={EMPTY}
          />
        </div>
        <div>
          <SectionTitle>Flagged Edges</SectionTitle>
          <DataTable
            headers={['Flag', 'Count']}
            rows={data.flag_distribution.map((r) => [fmtLabel(r.flag), r.count])}
            emptyMessage={EMPTY}
          />
        </div>
      </TwoColumns>
    </div>
  );
};
