import React from 'react';
import { useManagementData } from '../api/useManagementData';
import type { OverviewResponse } from '../api/types';
import { fmtNum, fmtPct } from '../api/format';
import { MetricCard } from '../components/MetricCard';
import { CardRow, ErrorMessage, Loading, PageTitle, SectionTitle, SuppressedNotice } from '../components/PageState';

export const OverviewPage: React.FC = () => {
  const { data, loading, error } = useManagementData<OverviewResponse>('/overview');

  if (loading) return <Loading />;
  if (error || !data) return <ErrorMessage message={error || 'No data'} />;

  return (
    <div>
      <PageTitle>Overview</PageTitle>
      <SuppressedNotice envelope={data} />
      <CardRow>
        <MetricCard title="Registered Learners" value={fmtNum(data.total_learners)} />
        {!data.suppressed && (
          <>
            <MetricCard title="Contributing Learners" value={fmtNum(data.contributing_learners)} subtitle="with at least one note" />
            <MetricCard title="Total Notes" value={fmtNum(data.total_notes)} />
            <MetricCard title="Total Concepts" value={fmtNum(data.total_concepts)} />
            <MetricCard title="Verified Concepts" value={fmtNum(data.verified_concepts)} />
            <MetricCard title="Total Attempts" value={fmtNum(data.total_attempts)} />
            <MetricCard title="Pass Rate" value={fmtPct(data.pass_rate)} />
            <MetricCard title="Average Predicted Recall" value={fmtPct(data.avg_recall)} />
            <MetricCard title="Mastery Rate" value={fmtPct(data.mastery_rate)} subtitle="of tracked memory states" />
          </>
        )}
      </CardRow>
      <SectionTitle>Background Jobs</SectionTitle>
      <CardRow>
        <MetricCard title="Pending" value={fmtNum(data.jobs.PENDING)} />
        <MetricCard title="Running" value={fmtNum(data.jobs.RUNNING)} color="#533483" />
        <MetricCard title="Completed" value={fmtNum(data.jobs.COMPLETED)} color="#2e7d32" />
        <MetricCard title="Failed" value={fmtNum(data.jobs.FAILED)} color="#e06060" />
      </CardRow>
    </div>
  );
};
