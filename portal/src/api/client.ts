import type { AuthLearner, AuthResponse, ExportFormat, ExportReport, PrivacyEnvelope } from './types';

// Empty = same origin (the Vite dev server proxies /api to Express).
const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const MANAGEMENT_BASE = '/api/management';

const ACCESS_KEY = 'portal_access_token';
const REFRESH_KEY = 'portal_refresh_token';
const USER_KEY = 'portal_user';

/** Fired on window when the session can no longer be refreshed. */
export const SESSION_EXPIRED_EVENT = 'portal:session-expired';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Session storage
// ---------------------------------------------------------------------------

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function getSessionUser(): AuthLearner | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthLearner;
  } catch {
    return null;
  }
}

export function hasAdminSession(): boolean {
  return Boolean(getAccessToken()) && getSessionUser()?.role === 'admin';
}

function storeSession(data: AuthResponse): void {
  localStorage.setItem(ACCESS_KEY, data.accessToken);
  localStorage.setItem(REFRESH_KEY, data.refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(data.learner));
}

function clearSession(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem('portal_token'); // legacy key from the old portal login
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.error === 'string') return body.error;
  } catch {
    // non-JSON body
  }
  return fallback;
}

function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(`${API_ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function login(email: string, password: string): Promise<AuthLearner> {
  const res = await postJson('/api/auth/login', { email, password });
  if (!res.ok) {
    throw new ApiError(res.status, res.status === 401
      ? 'Invalid email or password.'
      : await readError(res, 'Login failed. Please try again.'));
  }
  const data = (await res.json()) as AuthResponse;
  if (data.learner?.role !== 'admin') {
    // Revoke the learner session we were just issued; the portal is admin-only.
    postJson('/api/auth/logout', { refreshToken: data.refreshToken }).catch(() => undefined);
    throw new ApiError(403, 'This account does not have admin access to the management portal.');
  }
  storeSession(data);
  return data.learner;
}

export async function logout(): Promise<void> {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  clearSession();
  if (refreshToken) {
    try {
      await postJson('/api/auth/logout', { refreshToken });
    } catch {
      // Local session is already cleared; the refresh token will expire server-side.
    }
  }
}

// Single in-flight refresh so parallel 401s don't rotate the token twice.
let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refreshToken = localStorage.getItem(REFRESH_KEY);
      if (!refreshToken) return false;
      try {
        const res = await postJson('/api/auth/refresh', { refreshToken });
        if (!res.ok) return false;
        const data = (await res.json()) as AuthResponse;
        if (data.learner?.role !== 'admin') return false;
        storeSession(data);
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

function expireSession(): never {
  clearSession();
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  throw new ApiError(401, 'Your session has expired. Please log in again.');
}

// ---------------------------------------------------------------------------
// Authenticated requests
// ---------------------------------------------------------------------------

/**
 * fetch with the access token. On 401 it refreshes once and retries; only if
 * the refresh fails is the session cleared (SESSION_EXPIRED_EVENT).
 */
export async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const send = () => {
    const headers = new Headers(init.headers);
    const token = getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(`${API_ORIGIN}${path}`, { ...init, headers });
  };

  let res = await send();
  if (res.status === 401) {
    if (!(await refreshSession())) expireSession();
    res = await send();
    if (res.status === 401) expireSession();
  }
  return res;
}

export async function fetchApi<T>(path: string): Promise<T> {
  const res = await authFetch(`${MANAGEMENT_BASE}${path}`);
  if (!res.ok) {
    const fallback = res.status === 403
      ? 'Admin access required.'
      : `Request failed (${res.status}).`;
    throw new ApiError(res.status, await readError(res, fallback));
  }
  return (await res.json()) as T;
}

export type ExportResult =
  | { status: 'downloaded'; filename: string }
  | { status: 'suppressed'; reason: string };

/** Exports need the Authorization header, so they go through fetch -> Blob -> download. */
export async function downloadExport(report: ExportReport, format: ExportFormat): Promise<ExportResult> {
  const res = await authFetch(`${MANAGEMENT_BASE}/exports/${encodeURIComponent(report)}?format=${format}`);
  if (!res.ok) {
    throw new ApiError(res.status, await readError(res, `Export failed (${res.status}).`));
  }

  const contentType = res.headers.get('Content-Type') || '';
  let blob: Blob;
  if (contentType.includes('application/json')) {
    // Suppressed reports come back as a JSON envelope instead of a file.
    const text = await res.text();
    const body = JSON.parse(text) as PrivacyEnvelope;
    if (body.suppressed) {
      return { status: 'suppressed', reason: body.reason || 'Below the privacy floor.' };
    }
    blob = new Blob([text], { type: 'application/json' });
  } else {
    blob = await res.blob();
  }

  const filename = `kaizou-${report}-${new Date().toISOString().slice(0, 10)}.${format}`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return { status: 'downloaded', filename };
}
