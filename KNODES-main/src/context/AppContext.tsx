import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import type { AppState, GraphNode, GraphEdge, Note, NoteSource, NoteType, MasterCluster } from '../types';
import { demoNodes, demoEdges, demoUser } from '../data/demo';
import { api, API_BASE, clearTokens, getAccessToken, getRefreshToken, onAuthFailure, describeApiError } from '../lib/api';
import { invalidateConceptDetail } from '../lib/concepts';

export { API_BASE };

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface LearningPrefs {
  dailyGoal: number;
  reviewMode: 'Abstract' | 'Understand';
  decaySensitivity: 'Low' | 'Standard' | 'High';
  soloNotifications: boolean;
}

interface AppContextType extends AppState {
  login: () => void;
  logout: () => void;
  setTheme: (t: 'dark' | 'light') => void;
  addNote: (note: Note) => Promise<boolean>;
  updateNoteType: (id: string, noteType: NoteType, analogyTargetId?: string | null, analogyTopic?: string | null) => Promise<void>;
  setNoteSources: (id: string, sources: NoteSource[]) => void;
  submitNoteUpdate: (id: string, fields: { title: string; body: string }) => Promise<void>;
  updateNoteStatus: (id: string, status: Note['status']) => void;
  updateNoteTitle: (id: string, title: string) => void;
  updateNoteBody: (id: string, body: string) => void;
  deleteNote: (id: string) => void;
  updateUser: (fields: Partial<{ name: string; email: string }>) => Promise<void>;
  learningPrefs: LearningPrefs;
  setLearningPrefs: (prefs: Partial<LearningPrefs>) => void;
  refreshGraph: () => void;
  refreshNotes: () => void;
  resetProgress: () => Promise<void>;
  graphStatus: LoadStatus;
  graphError: string | null;
  clusters: MasterCluster[];
  clustersStatus: LoadStatus;
}

const AppContext = createContext<AppContextType | null>(null);

// ── API → UI mappers ─────────────────────────────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */
function mapNoteStatus(n: any): Note['status'] {
  const s = n.status;
  if (s === 'processing' || s === 'completed' || s === 'failed' || s === 'partial' || s === 'draft' || s === 'rejected') return s;
  if (n.ingestion_status === 'READY') return 'completed';
  if (n.ingestion_status === 'FAILED') return 'failed';
  if (n.ingestion_status === 'REJECTED') return 'rejected';
  if (n.ingestion_status === 'PENDING') return 'processing';
  return 'draft';
}

function mapNote(n: any): Note {
  const concepts: string[] = Array.isArray(n.concepts)
    ? n.concepts
        .map((c: any) => (typeof c === 'string' ? c : c?.canonical_label || c?.label))
        .filter((c: unknown): c is string => typeof c === 'string' && c.length > 0)
    : [];
  const ts = n.updated_at || n.created_at;
  return {
    id: n.id,
    title: n.title || 'Untitled',
    body: n.body ?? n.body_md ?? '',
    status: mapNoteStatus(n),
    concepts,
    conceptIds: Array.isArray(n.concepts)
      ? n.concepts.map((c: any) => c?.id).filter((id: unknown): id is string => typeof id === 'string')
      : [],
    updatedAt: ts ? new Date(ts).toLocaleDateString() : '',
    noteType: n.note_type === 'USER_DEFINED' || n.note_type === 'ANALOGY' ? n.note_type : 'SOURCE_BACKED',
    analogyTargetId: n.analogy_target_concept_id ?? null,
    analogyTargetLabel: n.analogy_target_label ?? null,
    targetConceptId: n.target_concept_id ?? null,
    revisions: Number(n.revisions) || 0,
    sources: Array.isArray(n.sources) ? n.sources.map(mapNoteSource) : [],
    sourceMatch: n.source_match == null ? null : Number(n.source_match),
    ingestionRejection: n.ingestion_rejection ?? null,
  };
}

export function mapNoteSource(s: any): NoteSource {
  return {
    id: String(s.id),
    kind: s.kind === 'file' || s.kind === 'paste' ? s.kind : 'link',
    title: s.title || (s.kind === 'link' ? s.url : 'Source') || 'Source',
    url: s.url ?? null,
    chars: Number(s.chars) || 0,
    createdAt: s.created_at,
  };
}

const REVIEW_MODES = ['Understand', 'Abstract'] as const;
const DECAY_SENSITIVITIES = ['Low', 'Standard', 'High'] as const;

/** Server profile fields (snake_case) → LearningPrefs, ignoring anything invalid. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLearningPrefs(data: any, fallback: LearningPrefs): LearningPrefs {
  const dailyGoal = Number(data?.daily_goal);
  const reviewMode = data?.review_mode;
  const decaySensitivity = data?.decay_sensitivity;
  return {
    dailyGoal: Number.isInteger(dailyGoal) && dailyGoal >= 1 && dailyGoal <= 50 ? dailyGoal : fallback.dailyGoal,
    reviewMode: (REVIEW_MODES as readonly string[]).includes(reviewMode) ? reviewMode : fallback.reviewMode,
    decaySensitivity: (DECAY_SENSITIVITIES as readonly string[]).includes(decaySensitivity) ? decaySensitivity : fallback.decaySensitivity,
    soloNotifications: typeof data?.solo_notifications === 'boolean' ? data.solo_notifications : fallback.soloNotifications,
  };
}

/** LearningPrefs (camelCase) → server profile fields (snake_case). Only the given keys. */
function prefsToServer(prefs: Partial<LearningPrefs>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (prefs.dailyGoal !== undefined) out.daily_goal = prefs.dailyGoal;
  if (prefs.reviewMode !== undefined) out.review_mode = prefs.reviewMode;
  if (prefs.decaySensitivity !== undefined) out.decay_sensitivity = prefs.decaySensitivity;
  if (prefs.soloNotifications !== undefined) out.solo_notifications = prefs.soloNotifications;
  return out;
}

const SOLO_LEVELS = ['Prestructural', 'Unistructural', 'Multistructural', 'Relational', 'Extended Abstract'] as const;

function mapSolo(s: unknown): GraphNode['solo'] {
  if (typeof s !== 'string') return undefined;
  const norm = s.replace(/_/g, ' ');
  return (SOLO_LEVELS as readonly string[]).includes(norm) ? (norm as GraphNode['solo']) : undefined;
}

/** Backend recall is 0..1 (or null = never reviewed); UI works in 0..100. */
export function recallToPercent(r: unknown): number | null {
  if (r === null || r === undefined || typeof r !== 'number' || Number.isNaN(r)) return null;
  const pct = r <= 1 ? r * 100 : r;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

function mapNode(n: any): GraphNode {
  return {
    id: n.id,
    label: n.label || n.canonical_label || 'Untitled concept',
    x: typeof n.x === 'number' ? n.x : Math.random() * 800,
    y: typeof n.y === 'number' ? n.y : Math.random() * 600,
    recall: recallToPercent(n.recall),
    locked: n.status === 'UNRESOLVED_PREREQUISITE',
    subject: n.category || undefined,
    summary: n.summary || undefined,
    solo: mapSolo(n.solo_level),
    halfLife: typeof n.half_life === 'number' ? n.half_life : undefined,
    lastReviewed: n.last_reviewed || undefined,
    isAnalogy: n.track === 'ANALOGY',
    analogyOf: n.analogy_of ?? null,
    isBedrock: Boolean(n.is_bedrock),
    upgraded: Boolean(n.upgraded),
    hasDeeperStep: Boolean(n.has_deeper_step),
    levelBand: n.level_band ?? null,
    teaser: n.teaser ?? null,
    simplificationNote: n.simplification_note ?? null,
  };
}

function mapEdgeType(t: unknown): GraphEdge['type'] {
  const s = String(t || '').toLowerCase();
  if (s === 'requires') return 'requires';
  if (s === 'analogy_of') return 'analogy';
  if (s === 'explained_by') return 'explained';
  if (s === 'wikilink') return 'wikilink';
  return 'semantic';
}

function mapCluster(c: any, memberIds: string[], nodeById: Map<string, GraphNode>): MasterCluster {
  const summary = { established: 0, weakening: 0, needsReview: 0, locked: 0 };
  memberIds.forEach(id => {
    const n = nodeById.get(id);
    if (!n) return;
    if (n.locked) summary.locked++;
    else if (n.recall === null) return;
    else if (n.recall >= 75) summary.established++;
    else if (n.recall >= 50) summary.weakening++;
    else summary.needsReview++;
  });
  const status: MasterCluster['status'] = summary.needsReview > 0
    ? (summary.established > 0 ? 'mixed' : 'needs-review')
    : 'healthy';
  // Place the cluster bubble at the centroid of its members.
  const members = memberIds.map(id => nodeById.get(id)).filter((n): n is GraphNode => !!n);
  const x = members.length ? members.reduce((s, n) => s + n.x, 0) / members.length : undefined;
  const y = members.length ? members.reduce((s, n) => s + n.y, 0) / members.length : undefined;
  return {
    id: c.id,
    x,
    y,
    label: c.label || 'Unnamed cluster',
    nodeIds: memberIds,
    parentClusterId: c.parent_cluster_id ?? null,
    recallSummary: summary,
    status,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const NOTE_SAVE_DEBOUNCE_MS = 800;
const NOTE_POLL_MS = 5000;

export function AppProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(!!getAccessToken());
  const [theme, setThemeState] = useState<'dark' | 'light'>('dark');
  // Demo graph only for logged-out views; logged-in users start empty and load from the API.
  const [nodes, setNodes] = useState<GraphNode[]>(() => (getAccessToken() ? [] : demoNodes));
  const [edges, setEdges] = useState<GraphEdge[]>(() => (getAccessToken() ? [] : demoEdges));
  const [graphStatus, setGraphStatus] = useState<LoadStatus>('idle');
  const [graphError, setGraphError] = useState<string | null>(null);
  const [clusters, setClusters] = useState<MasterCluster[]>([]);
  const [clustersStatus, setClustersStatus] = useState<LoadStatus>('idle');
  const [notes, setNotes] = useState<Note[]>([]);
  const [user, setUser] = useState(demoUser);
  const userRef = useRef(user);
  userRef.current = user;
  const [learningPrefs, setLearningPrefsState] = useState<LearningPrefs>({
    dailyGoal: 10,
    reviewMode: 'Understand',
    decaySensitivity: 'Standard',
    soloNotifications: true,
  });

  // Pending debounced note saves: id -> { timer, fields }
  const pendingSaves = useRef<Map<string, { timer: ReturnType<typeof setTimeout>; fields: { title?: string; body?: string } }>>(new Map());
  // flushNoteSave is defined below; updateNoteType (defined earlier) calls it via this ref.
  const flushNoteSaveRef = useRef<(id: string) => void>(() => {});

  const resetSession = useCallback(() => {
    pendingSaves.current.forEach(p => clearTimeout(p.timer));
    pendingSaves.current.clear();
    setIsLoggedIn(false);
    setNotes([]);
    setClusters([]);
    setClustersStatus('idle');
    setNodes(demoNodes);
    setEdges(demoEdges);
    setGraphStatus('idle');
    setGraphError(null);
    setUser(demoUser);
  }, []);

  // Refresh-failure from the API client → log out locally.
  useEffect(() => onAuthFailure(() => resetSession()), [resetSession]);

  const fetchClusters = useCallback(async (nodeList: GraphNode[]) => {
    setClustersStatus('loading');
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list = await api<any[]>('/api/clusters');
      const arr = Array.isArray(list) ? list : [];
      const nodeById = new Map(nodeList.map(n => [n.id, n]));
      const detailed = await Promise.all(arr.map(async c => {
        // The list already carries member_ids; fall back to the detail call for older APIs.
        if (Array.isArray(c?.member_ids)) return mapCluster(c, c.member_ids.map(String), nodeById);
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const d = await api<any>(`/api/clusters/${c.id}`);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ids: string[] = Array.isArray(d?.members) ? d.members.map((m: any) => m.concept_id) : [];
          return mapCluster(c, ids, nodeById);
        } catch {
          return mapCluster(c, [], nodeById);
        }
      }));
      setClusters(detailed.filter(c => c.nodeIds.length > 0));
      setClustersStatus('ready');
    } catch (err) {
      console.warn('Clusters unavailable:', describeApiError(err));
      setClusters([]);
      setClustersStatus('error');
    }
  }, []);

  /** Fetch the knowledge graph from the real API. Empty graph = empty state (no demo fallback). */
  const fetchGraph = useCallback(async () => {
    setGraphStatus('loading');
    setGraphError(null);
    invalidateConceptDetail();
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await api<any>('/api/graph');
      const mappedNodes: GraphNode[] = Array.isArray(data?.nodes) ? data.nodes.map(mapNode) : [];
      const ids = new Set(mappedNodes.map(n => n.id));
      const mappedEdges: GraphEdge[] = Array.isArray(data?.edges)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? data.edges.map((e: any) => ({
            source: e.source_id || e.source,
            target: e.target_id || e.target,
            type: mapEdgeType(e.type),
          })).filter((e: GraphEdge) => ids.has(e.source) && ids.has(e.target))
        : [];
      setNodes(mappedNodes);
      setEdges(mappedEdges);
      setGraphStatus('ready');
      fetchClusters(mappedNodes);
    } catch (err) {
      console.warn('Graph API unavailable:', describeApiError(err));
      setNodes([]);
      setEdges([]);
      setGraphError(describeApiError(err, 'Could not load your knowledge graph.'));
      setGraphStatus('error');
    }
  }, [fetchClusters]);

  /** Fetch notes and merge into local state (keeps unsaved local edits and not-yet-synced notes). */
  const fetchNotes = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await api<any[]>('/api/notes');
      if (!Array.isArray(data)) return;
      const server = data.map(mapNote);
      setNotes(prev => {
        const prevById = new Map(prev.map(n => [n.id, n]));
        const serverIds = new Set(server.map(n => n.id));
        const merged = server.map(s => {
          const local = prevById.get(s.id);
          const pending = pendingSaves.current.get(s.id);
          if (local && pending) {
            return { ...s, title: pending.fields.title ?? local.title, body: pending.fields.body ?? local.body, updatedAt: local.updatedAt };
          }
          return s;
        });
        // Local notes the server doesn't know yet (POST in flight) stay at the top.
        const localOnly = prev.filter(n => !serverIds.has(n.id) && n.updatedAt === 'Just now');
        return [...localOnly, ...merged];
      });
    } catch (err) {
      console.error('Failed to fetch notes:', describeApiError(err));
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;

    setNodes([]);
    setEdges([]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api<any>('/api/users/me')
      .then(data => {
        if (!data || data.error) return;
        const name = data.name || (data.email ? String(data.email).split('@')[0] : 'Learner');
        const memberSince = data.created_at
          ? new Date(data.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
          : '';
        setUser({ name, email: data.email || '', memberSince, avatarInitial: name.charAt(0).toUpperCase() });
        setLearningPrefsState(prev => mapLearningPrefs(data, prev));
      })
      .catch(err => console.error('Failed to fetch profile:', describeApiError(err)));

    fetchNotes();
    fetchGraph();
  }, [isLoggedIn, fetchGraph, fetchNotes]);

  // Poll notes while any is still being ingested by the backend; refresh graph when one finishes.
  const processingIds = notes.filter(n => n.status === 'processing').map(n => n.id).join(',');
  const prevProcessing = useRef<string>('');
  useEffect(() => {
    if (!isLoggedIn) return;
    const before = prevProcessing.current;
    prevProcessing.current = processingIds;
    if (before && before !== processingIds) fetchGraph();
    if (!processingIds) return;
    const t = setInterval(fetchNotes, NOTE_POLL_MS);
    return () => clearInterval(t);
  }, [isLoggedIn, processingIds, fetchNotes, fetchGraph]);

  const login = useCallback(() => setIsLoggedIn(true), []);

  const logout = useCallback(() => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      // Fire and forget; token revocation failure must not block local logout.
      api('/api/auth/logout', { method: 'POST', body: { refreshToken }, auth: false, keepalive: true })
        .catch(() => { /* ignore */ });
    }
    clearTokens();
    resetSession();
  }, [resetSession]);

  const setTheme = useCallback((t: 'dark' | 'light') => {
    setThemeState(t);
    document.documentElement.dataset.theme = t === 'light' ? 'light' : '';
  }, []);

  /** Creates the note server-side. Resolves true once the POST succeeded. */
  const addNote = useCallback(async (note: Note): Promise<boolean> => {
    setNotes(prev => [note, ...prev]);
    try {
      await api('/api/notes', {
        method: 'POST',
        body: {
          id: note.id,
          title: note.title.trim() || 'Untitled',
          body: note.body,
          note_type: note.noteType ?? 'SOURCE_BACKED',
          analogy_target_concept_id: note.noteType === 'ANALOGY' ? (note.analogyTargetId ?? null) : null,
          // Analogy about a topic with no note yet.
          analogy_target_label: note.noteType === 'ANALOGY' && !note.analogyTargetId ? (note.analogyTargetLabel ?? null) : null,
          target_concept_id: note.targetConceptId ?? null,
        },
      });
      fetchNotes();
      return true;
    } catch (err) {
      console.error('Error saving note:', describeApiError(err));
      setNotes(prev => prev.map(n => (n.id === note.id ? { ...n, status: 'failed' } : n)));
      return false;
    }
  }, [fetchNotes]);

  /** Change a note's type / analogy target (saved immediately; re-ingests). */
  const updateNoteType = useCallback(async (
    id: string,
    noteType: NoteType,
    analogyTargetId: string | null = null,
    analogyTopic: string | null = null,
  ) => {
    const isAnalogy = noteType === 'ANALOGY';
    setNotes(prev => prev.map(n => (n.id === id ? {
      ...n, noteType,
      analogyTargetId: isAnalogy ? analogyTargetId : null,
      analogyTargetLabel: isAnalogy ? (analogyTargetId ? n.analogyTargetLabel : analogyTopic) : null,
      sources: noteType === 'USER_DEFINED' ? [] : n.sources,
    } : n)));
    // Flush any pending body/title edit first so it isn't lost or reordered.
    flushNoteSaveRef.current(id);
    await api(`/api/notes/${id}`, {
      method: 'PUT',
      body: {
        note_type: noteType,
        analogy_target_concept_id: isAnalogy ? analogyTargetId : null,
        // An analogy about a topic with no note yet (null clears it).
        analogy_target_label: isAnalogy && !analogyTargetId ? (analogyTopic ?? null) : null,
      },
    });
    fetchNotes();
  }, [fetchNotes]);

  /** Notes are read-only once created: this is the one explicit "Update note"
   *  submit. Saves title/body now (the old text is kept as a revision) and
   *  re-processes the note into a new version. Rejects on failure. */
  const submitNoteUpdate = useCallback(async (id: string, fields: { title: string; body: string }) => {
    const pending = pendingSaves.current.get(id);
    if (pending) { clearTimeout(pending.timer); pendingSaves.current.delete(id); }
    const title = fields.title.trim() || 'Untitled';
    setNotes(prev => prev.map(n => (n.id === id ? { ...n, title, body: fields.body, status: 'processing', updatedAt: 'Just now' } : n)));
    await api(`/api/notes/${id}`, { method: 'PUT', body: { title, body: fields.body } });
    fetchNotes();
  }, [fetchNotes]);

  /** Replace a note's local source list (after a sources API call). */
  const setNoteSources = useCallback((id: string, sources: NoteSource[]) => {
    setNotes(prev => prev.map(n => (n.id === id ? { ...n, sources } : n)));
  }, []);

  /** Local-only: ingestion status is owned by the backend. */
  const updateNoteStatus = useCallback((id: string, status: Note['status']) => {
    setNotes(prev => prev.map(n => (n.id === id ? { ...n, status } : n)));
  }, []);

  const flushNoteSave = useCallback((id: string) => {
    const pending = pendingSaves.current.get(id);
    if (!pending) return;
    pendingSaves.current.delete(id);
    clearTimeout(pending.timer);
    const fields = { ...pending.fields };
    if (fields.title !== undefined) fields.title = fields.title.trim() || 'Untitled';
    api(`/api/notes/${id}`, { method: 'PUT', body: fields })
      .catch(err => console.error('Error updating note:', describeApiError(err)));
  }, []);

  flushNoteSaveRef.current = flushNoteSave;

  const scheduleNoteSave = useCallback((id: string, fields: { title?: string; body?: string }) => {
    const existing = pendingSaves.current.get(id);
    if (existing) clearTimeout(existing.timer);
    const merged = { ...(existing?.fields ?? {}), ...fields };
    const timer = setTimeout(() => flushNoteSave(id), NOTE_SAVE_DEBOUNCE_MS);
    pendingSaves.current.set(id, { timer, fields: merged });
  }, [flushNoteSave]);

  // Flush pending saves when the provider unmounts / page hides.
  useEffect(() => {
    const flushAll = () => Array.from(pendingSaves.current.keys()).forEach(flushNoteSave);
    window.addEventListener('pagehide', flushAll);
    return () => {
      window.removeEventListener('pagehide', flushAll);
      flushAll();
    };
  }, [flushNoteSave]);

  const updateNoteTitle = useCallback((id: string, title: string) => {
    setNotes(prev => prev.map(n => (n.id === id ? { ...n, title } : n)));
    scheduleNoteSave(id, { title });
  }, [scheduleNoteSave]);

  const updateNoteBody = useCallback((id: string, body: string) => {
    setNotes(prev => prev.map(n => (n.id === id ? { ...n, body, updatedAt: 'Just now' } : n)));
    scheduleNoteSave(id, { body });
  }, [scheduleNoteSave]);

  const deleteNote = useCallback((id: string) => {
    const pending = pendingSaves.current.get(id);
    if (pending) {
      clearTimeout(pending.timer);
      pendingSaves.current.delete(id);
    }
    setNotes(prev => prev.filter(n => n.id !== id));
    api(`/api/notes/${id}`, { method: 'DELETE' })
      .then(() => fetchGraph())
      .catch(err => console.error('Error deleting note:', describeApiError(err)));
  }, [fetchGraph]);

  /** Updates the profile; rejects with a friendly message (e.g. duplicate email) so callers can show it. */
  const updateUser = useCallback(async (fields: Partial<{ name: string; email: string }>) => {
    const snapshot = userRef.current;
    setUser(prev => ({ ...prev, ...fields, avatarInitial: (fields.name ?? prev.name).charAt(0).toUpperCase() }));
    try {
      await api('/api/users/me', { method: 'PUT', body: fields });
    } catch (err) {
      setUser(snapshot);
      const e = err as { status?: number };
      throw new Error(e?.status === 409 ? 'That email is already in use.' : describeApiError(err, 'Could not update your profile.'));
    }
  }, []);

  /** Optimistically updates local prefs and persists the changed fields to the
   *  profile; on failure it reverts to the previous values and surfaces the error. */
  const setLearningPrefs = useCallback((prefs: Parameters<AppContextType['setLearningPrefs']>[0]) => {
    const body = prefsToServer(prefs);
    if (Object.keys(body).length === 0) return;
    let snapshot: LearningPrefs | null = null;
    setLearningPrefsState(prev => {
      snapshot = prev;
      return { ...prev, ...prefs };
    });
    api('/api/users/me', { method: 'PUT', body })
      .catch(err => {
        console.error('Failed to save learning preferences:', describeApiError(err));
        if (snapshot) setLearningPrefsState(snapshot);
      });
  }, []);

  const refreshGraph = useCallback(() => { fetchGraph(); }, [fetchGraph]);
  const refreshNotes = useCallback(() => { fetchNotes(); }, [fetchNotes]);

  /** Clears recall scores, review history and SOLO levels on the server, then
   *  reloads the graph and notes so the UI reflects the fresh state. Notes and
   *  concepts themselves are preserved. Rejects with a friendly message. */
  const resetProgress = useCallback(async () => {
    try {
      await api('/api/users/me/reset-progress', { method: 'POST' });
    } catch (err) {
      throw new Error(describeApiError(err, 'Could not reset your progress. Try again.'));
    }
    fetchGraph();
    fetchNotes();
  }, [fetchGraph, fetchNotes]);

  return (
    <AppContext.Provider value={{
      isLoggedIn, theme, user, nodes, edges, notes, learningPrefs,
      graphStatus, graphError, clusters, clustersStatus,
      login, logout, setTheme, addNote, updateNoteType, setNoteSources, submitNoteUpdate, updateNoteStatus, updateNoteTitle, updateNoteBody, deleteNote, updateUser, setLearningPrefs,
      refreshGraph, refreshNotes, resetProgress,
    }}>
      {children}
    </AppContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
