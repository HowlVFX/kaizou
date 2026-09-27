// Response shapes for /api/auth/* and /api/management/* (see routes/management/*.js).
// Learner-derived values are null (and lists empty) when below the N=5 privacy floor.

export type Role = 'learner' | 'admin';

export interface AuthLearner {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}

export interface AuthResponse {
  learner: AuthLearner;
  accessToken: string;
  refreshToken: string;
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
