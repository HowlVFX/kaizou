// ============================================================
// Kaizou — Shared Type Definitions
// Master Design Document §11 (Data Model)
// ============================================================

// --- Enums ---

export enum NoteStatus {
  PENDING = 'PENDING',
  READY = 'READY',
  FAILED = 'FAILED',
}

export enum ConceptTrack {
  SOURCE_BACKED = 'SOURCE_BACKED',
  SELF_AUTHORED = 'SELF_AUTHORED',
  ANALOGY = 'ANALOGY',
}

export enum ConceptShape {
  PROCEDURAL = 'PROCEDURAL',
  DEFINITION = 'DEFINITION',
  ORDERED_PROCESS = 'ORDERED_PROCESS',
  CAUSAL_RELATION = 'CAUSAL_RELATION',
}

export enum ConceptCategory {
  DETERMINISTIC_MECHANISM = 'DETERMINISTIC_MECHANISM',
  CONVENTIONAL = 'CONVENTIONAL',
  PROBABILISTIC = 'PROBABILISTIC',
  AXIOMATIC = 'AXIOMATIC',
  OUT_OF_SCOPE = 'OUT_OF_SCOPE',
}

export enum ConceptStatus {
  UNRESOLVED_PREREQUISITE = 'UNRESOLVED_PREREQUISITE',
  VERIFIED_CONCEPT = 'VERIFIED_CONCEPT',
}

export enum SoloLevel {
  PRESTRUCTURAL = 'Prestructural',
  UNISTRUCTURAL = 'Unistructural',
  MULTISTRUCTURAL = 'Multistructural',
  RELATIONAL = 'Relational',
  EXTENDED_ABSTRACT = 'Extended_Abstract',
}

export enum EdgeType {
  WIKILINK = 'WIKILINK',
  SEMANTIC = 'SEMANTIC',
  REQUIRES = 'REQUIRES',
  ANALOGY_OF = 'ANALOGY_OF',
}

export enum EdgeFlag {
  CYCLE_CONFLICT = 'CYCLE_CONFLICT',
  MERGE_CANDIDATE = 'MERGE_CANDIDATE',
}

export enum SourceTrustTier {
  PEER_REVIEWED = 'PEER_REVIEWED',
  INSTITUTIONAL = 'INSTITUTIONAL',
  GENERAL = 'GENERAL',
  SELF_AUTHORED = 'SELF_AUTHORED',
}

export enum TemplateTier {
  SOURCE_GROUNDED = 'SOURCE_GROUNDED',
  GENERATED = 'GENERATED',
}

export enum TemplateConfidence {
  STABLE = 'stable',
  UNSTABLE = 'unstable',
}

export enum ProbeType {
  CLOZE = 'CLOZE',
  RECALL = 'RECALL',
  PROCESS_TRACE = 'PROCESS_TRACE',
  PROCEDURAL = 'PROCEDURAL',
  MISCONCEPTION_MCQ = 'MISCONCEPTION_MCQ',
  CONCEPT_SORT = 'CONCEPT_SORT',
  PERTURBATION = 'PERTURBATION',
  NEAR_TRANSFER = 'NEAR_TRANSFER',
  FAR_TRANSFER = 'FAR_TRANSFER',
  ANALOGY_FORWARD = 'ANALOGY_FORWARD',
  ANALOGY_SIMULATE = 'ANALOGY_SIMULATE',
  ANALOGY_BREAKDOWN = 'ANALOGY_BREAKDOWN',
}

export enum GradingBand {
  FULL = 'Full',
  SHALLOW = 'Shallow',
  INCOMPLETE = 'Incomplete',
  NOT_YET_ENGAGED = 'Not_Yet_Engaged',
}

export enum LineageEvent {
  SAME = 'SAME',
  EVOLVED = 'EVOLVED',
  MERGED = 'MERGED',
  SPLIT = 'SPLIT',
  NEW = 'NEW',
  DISSOLVED = 'DISSOLVED',
}

export enum ClusterStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export enum JobStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum LearnerRole {
  LEARNER = 'learner',
  ADMIN = 'admin',
}

// --- Domain Entities ---

export interface Learner {
  id: string;
  email: string;
  name?: string;
  role: LearnerRole;
  preferred_language: string;
  portal_optin: boolean;
  created_at: string;
}

export interface Note {
  id: string;
  learner_id: string;
  title: string;
  body_md: string;
  markdown_hash?: string;
  language: string;
  ingestion_status: NoteStatus;
  created_at: string;
  updated_at: string;
}

export interface Concept {
  id: string;
  learner_id: string;
  canonical_label: string;
  track: ConceptTrack;
  shape: ConceptShape;
  category: ConceptCategory;
  status: ConceptStatus;
  version: number;
  c_struct?: number;
  c_bloom?: number;
  c_0?: number;
  c_current?: number;
  n_req?: number;
  solo_level: SoloLevel;
  probe_eligible: boolean;
  source_trust_tier?: SourceTrustTier;
  created_at: string;
}

export interface Claim {
  id: string;
  concept_id: string;
  concept_version: number;
  text: string;
  order_index?: number;
  is_transition: boolean;
  is_load_bearing: boolean;
  branch_id?: string;
  weight: number;
  aliases: string[];
}

export interface Edge {
  id: string;
  learner_id: string;
  source_id: string;
  target_id: string;
  type: EdgeType;
  weight: number;
  confidence?: number;
  flag?: EdgeFlag;
  created_at: string;
}

export interface Source {
  id: string;
  concept_id: string;
  url: string;
  domain: string;
  trust_tier: SourceTrustTier;
  fetched_at: string;
  content_sha256: string;
  content_text: string;
  robots_ok: boolean;
}

export interface Validation {
  id: string;
  note_id: string;
  source_id: string;
  source_coverage: number;
  contradiction_count: number;
  flagged_pairs: Array<{ note_claim: string; source_claim: string; score: number }>;
  computed_at: string;
}

export interface ProcessTemplate {
  id: string;
  concept_id: string;
  concept_version: number;
  tier: TemplateTier;
  confidence: TemplateConfidence;
  disputed_count: number;
  order_tau?: number;
  structure: Record<string, unknown>;
  deltas: Record<string, unknown>;
  created_at: string;
}

export interface MemoryState {
  concept_id: string;
  learner_id: string;
  half_life: number;
  last_reviewed?: string;
  streak: number;
  attempts: number;
  passes: number;
  decay_exempt: boolean;
  mastered_at?: string;
  stagnation_clock: number;
}

export interface Probe {
  id: string;
  concept_id: string;
  concept_version: number;
  type: ProbeType;
  prompt_text: string;
  answer_key_snapshot: Record<string, unknown>;
  payload: Record<string, unknown>;
  retries: number;
  leaked: boolean;
  created_at: string;
}

export interface Attempt {
  id: string;
  learner_id: string;
  probe_id: string;
  concept_id: string;
  concept_version: number;
  answer_text?: string;
  answer_payload?: Record<string, unknown>;
  confidence_pre?: number;
  coverage?: number;
  ordering?: number;
  precision_score?: number;
  verbatim?: number;
  branch_leakage?: number;
  delta_score?: number;
  ari_mechanism?: number;
  ari_surface?: number;
  principle_ratio?: number;
  composite_score: number;
  band: GradingBand;
  predicted_recall?: number;
  passed: boolean;
  gap_report: Record<string, unknown>;
  submitted_at: string;
}

export interface MisconceptionEvent {
  id: string;
  learner_id: string;
  concept_id: string;
  attempt_id: string;
  tag: string;
  created_at: string;
}

export interface Cluster {
  id: string;
  learner_id: string;
  parent_cluster_id?: string;
  label: string;
  modularity?: number;
  member_count: number;
  resolution: number;
  status: ClusterStatus;
  created_at: string;
  last_named_at?: string;
}

export interface ClusterMember {
  cluster_id: string;
  concept_id: string;
  computed_at: string;
}

export interface ClusterLineage {
  id: string;
  learner_id: string;
  cluster_id: string;
  parent_cluster_ids: string[];
  event: LineageEvent;
  jaccard?: number;
  run_at: string;
}

export interface Job {
  id: string;
  job_type: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  run_after: string;
  locked_by?: string;
  locked_at?: string;
  attempts: number;
  max_attempts: number;
  last_error?: string;
  completed_at?: string;
  created_at: string;
}

export interface PortalAggregate {
  id: string;
  metric_key: string;
  cohort_key: string;
  window_start?: string;
  window_end?: string;
  value: number;
  sample_size: number;
  suppressed: boolean;
  dimensions: Record<string, unknown>;
  computed_at: string;
}

// --- API DTOs ---

export interface ReviewQueueItem {
  concept_id: string;
  concept_label: string;
  recall_probability: number;
  priority_score: number;
  is_detour: boolean;
  detour_reason?: string;
  solo_level: SoloLevel;
  complexity: number;
}

export interface LearningPathStep {
  concept_id: string;
  concept_label: string;
  recall_probability: number;
  solo_level: SoloLevel;
  complexity: number;
  is_locked: boolean;
  is_current_target: boolean;
}

export interface LearningPathResponse {
  target_concept_id: string;
  ordered: LearningPathStep[];
  unordered?: LearningPathStep[];
}

export interface PersonalAnalytics {
  solo_distribution: Record<SoloLevel, number>;
  recall_curve: Array<{ date: string; mean_recall: number }>;
  mastery_count: number;
  total_concepts: number;
  total_attempts: number;
  absorption_efficiency?: number;
  complexity_ceiling?: number;
  metacognitive_gap?: number;
}

export interface GapReport {
  missing_claims: Array<{ claim_text: string; weight: number; is_transition: boolean }>;
  prerequisite_pointers: Array<{ concept_id: string; concept_label: string }>;
  coverage: number;
  band: GradingBand;
}

// --- Portal-specific DTOs (no raw text fields) ---

export interface PortalOverview {
  active_learners: number;
  total_notes: number;
  total_concepts: number;
  total_attempts: number;
  mastery_rate: number;
}

export interface PortalMetric {
  metric_key: string;
  value: number;
  sample_size: number;
  suppressed: boolean;
}
