// Single API client for the Kaizou/KNODES learner frontend.
// - Attaches the Bearer access token
// - On 401 {code:'token_expired'} refreshes once (shared promise), then retries
// - On refresh failure clears tokens and notifies subscribers (AppContext logs out)

export const API_BASE: string = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const ACCESS_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';

export class ApiError extends Error {
  status: number;
  code?: string;
  data: unknown;
  constructor(status: number, message: string, data: unknown, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.code = code;
  }
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(accessToken: string, refreshToken?: string | null): void {
  localStorage.setItem(ACCESS_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

// ── Auth-failure subscription ────────────────────────────────────────────────
type Listener = () => void;
const authFailureListeners = new Set<Listener>();

export function onAuthFailure(listener: Listener): () => void {
  authFailureListeners.add(listener);
  return () => {
    authFailureListeners.delete(listener);
  };
}

function emitAuthFailure() {
  authFailureListeners.forEach(l => {
    try { l(); } catch { /* ignore listener errors */ }
  });
}

// ── Refresh (deduped) ────────────────────────────────────────────────────────
let refreshPromise: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (!data?.accessToken) return false;
    setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

export function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

// ── Core request ─────────────────────────────────────────────────────────────
export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Skip the Authorization header and refresh logic (login/signup/exchange) */
  auth?: boolean;
  signal?: AbortSignal;
  keepalive?: boolean;
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function send(path: string, opts: ApiOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.auth !== false) {
    const token = getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(`${API_BASE}${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
    keepalive: opts.keepalive,
  });
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await send(path, opts);
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    throw new ApiError(0, 'Network error: could not reach the server.', null, 'network');
  }

  let data = await parseBody(res);

  if (res.status === 401 && opts.auth !== false && (data as { code?: string } | null)?.code === 'token_expired') {
    const ok = await refreshSession();
    if (!ok) {
      clearTokens();
      emitAuthFailure();
      throw new ApiError(401, 'Your session has expired. Please log in again.', data, 'session_expired');
    }
    try {
      res = await send(path, opts);
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') throw err;
      throw new ApiError(0, 'Network error: could not reach the server.', null, 'network');
    }
    data = await parseBody(res);
  }

  if (!res.ok) {
    const d = (data && typeof data === 'object' ? data : {}) as { error?: string; message?: string; code?: string };
    // A non-refreshable 401 on an authenticated call means the session is gone.
    if (res.status === 401 && opts.auth !== false) {
      clearTokens();
      emitAuthFailure();
    }
    throw new ApiError(res.status, d.error || d.message || `Request failed (${res.status})`, data, d.code);
  }

  return data as T;
}

/** Friendly, non-crashing message for any API failure. */
export function describeApiError(err: unknown, fallback = 'Something went wrong.'): string {
  if (err instanceof ApiError) {
    if (err.status === 402) return 'The AI budget for this period is exhausted. Try again later.';
    if (err.status === 503) return 'The computation service is unavailable right now. Try again in a moment.';
    if (err.status === 0) return 'Could not reach the server. Check your connection.';
    if (err.status === 404) return 'Not found.';
    return err.message || fallback;
  }
  return fallback;
}
