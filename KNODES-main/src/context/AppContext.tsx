import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { AppState, GraphNode, GraphEdge, Note } from '../types';
import { demoNodes, demoEdges, demoUser } from '../data/demo';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

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
  addNote: (note: Note) => void;
  updateNoteStatus: (id: string, status: Note['status']) => void;
  updateNoteTitle: (id: string, title: string) => void;
  updateNoteBody: (id: string, body: string) => void;
  deleteNote: (id: string) => void;
  updateUser: (fields: Partial<{ name: string; email: string }>) => void;
  learningPrefs: LearningPrefs;
  setLearningPrefs: (prefs: Partial<LearningPrefs>) => void;
  refreshGraph: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('accessToken'));
  const [theme, setThemeState] = useState<'dark' | 'light'>('dark');
  const [nodes, setNodes] = useState<GraphNode[]>(demoNodes);
  const [edges, setEdges] = useState<GraphEdge[]>(demoEdges);
  const [notes, setNotes] = useState<Note[]>([]);
  const [user, setUser] = useState(demoUser);
  const [learningPrefs, setLearningPrefsState] = useState<LearningPrefs>({
    dailyGoal: 10,
    reviewMode: 'Understand',
    decaySensitivity: 'Standard',
    soloNotifications: true,
  });

  const getAuthHeaders = () => ({
    'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
    'Content-Type': 'application/json'
  });

  /** Fetch the knowledge graph from the real API, falling back to demo data */
  const fetchGraph = useCallback(() => {
    fetch(`${API_BASE}/api/graph`, { headers: getAuthHeaders() })
      .then(res => res.json())
      .then(data => {
        if (data.nodes && Array.isArray(data.nodes)) {
          setNodes(data.nodes.map((n: any) => ({
            id: n.id,
            label: n.label || n.canonical_label,
            x: n.x ?? Math.random() * 800,
            y: n.y ?? Math.random() * 600,
            recall: n.recall ?? null,
            locked: n.status === 'UNRESOLVED_PREREQUISITE',
            subject: n.category,
            summary: n.summary,
            solo: n.solo_level,
            halfLife: n.half_life,
            lastReviewed: n.last_reviewed,
          })));
        }
        if (data.edges && Array.isArray(data.edges)) {
          setEdges(data.edges.map((e: any) => ({
            source: e.source_id || e.source,
            target: e.target_id || e.target,
            type: (e.type || 'semantic').toLowerCase(),
          })));
        }
      })
      .catch(err => {
        console.warn("Graph API unavailable, using demo data:", err.message);
        // Keep existing demo data as fallback
      });
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    
    // Fetch user profile
    fetch(`${API_BASE}/api/users/me`, { headers: getAuthHeaders() })
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          const name = data.name || data.email.split('@')[0];
          const memberSince = new Date(data.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
          setUser({
            name,
            email: data.email,
            memberSince,
            avatarInitial: name.charAt(0).toUpperCase()
          });
        }
      })
      .catch(err => console.error("Failed to fetch profile:", err));

    // Fetch notes
    fetch(`${API_BASE}/api/notes`, { headers: getAuthHeaders() })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setNotes(data.map((n: any) => ({
            id: n.id,
            title: n.title,
            body: n.body || n.body_md,
            status: n.ingestion_status === 'READY' ? 'completed'
              : n.ingestion_status === 'FAILED' ? 'failed'
              : n.ingestion_status === 'PENDING' ? 'processing'
              : (n.status || 'draft'),
            concepts: n.concepts || [],
            updatedAt: new Date(n.updated_at).toLocaleDateString()
          })));
        }
      })
      .catch(err => console.error("Failed to fetch notes:", err));

    // Fetch graph from real API
    fetchGraph();

  }, [isLoggedIn, fetchGraph]);

  const login = useCallback(() => setIsLoggedIn(true), []);
  const logout = useCallback(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setIsLoggedIn(false);
  }, []);

  const setTheme = useCallback((t: 'dark' | 'light') => {
    setThemeState(t);
    document.documentElement.dataset.theme = t === 'light' ? 'light' : '';
  }, []);

  const addNote = useCallback((note: Note) => {
    // Optimistic UI update
    setNotes(prev => [note, ...prev]);

    // Backend save
    fetch(`${API_BASE}/api/notes`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ id: note.id, title: note.title, body: note.body, status: note.status })
    }).catch(err => console.error("Error saving note:", err));
  }, []);

  const updateNoteStatus = useCallback((id: string, status: Note['status']) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, status } : n));
    fetch(`${API_BASE}/api/notes/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status })
    }).catch(err => console.error("Error updating note:", err));
  }, []);

  const updateNoteTitle = useCallback((id: string, title: string) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, title } : n));
    fetch(`${API_BASE}/api/notes/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ title })
    }).catch(err => console.error("Error updating note:", err));
  }, []);

  const updateNoteBody = useCallback((id: string, body: string) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, body, updatedAt: 'Just now' } : n));
    fetch(`${API_BASE}/api/notes/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ body })
    }).catch(err => console.error("Error updating note:", err));
  }, []);

  const deleteNote = useCallback((id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id));
    fetch(`${API_BASE}/api/notes/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }).catch(err => console.error("Error deleting note:", err));
  }, []);

  const updateUser = useCallback((fields: Partial<{ name: string; email: string }>) => {
    setUser(prev => ({
      ...prev,
      ...fields,
      avatarInitial: (fields.name ?? prev.name).charAt(0).toUpperCase(),
    }));
    
    // Send update to backend
    fetch(`${API_BASE}/api/users/me`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(fields)
    }).catch(err => console.error("Error updating profile:", err));
  }, []);

  const setLearningPrefs = useCallback((prefs: Parameters<AppContextType['setLearningPrefs']>[0]) => {
    setLearningPrefsState(prev => ({ ...prev, ...prefs }));
  }, []);

  return (
    <AppContext.Provider value={{
      isLoggedIn, theme, user, nodes, edges, notes, learningPrefs,
      login, logout, setTheme, addNote, updateNoteStatus, updateNoteTitle, updateNoteBody, deleteNote, updateUser, setLearningPrefs, refreshGraph: fetchGraph,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
