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
}

export interface GraphEdge {
  source: string;
  target: string;
  type: 'semantic' | 'wikilink' | 'requires' | 'analogy';
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
