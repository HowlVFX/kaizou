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
}

export interface GraphEdge {
  source: string;
  target: string;
  type: 'semantic' | 'wikilink' | 'requires';
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
