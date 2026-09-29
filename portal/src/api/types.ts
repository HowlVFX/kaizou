// Response shapes for /api/auth/* and /api/management/* (see routes/management/*.js).
// Learner-derived values are null (and lists empty) when below the N=5 privacy floor.

export type AdminRole = 'owner' | 'moderator';

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  admin_role: AdminRole;
}

export interface AdminAuthResponse {
  admin: AdminUser;
  accessToken: string;
  refreshToken: string;
}

// Management allowlist: emails allowed to sign up for / log in to the portal.
export interface AllowlistEntry {
  id: string;
  email: string;
  note: string | null;
  created_at: string;
  used_at: string | null;
  added_by_email: string | null;
}

// Admin accounts (owner-only management).
export interface AdminAccount {
  id: string;
  email: string;
  name: string | null;
  admin_role: AdminRole;
  created_at: string;
  last_login_at: string | null;
}

export interface PrivacyEnvelope {
  suppressed: boolean;
  reason?: string;
  min_learners: number;
  suppressed_groups?: number;
}

export interface AggregateMetric {
  value: number | null;
  sample_size: number;
  cohort_key: string;
  window_start: string | null;
  window_end: string | null;
  computed_at: string;
}

export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface OverviewResponse extends PrivacyEnvelope {
  total_learners: number;
  jobs: Record<JobStatus, number>;
  contributing_learners?: number;
  total_notes?: number;
  total_concepts?: number | null;
  verified_concepts?: number | null;
  total_attempts?: number | null;
  pass_rate?: number | null;
  avg_recall?: number | null;
  mastery_rate?: number | null;
}

export interface PopulationResponse extends PrivacyEnvelope {
  active_learners: number | null;
  inactive_learners: number | null;
  recall_distribution: { bucket: string; count: number }[];
  solo_distribution: { level: string; count: number }[];
}

export interface GraderResponse extends PrivacyEnvelope {
  total_attempts: number | null;
  pass_rate: number | null;
  avg_scores: {
    composite: number | null;
    coverage: number | null;
    ordering: number | null;
    precision: number | null;
    verbatim: number | null;
  } | null;
  band_distribution: { band: string; count: number }[];
  contributing_learners?: number;
  cohort_below_floor?: boolean;
  system_metrics: {
    cohens_kappa: AggregateMetric | null;
    inter_run_agreement: AggregateMetric | null;
  };
}

export interface MemoryResponse extends PrivacyEnvelope {
  tracked_states: number | null;
  avg_half_life: number | null;
  median_half_life: number | null;
  mastery_rate: number | null;
  decay_exempt_rate: number | null;
  review_threshold?: number;
  due_for_review_rate: number | null;
  half_life_distribution: { bucket: string; count: number }[];
  recall_by_shape: { shape: string; avg_recall: number | null; attempts: number }[];
  calibration: {
    brier_score: number | null;
    ece: number | null;
    auc: number | null;
    sample_size: number;
  } | null;
}

export type DiscriminationBand = 'acceptable' | 'weak' | 'retire' | 'inverted_defect';

export interface ProbesResponse extends PrivacyEnvelope {
  total_probes: number | null;
  leakage_rate: number | null;
  avg_retries: number | null;
  probe_type_distribution: {
    type: string;
    probes: number;
    attempts: number;
    pass_rate: number | null;
    avg_score: number | null;
  }[];
  discrimination: {
    evaluated_probes: number;
    avg_r_pb: number | null;
    bands: { band: DiscriminationBand; count: number }[];
  } | null;
}

export interface GraphResponse extends PrivacyEnvelope {
  total_nodes: number | null;
  total_edges: number | null;
  avg_degree: number | null;
  isolated_node_rate: number | null;
  avg_modularity: number | null;
  edge_type_distribution: { type: string; count: number; avg_weight: number | null }[];
  flag_distribution: { flag: string; count: number }[];
}

export interface SourcesResponse extends PrivacyEnvelope {
  total_sources: number | null;
  distinct_domains: number | null;
  robots_blocked_rate: number | null;
  trust_tier_distribution: { tier: string; count: number }[];
  top_domains: { domain: string; count: number }[];
  validations: {
    total: number;
    avg_coverage: number | null;
    avg_contradictions: number | null;
    contradiction_rate: number | null;
  } | null;
}

export interface GenerationResponse extends PrivacyEnvelope {
  total_claims: number | null;
  avg_claims_per_concept: number | null;
  load_bearing_rate: number | null;
  transition_rate: number | null;
  templates: {
    total: number;
    stable_rate: number | null;
    avg_order_tau: number | null;
    avg_disputed_count: number | null;
    tier_distribution: { tier: string; count: number }[];
  } | null;
  system_metrics: {
    generation_agreement: AggregateMetric | null;
    leakage_rejection_rate: AggregateMetric | null;
    retry_rate: AggregateMetric | null;
  };
}

export interface ClustersResponse extends PrivacyEnvelope {
  total_clusters: number | null;
  active_clusters: number | null;
  avg_cluster_size: number | null;
  avg_modularity: number | null;
  lineage_events: { event: string; count: number; avg_jaccard: number | null }[];
}

export interface EvaluationMetricRow {
  metric_key: string;
  cohort_key: string;
  /** Enum-valued breakdown keys, e.g. { band: 'Full' } or { discrimination: 'weak' }. */
  dimensions: Record<string, string>;
  value: number | null;
  sample_size: number;
  window_start: string | null;
  window_end: string | null;
  computed_at: string;
}

export interface EvaluationResponse extends PrivacyEnvelope {
  last_run_at: string | null;
  metrics: EvaluationMetricRow[];
}

export type ExportReport = 'learner-data' | 'anonymised-metrics';
export type ExportFormat = 'json' | 'csv';

// --- Grader QA / Cohen's kappa labelling (routes/management/grader.js) ------

/** One graded attempt sampled for a human rater to label. */
export interface GraderSampleAttempt {
  attempt_id: string;
  probe_type: string;
  machine_band: string;
  answer_text: string;
  answer_truncated: boolean;
  concept_label: string;
  has_label: boolean;
}

export interface GraderLabelsSample extends PrivacyEnvelope {
  bands: string[];
  attempts: GraderSampleAttempt[];
}

/** The persisted gold label returned by POST /grader/labels. */
export interface GraderLabel {
  id: string;
  attempt_id: string;
  human_band: string;
  rater: string;
  note: string | null;
  created_at: string;
}

export interface GraderLabelResponse extends PrivacyEnvelope {
  label: GraderLabel;
}

export interface GraderAgreement extends PrivacyEnvelope {
  live: {
    cohens_kappa: number | null;
    n: number;
    rater: string;
  };
  /** Canonical population value written by the aggregates job; null until computed. */
  published: AggregateMetric | null;
}
