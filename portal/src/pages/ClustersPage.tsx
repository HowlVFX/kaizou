import React from 'react';
import { useManagementData } from '../api/useManagementData';
import type { ClustersResponse } from '../api/types';
import { fmtLabel, fmtNum } from '../api/format';
import { MetricCard } from '../components/MetricCard';
import { DataTable } from '../components/DataTable';
import { CardRow, ErrorMessage, Loading, PageTitle, SectionTitle, SuppressedNotice } from '../components/PageState';

const EMPTY = '[below privacy threshold or no data]';

export const ClustersPage: React.FC = () => {
  const { data, loading, error } = useManagementData<ClustersResponse>('/clusters');

  if (loading) return <Loading />;
  if (error || !data) return <ErrorMessage message={error || 'No data'} />;

  return (
    <div>
      <PageTitle>Concept Clusters</PageTitle>
      <SuppressedNotice envelope={data} />
      <CardRow>
        <MetricCard title="Total Clusters" value={fmtNum(data.total_clusters)} />
        <MetricCard title="Active Clusters" value={fmtNum(data.active_clusters)} />
        <MetricCard title="Avg Cluster Size" value={fmtNum(data.avg_cluster_size, 2)} subtitle="members per active cluster" />
        <MetricCard title="Avg Modularity" value={fmtNum(data.avg_modularity, 3)} />
      </CardRow>
      <SectionTitle>Lineage Events</SectionTitle>
      <DataTable
        headers={['Event', 'Count', 'Avg Jaccard']}
        rows={data.lineage_events.map((r) => [fmtLabel(r.event), r.count, fmtNum(r.avg_jaccard, 3)])}
        emptyMessage={EMPTY}
      />
    </div>
  );
};
