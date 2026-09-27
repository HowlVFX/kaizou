import { useEffect, useState } from 'react';
import { api, describeApiError } from './api';

export interface ConceptDetail {
  id: string;
  claims: string[];
  /** Concept ids this concept requires (REQUIRES edge source=this → target=prereq) */
  prerequisites: string[];
  /** Concept ids that depend on this concept (REQUIRES edge target=this) */
  dependents: string[];
  /** Concept ids linked by non-REQUIRES edges */
  related: string[];
  version?: number;
  status?: string;
  lastReviewed?: string | null;
  halfLife?: number | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapDetail(d: any): ConceptDetail {
  const claims: string[] = Array.isArray(d?.claims)
    ? [...d.claims]
        .sort((a: any, b: any) => (a?.order_index ?? 0) - (b?.order_index ?? 0))
        .map((c: any) => (typeof c === 'string' ? c : c?.text))
        .filter((t: unknown): t is string => typeof t === 'string' && t.length > 0)
    : [];
  const prerequisites = new Set<string>();
  const dependents = new Set<string>();
  const related = new Set<string>();
  (Array.isArray(d?.edges) ? d.edges : []).forEach((e: any) => {
    const type = String(e?.type || '').toUpperCase();
    const src = e?.source_id;
    const tgt = e?.target_id;
    if (!src || !tgt) return;
    if (type === 'REQUIRES') {
      if (src === d.id) prerequisites.add(tgt);
      else if (tgt === d.id) dependents.add(src);
    } else {
      related.add(src === d.id ? tgt : src);
    }
  });
  return {
    id: d?.id,
    claims,
    prerequisites: [...prerequisites],
    dependents: [...dependents],
    related: [...related].filter(id => !prerequisites.has(id) && !dependents.has(id)),
    version: typeof d?.version === 'number' ? d.version : undefined,
    status: d?.status,
    lastReviewed: d?.last_reviewed ?? null,
    halfLife: typeof d?.half_life === 'number' ? d.half_life : null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const cache = new Map<string, ConceptDetail>();

export async function fetchConceptDetail(id: string): Promise<ConceptDetail> {
  const hit = cache.get(id);
  if (hit) return hit;
  const data = await api<unknown>(`/api/concepts/${encodeURIComponent(id)}`);
  const detail = mapDetail(data);
  cache.set(id, detail);
  return detail;
}

export function invalidateConceptDetail(id?: string) {
  if (id) cache.delete(id);
  else cache.clear();
}

/** Loads concept detail (claims + edges) for the given id. Skips ids that are not UUIDs (demo data). */
export function useConceptDetail(id: string | null | undefined) {
  const [detail, setDetail] = useState<ConceptDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDetail(null);
    setError(null);
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchConceptDetail(id)
      .then(d => { if (!cancelled) setDetail(d); })
      .catch(err => { if (!cancelled) setError(describeApiError(err, 'Could not load concept details.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  return { detail, loading, error };
}

/** Human-readable relative time for ISO timestamps (falls back to the raw string). */
export function formatRelative(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return ts;
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(t).toLocaleDateString();
}
