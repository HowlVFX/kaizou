export interface GraphNode {
  id: string;
  label: string;
  x: number;
  y: number;
  recall: number | null;
  locked: boolean;
  subject?: string;
  summary?: string;
  claims?: string[];
  solo?: 'Prestructural' | 'Unistructural' | 'Multistructural' | 'Relational' | 'Extended Abstract';
  prerequisites?: string[];
  related?: string[];
  sourceNote?: string;
  process?: string[];
  evidence?: {
    definition?: number;
    mechanism?: number;
    contrast?: number;
    boundary?: number;
    application?: number;
    counterfactual?: number;
  };
  assessmentEvidence?: {
    recall?: 'demonstrated' | 'developing' | 'none';
    processTrace?: 'demonstrated' | 'developing' | 'none';
    counterfactual?: 'demonstrated' | 'developing' | 'none';
    transfer?: 'demonstrated' | 'developing' | 'none';
  };
  halfLife?: number;
  lastReviewed?: string;
  /** Analogy node (drawn as a diamond). */
  isAnalogy?: boolean;
  /** Concept id this node is an analogy for. */
  analogyOf?: string | null;
  /** Go deeper: nothing deeper explains this (axiom, law, observed fact). */
  isBedrock?: boolean;
  /** A deeper explanation of this node has been learnt. */
  upgraded?: boolean;
  hasDeeperStep?: boolean;
  levelBand?: string | null;
  /** On an explanation node: what it will reveal. */
  teaser?: string | null;
  simplificationNote?: string | null;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: 'semantic' | 'wikilink' | 'requires' | 'analogy' | 'explained';
}

/** One step down the why-ladder (GET/POST /api/concepts/:id/deeper). */
export interface DeeperStep {
  concept_id: string;
  label: string;
  level_band: string | null;
  has_step: boolean;
  stale: boolean;
  is_bedrock: boolean;
  bedrock_reason: string | null;
  question: string | null;
  primer: string | null;
  simplification: string | null;
  chain: { concept_id: string; label: string }[];
  explanations: { concept_id: string; label: string; teaser: string | null; level_band: string | null; locked: boolean; is_bedrock: boolean }[];
}

/** SOURCE_BACKED: may have sources · USER_DEFINED: no sources · ANALOGY: analogy for another concept. */
export type NoteType = 'SOURCE_BACKED' | 'USER_DEFINED' | 'ANALOGY';

export interface NoteSource {
  id: string;
  kind: 'link' | 'file' | 'paste';
  title: string;
  url?: string | null;
  chars: number;
  createdAt?: string;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  status: 'draft' | 'processing' | 'completed' | 'partial' | 'failed';
  concepts?: string[];
  conceptIds?: string[];
  claims?: number;
  connections?: number;
  updatedAt: string;
  noteType?: NoteType;
  analogyTargetId?: string | null;
  analogyTargetLabel?: string | null;
  /** Locked concept this note was written to unlock ("learn this concept"). */
  targetConceptId?: string | null;
  sources?: NoteSource[];
}

export interface User {
  name: string;
  email: string;
  avatarInitial: string;
  memberSince: string;
}

export interface MasterCluster {
  id: string;
  label: string;
  description?: string;
  nodeIds: string[];
  keyNodeIds?: string[];
  parentClusterId?: string | null;
  recallSummary?: {
    established: number;
    weakening: number;
    needsReview: number;
    locked: number;
  };
  status?: 'healthy' | 'mixed' | 'needs-review';
  x?: number;
  y?: number;
}

export interface AppState {
  isLoggedIn: boolean;
  theme: 'dark' | 'light';
  user: User;
  nodes: GraphNode[];
  edges: GraphEdge[];
  notes: Note[];
}
