import type { AdminUser, AdminAuthResponse, ExportFormat, ExportReport, PrivacyEnvelope } from './types';

// Empty = same origin (the Vite dev server proxies /api to Express).
const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
// The admin API lives at a secret, non-obvious base (NOT /api/management). It
// must match the server's ADMIN_API_BASE; override with VITE_ADMIN_API_BASE.
const ADMIN_BASE = (import.meta.env.VITE_ADMIN_API_BASE || '/api/_ctrl').replace(/\/$/, '');
const MANAGEMENT_BASE = `${ADMIN_BASE}/management`;

const ACCESS_KEY = 'portal_access_token';
const REFRESH_KEY = 'portal_refresh_token';
const USER_KEY = 'portal_user';
const GATE_KEY = 'portal_gate_token';

/** Fired on window when the session can no longer be refreshed. */
export const SESSION_EXPIRED_EVENT = 'portal:session-expired';
/** Fired when the shared site gate is no longer valid (must re-enter it). */
export const GATE_REQUIRED_EVENT = 'portal:gate-required';

// --- Site gate (shared splash credentials in front of the whole portal) ------
export function getGateToken(): string | null {
  return localStorage.getItem(GATE_KEY);
}
export function hasGate(): boolean {
  return Boolean(getGateToken());
}
export function clearGateToken(): void {
  localStorage.removeItem(GATE_KEY);
}
/** Exchange the shared gate credentials for a gate token. Throws ApiError on failure. */
export async function enterGate(username: string, password: string): Promise<void> {
  const res = await postJson('/api/gate', { username, password });
  if (!res.ok) {
    throw new ApiError(res.status, 'Incorrect access credentials.');
  }
  const data = await res.json();
  if (!data?.gateToken) throw new ApiError(500, 'Gate failed.');
  localStorage.setItem(GATE_KEY, data.gateToken);
}

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

export function getSessionUser(): AdminUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminUser;
  } catch {
    return null;
  }
}

// Any valid admin (owner or moderator) has a portal session; role gates
// specific actions, not access to the portal itself.
export function hasAdminSession(): boolean {
  const role = getSessionUser()?.admin_role;
  return Boolean(getAccessToken()) && (role === 'owner' || role === 'moderator');
}

export function isOwner(): boolean {
  return getSessionUser()?.admin_role === 'owner';
}

function storeSession(data: AdminAuthResponse): void {
  localStorage.setItem(ACCESS_KEY, data.accessToken);
  localStorage.setItem(REFRESH_KEY, data.refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(data.admin));
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

function gateHeaders(base: Record<string, string> = {}): Record<string, string> {
  const gate = getGateToken();
  return gate ? { ...base, 'X-Gate-Token': gate } : base;
}

function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(`${API_ORIGIN}${path}`, {
    method: 'POST',
    headers: gateHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
}

function requireGateOrThrow(res: Response, data?: { code?: string }): void {
  if (res.status === 401 && data?.code === 'gate_required') {
    clearGateToken();
    window.dispatchEvent(new Event(GATE_REQUIRED_EVENT));
    throw new ApiError(401, 'Site access has expired. Re-enter the access credentials.');
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function login(email: string, password: string): Promise<AdminUser> {
  const res = await postJson(`${ADMIN_BASE}/login`, { email, password });
  if (!res.ok) {
    const body = await res.clone().json().catch(() => null);
    requireGateOrThrow(res, body);
    throw new ApiError(res.status, res.status === 401
      ? 'Invalid email or password.'
      : await readError(res, 'Login failed. Please try again.')); // 403 = email not on the allowlist
  }
  const data = (await res.json()) as AdminAuthResponse;
  if (!data.admin) {
    throw new ApiError(500, 'Login failed.');
  }
  storeSession(data);
  return data.admin;
}

/** Create a moderator account. Only works for an email on the allowlist. */
export async function signup(email: string, password: string, name?: string): Promise<AdminUser> {
  const res = await postJson(`${ADMIN_BASE}/signup`, { email, password, name });
  if (!res.ok) {
    const body = await res.clone().json().catch(() => null);
    requireGateOrThrow(res, body);
    throw new ApiError(res.status, await readError(res, 'Sign up failed. Please try again.'));
  }
  const data = (await res.json()) as AdminAuthResponse;
  if (!data.admin) {
    throw new ApiError(500, 'Sign up failed.');
  }
  storeSession(data);
  return data.admin;
}

export async function logout(): Promise<void> {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  clearSession();
  if (refreshToken) {
    try {
      await postJson(`${ADMIN_BASE}/logout`, { refreshToken });
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
        const res = await postJson(`${ADMIN_BASE}/refresh`, { refreshToken });
        if (!res.ok) return false;
        const data = (await res.json()) as AdminAuthResponse;
        if (!data.admin) return false;
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
    const gate = getGateToken();
    if (gate) headers.set('X-Gate-Token', gate);
    return fetch(`${API_ORIGIN}${path}`, { ...init, headers });
  };

  let res = await send();
  // The whole portal is behind the shared site gate; if it lapses, bounce to it.
  if (res.status === 401) {
    const peek = await res.clone().json().catch(() => null);
    if (peek?.code === 'gate_required') {
      clearGateToken();
      window.dispatchEvent(new Event(GATE_REQUIRED_EVENT));
      return res;
    }
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

// --- Admin control-plane calls (allowlist + admin management) ----------------
// These hit ADMIN_BASE directly (not the /management sub-base).

async function adminJson<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await authFetch(`${ADMIN_BASE}${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new ApiError(res.status, await readError(res, `Request failed (${res.status}).`));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const adminApi = {
  listAllowlist: () => adminJson('GET', '/allowlist'),
  addAllowlist: (email: string, note?: string) => adminJson('POST', '/allowlist', { email, note }),
  removeAllowlist: (id: string) => adminJson('DELETE', `/allowlist/${encodeURIComponent(id)}`),
  listAdmins: () => adminJson('GET', '/admins'),
  createModerator: (email: string, password: string, name?: string) =>
    adminJson('POST', '/admins', { email, password, name }),
  removeAdmin: (id: string) => adminJson('DELETE', `/admins/${encodeURIComponent(id)}`),
};

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
