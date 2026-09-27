import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { recallStatus } from '../data/demo';
import { api, describeApiError } from '../lib/api';
import { Brain, CheckCircle, AlertTriangle, BarChart, RefreshCw } from '../components/Icon';

function useVW() {
  const [vw, setVw] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setVw(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return vw;
}

// GET /api/analytics/dashboard
interface Dashboard {
  soloLevels: { solo_level: string | null; count: number }[];
  recallDistribution: { band: 'strong' | 'fading' | 'weak' | 'unreviewed'; count: number }[];
  absorptionEfficiency: number | null;
  absorption: { absorbed: number; ingested: number };
}

// GET /api/analytics/activity
interface Activity {
  total_attempts: number;
  total_passes: number;
  concepts_reviewed: number;
  recent: { date: string; attempts: number; passes: number }[];
}

// GET /api/analytics/transfer
interface TransferItem {
  concept_id: string;
  concept_label: string;
  probe_type: string;
  score: number | null;
  passed: boolean;
  at: string;
}

// GET /api/analytics/misconceptions
interface MisconceptionItem {
  tag: string;
  concept_id: string;
  concept_label: string;
  count: number;
  last_seen: string;
}

// GET /api/analytics/capabilities
interface CapabilityEvent {
  event_type: string;
  concept_id: string;
  concept_label: string;
  detail: Record<string, unknown>;
  at: string;
}

const PROBE_LABELS: Record<string, string> = {
  NEAR_TRANSFER: 'Near transfer',
  FAR_TRANSFER: 'Far transfer',
  ANALOGY_FORWARD: 'Analogy (forward)',
  ANALOGY_SIMULATE: 'Analogy (simulate)',
  ANALOGY_BREAKDOWN: 'Analogy (breakdown)',
};

const CAPABILITY_LABELS: Record<string, string> = {
  SOLO_ADVANCE: 'Structural level up',
  PERTURBATION_PASS: 'Handled a perturbation',
  TRANSFER_PASS: 'Demonstrated transfer',
  MASTERY: 'Reached mastery',
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapActivity(a: any): Activity {
  return {
    total_attempts: Number(a?.total_attempts) || 0,
    total_passes: Number(a?.total_passes) || 0,
    concepts_reviewed: Number(a?.concepts_reviewed) || 0,
    recent: Array.isArray(a?.recent) ? a.recent.map((r: any) => ({
      date: String(r?.date ?? ''),
      attempts: Number(r?.attempts) || 0,
      passes: Number(r?.passes) || 0,
    })) : [],
  };
}

function mapTransfer(d: any): TransferItem[] {
  return Array.isArray(d?.items) ? d.items.map((r: any) => ({
    concept_id: String(r?.concept_id ?? ''),
    concept_label: String(r?.concept_label ?? 'Untitled concept'),
    probe_type: String(r?.probe_type ?? ''),
    score: typeof r?.score === 'number' ? r.score : null,
    passed: Boolean(r?.passed),
    at: String(r?.at ?? ''),
  })) : [];
}

function mapMisconceptions(d: any): MisconceptionItem[] {
  return Array.isArray(d?.items) ? d.items.map((r: any) => ({
    tag: String(r?.tag ?? ''),
    concept_id: String(r?.concept_id ?? ''),
    concept_label: String(r?.concept_label ?? 'Untitled concept'),
    count: Number(r?.count) || 0,
    last_seen: String(r?.last_seen ?? ''),
  })) : [];
}

function mapCapabilities(d: any): CapabilityEvent[] {
  return Array.isArray(d?.events) ? d.events.map((r: any) => ({
    event_type: String(r?.event_type ?? ''),
    concept_id: String(r?.concept_id ?? ''),
    concept_label: String(r?.concept_label ?? 'Untitled concept'),
    detail: r?.detail && typeof r.detail === 'object' ? r.detail : {},
    at: String(r?.at ?? ''),
  })) : [];
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const SOLO_ORDER = ['Extended Abstract', 'Relational', 'Multistructural', 'Unistructural', 'Prestructural'] as const;
const SOLO_COLORS: Record<string, string> = {
  'Extended Abstract': 'var(--green)',
  Relational: 'var(--green)',
  Multistructural: 'var(--blue)',
  Unistructural: 'var(--orange)',
  Prestructural: 'var(--red)',
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapDashboard(d: any): Dashboard {
  return {
    soloLevels: Array.isArray(d?.soloLevels) ? d.soloLevels.map((s: any) => ({
      solo_level: typeof s?.solo_level === 'string' ? s.solo_level.replace(/_/g, ' ') : null,
      count: Number(s?.count) || 0,
    })) : [],
    recallDistribution: Array.isArray(d?.recallDistribution) ? d.recallDistribution.map((r: any) => ({
      band: r?.band, count: Number(r?.count) || 0,
    })) : [],
    absorptionEfficiency: typeof d?.absorptionEfficiency === 'number' ? d.absorptionEfficiency : null,
    absorption: {
      absorbed: Number(d?.absorption?.absorbed) || 0,
      ingested: Number(d?.absorption?.ingested) || 0,
    },
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export default function InsightsPage() {
  const { nodes, graphStatus, isLoggedIn } = useApp();
  const navigate = useNavigate();
  const vw = useVW();
  const isMobile = vw < 640;
  const [activeTab, setActiveTab] = useState<'overview' | 'transfer' | 'misconceptions'>('overview');

  const [dash, setDash] = useState<Dashboard | null>(null);
  const [dashStatus, setDashStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [dashError, setDashError] = useState<string | null>(null);

  const [activity, setActivity] = useState<Activity | null>(null);
  const [activityStatus, setActivityStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [activityError, setActivityError] = useState<string | null>(null);

  const [transfer, setTransfer] = useState<TransferItem[] | null>(null);
  const [transferStatus, setTransferStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [transferError, setTransferError] = useState<string | null>(null);

  const [misconceptions, setMisconceptions] = useState<MisconceptionItem[] | null>(null);
  const [misconceptionsStatus, setMisconceptionsStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [misconceptionsError, setMisconceptionsError] = useState<string | null>(null);

  const [capabilities, setCapabilities] = useState<CapabilityEvent[] | null>(null);
  const [capabilitiesStatus, setCapabilitiesStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [capabilitiesError, setCapabilitiesError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setDashStatus('loading');
    setDashError(null);
    try {
      const d = await api<unknown>('/api/analytics/dashboard');
      setDash(mapDashboard(d));
      setDashStatus('ready');
    } catch (err) {
      setDashError(describeApiError(err, 'Could not load analytics.'));
      setDashStatus('error');
    }
  }, []);

  const loadActivity = useCallback(async () => {
    setActivityStatus('loading');
    setActivityError(null);
    try {
      const d = await api<unknown>('/api/analytics/activity');
      setActivity(mapActivity(d));
      setActivityStatus('ready');
    } catch (err) {
      setActivityError(describeApiError(err, 'Could not load review activity.'));
      setActivityStatus('error');
    }
  }, []);

  const loadTransfer = useCallback(async () => {
    setTransferStatus('loading');
    setTransferError(null);
    try {
      const d = await api<unknown>('/api/analytics/transfer');
      setTransfer(mapTransfer(d));
      setTransferStatus('ready');
    } catch (err) {
      setTransferError(describeApiError(err, 'Could not load transfer evidence.'));
      setTransferStatus('error');
    }
  }, []);

  const loadMisconceptions = useCallback(async () => {
    setMisconceptionsStatus('loading');
    setMisconceptionsError(null);
    try {
      const d = await api<unknown>('/api/analytics/misconceptions');
      setMisconceptions(mapMisconceptions(d));
      setMisconceptionsStatus('ready');
    } catch (err) {
      setMisconceptionsError(describeApiError(err, 'Could not load misconceptions.'));
      setMisconceptionsStatus('error');
    }
  }, []);

  const loadCapabilities = useCallback(async () => {
    setCapabilitiesStatus('loading');
    setCapabilitiesError(null);
    try {
      const d = await api<unknown>('/api/analytics/capabilities');
      setCapabilities(mapCapabilities(d));
      setCapabilitiesStatus('ready');
    } catch (err) {
      setCapabilitiesError(describeApiError(err, 'Could not load capabilities.'));
      setCapabilitiesStatus('error');
    }
  }, []);

  // Don't fetch on logged-out (demo) views; show resolved empty states instead.
  useEffect(() => {
    if (!isLoggedIn) {
      setDashStatus('ready');
      setActivity(null); setActivityStatus('ready');
      setTransfer([]); setTransferStatus('ready');
      setMisconceptions([]); setMisconceptionsStatus('ready');
      setCapabilities([]); setCapabilitiesStatus('ready');
      return;
    }
    loadDashboard();
    loadActivity();
    loadTransfer();
    loadMisconceptions();
    loadCapabilities();
  }, [isLoggedIn, loadDashboard, loadActivity, loadTransfer, loadMisconceptions, loadCapabilities]);

  const band = (b: Dashboard['recallDistribution'][number]['band']) =>
    dash?.recallDistribution.find(r => r.band === b)?.count;

  const reviewed = nodes.filter(n => n.recall !== null);
  const healthy = band('strong') ?? nodes.filter(n => n.recall !== null && n.recall >= 75).length;
  const weakening = band('fading') ?? nodes.filter(n => n.recall !== null && n.recall >= 50 && n.recall < 75).length;
  const review = band('weak') ?? nodes.filter(n => n.recall !== null && n.recall < 50).length;
  const unreviewed = band('unreviewed') ?? nodes.filter(n => n.recall === null && !n.locked).length;
  const avgRecall = reviewed.length
    ? Math.round(reviewed.reduce((s, n) => s + (n.recall ?? 0), 0) / reviewed.length)
    : null;
  const totalConcepts = nodes.filter(n => !n.locked).length;
  const monthLabel = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const soloRows = SOLO_ORDER.map(level => ({
    level,
    count: dash?.soloLevels.find(s => s.solo_level === level)?.count ?? 0,
    color: SOLO_COLORS[level],
  }));
  const totalSolo = soloRows.reduce((s, d) => s + d.count, 0);

  return (
    <div style={{ padding: isMobile ? '16px 16px' : '32px 40px', height: '100%', overflowY: 'auto', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Insights</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          {monthLabel} · {graphStatus === 'loading' && nodes.length === 0 ? 'Loading…' : `${totalConcepts} concept${totalConcepts === 1 ? '' : 's'}`}
        </p>
      </div>

      {dashStatus === 'error' && (
        <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 10, background: 'rgba(255,75,75,0.08)', border: '1px solid rgba(255,75,75,0.3)', marginBottom: 20 }}>
          <span style={{ fontSize: 13, color: 'var(--red)', flex: 1 }}>{dashError}</span>
          <button onClick={loadDashboard} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      )}

      {/* Overview cards — mobile: 2x2, desktop: 4-col */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 16, marginBottom: 24 }}>
        <OverviewCard Icon={Brain} label="Total Concepts" value={totalConcepts} color="var(--text)" isMobile={isMobile} />
        <OverviewCard Icon={CheckCircle} label="Healthy" value={healthy} color="var(--green)" isMobile={isMobile} />
        <OverviewCard Icon={AlertTriangle} label="Needs Review" value={review} color="var(--red)" isMobile={isMobile} />
        <OverviewCard Icon={BarChart} label="Avg Recall" value={avgRecall !== null ? `${avgRecall}%` : '—'} color="var(--blue)" isMobile={isMobile} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {(['overview', 'transfer', 'misconceptions'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: isMobile ? '6px 10px' : '8px 16px', border: 'none', background: 'none',
              cursor: 'pointer', fontSize: isMobile ? 11 : 13, fontFamily: 'inherit',
              color: activeTab === tab ? 'var(--text)' : 'var(--text-muted)',
              fontWeight: activeTab === tab ? 600 : 400,
              borderBottom: activeTab === tab ? '2px solid var(--green)' : '2px solid transparent',
              marginBottom: -1, textTransform: 'capitalize',
            }}
          >{tab}</button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '3fr 1.4fr', gap: 20 }}>
          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Panel title="Review Activity" isMobile={isMobile}>
              <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: '0 0 14px' }}>
                Attempts per day over the last 30 days. A continuous recall curve isn&apos;t stored, so this shows your review events instead.
              </p>
              {activityStatus === 'loading' ? <Muted>Loading…</Muted>
                : activityStatus === 'error' ? (
                  <PanelError message={activityError} onRetry={loadActivity} />
                ) : !activity || activity.recent.length === 0 ? (
                  <Muted>No review activity in the last 30 days. Start a review session to build this up.</Muted>
                ) : (
                  <ActivityChart recent={activity.recent} />
                )}
            </Panel>

            <Panel title="Structural Level Distribution" isMobile={isMobile}>
              {dashStatus === 'loading' ? <Muted>Loading…</Muted>
                : totalSolo === 0 ? <Muted>No SOLO levels assessed yet. Review concepts to build this up.</Muted>
                : soloRows.map(({ level, count, color }) => (
                  <div key={level} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                      <span style={{ color: 'var(--text-2)' }}>{level}</span>
                      <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{count} concept{count !== 1 ? 's' : ''}</span>
                    </div>
                    <div style={{ height: 8, background: 'var(--bg-input)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(count / totalSolo) * 100}%`, background: color, borderRadius: 4, transition: 'width 0.6s ease' }} />
                    </div>
                  </div>
                ))}
            </Panel>

            <Panel title="Absorption" isMobile={isMobile}>
              {dashStatus === 'loading' ? <Muted>Loading…</Muted>
                : !dash || dash.absorption.ingested === 0 ? <Muted>No concepts ingested from your notes yet.</Muted>
                : (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
                      <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--blue)', letterSpacing: '-0.02em' }}>
                        {dash.absorptionEfficiency !== null ? `${Math.round(dash.absorptionEfficiency * 100)}%` : '—'}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                        {dash.absorption.absorbed} of {dash.absorption.ingested} ingested concepts absorbed
                      </span>
                    </div>
                    <div style={{ height: 8, background: 'var(--bg-input)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(dash.absorption.absorbed / dash.absorption.ingested) * 100}%`, background: 'var(--blue)', borderRadius: 4, transition: 'width 0.6s ease' }} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>Absorbed = mastered or recall of 75% and above.</div>
                  </div>
                )}
            </Panel>
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Panel title="Recall Breakdown" isMobile={isMobile}>
              {[
                { label: 'Healthy', val: healthy, color: 'var(--green)' },
                { label: 'Weakening', val: weakening, color: 'var(--orange)' },
                { label: 'Needs Review', val: review, color: 'var(--red)' },
                { label: 'Not reviewed yet', val: unreviewed, color: 'var(--text-dim)' },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                    <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{label}</span>
                  </div>
                  <span style={{ fontSize: 16, fontWeight: 700, color }}>{val}</span>
                </div>
              ))}
            </Panel>

            <Panel title="Needs Attention" isMobile={isMobile}>
              {(() => {
                const list = nodes
                  .filter(n => n.recall !== null && n.recall < 60)
                  .sort((a, b) => (a.recall ?? 0) - (b.recall ?? 0))
                  .slice(0, 5);
                if (list.length === 0) return <Muted>Nothing needs attention right now.</Muted>;
                return list.map(n => {
                  const rs = recallStatus(n.recall);
                  return (
                    <button
                      key={n.id}
                      onClick={() => navigate('/retest', { state: { nodeId: n.id } })}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                        padding: '8px', borderRadius: 6, marginBottom: 4,
                        background: 'none', border: 'none', cursor: 'pointer',
                        textAlign: 'left', fontFamily: 'inherit', transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-input)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
                    >
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: rs.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: 'var(--text-2)', flex: 1 }}>{n.label}</span>
                      <span style={{ fontSize: 13, color: rs.color, fontWeight: 600 }}>{n.recall}%</span>
                    </button>
                  );
                });
              })()}
              <button
                onClick={() => navigate('/retest')}
                style={{
                  marginTop: 8, width: '100%', padding: '8px', borderRadius: 6,
                  background: 'var(--green)', color: '#fff', border: 'none',
                  cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                }}
              >Start Review Session</button>
            </Panel>

            <Panel title="Recent Capabilities" isMobile={isMobile}>
              {capabilitiesStatus === 'loading' ? <Muted>Loading…</Muted>
                : capabilitiesStatus === 'error' ? (
                  <PanelError message={capabilitiesError} onRetry={loadCapabilities} />
                ) : !capabilities || capabilities.length === 0 ? (
                  <Muted>No capability milestones logged yet. These appear as you pass transfer and perturbation probes.</Muted>
                ) : (
                  capabilities.slice(0, 6).map((ev, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', marginTop: 5, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                          {CAPABILITY_LABELS[ev.event_type] || ev.event_type}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ev.concept_label}{ev.at ? ` · ${fmtDate(ev.at)}` : ''}
                        </div>
                      </div>
                    </div>
                  ))
                )}
            </Panel>
          </div>
        </div>
      )}

      {activeTab === 'transfer' && (
        <div style={{ maxWidth: 860 }}>
          <Panel title="Transfer Evidence" isMobile={isMobile}>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>Concepts where you have demonstrated transfer: applying knowledge outside the original example.</p>
            {transferStatus === 'loading' ? <Muted>Loading…</Muted>
              : transferStatus === 'error' ? (
                <PanelError message={transferError} onRetry={loadTransfer} />
              ) : !transfer || transfer.length === 0 ? (
                <NotAvailable text="No transfer evidence yet. It will appear here once you pass transfer or analogy probes." />
              ) : (
                transfer.map((t, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <CheckCircle size={16} style={{ color: 'var(--green)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: 'var(--text-2)' }}>{t.concept_label}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                        {PROBE_LABELS[t.probe_type] || t.probe_type}{t.at ? ` · ${fmtDate(t.at)}` : ''}
                      </div>
                    </div>
                    {t.score !== null && (
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)', flexShrink: 0 }}>{Math.round(t.score * 100)}%</span>
                    )}
                  </div>
                ))
              )}
          </Panel>
        </div>
      )}

      {activeTab === 'misconceptions' && (
        <div style={{ maxWidth: 860 }}>
          <Panel title="Misconception Tracker" isMobile={isMobile}>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>Incorrect beliefs detected in your answers, grouped by pattern.</p>
            {misconceptionsStatus === 'loading' ? <Muted>Loading…</Muted>
              : misconceptionsStatus === 'error' ? (
                <PanelError message={misconceptionsError} onRetry={loadMisconceptions} />
              ) : !misconceptions || misconceptions.length === 0 ? (
                <NotAvailable text="No misconceptions detected yet. Nice work." />
              ) : (
                misconceptions.map((m, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <AlertTriangle size={16} style={{ color: 'var(--orange)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: 'var(--text-2)' }}>{m.tag}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                        {m.concept_label}{m.last_seen ? ` · last ${fmtDate(m.last_seen)}` : ''}
                      </div>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--orange)', flexShrink: 0 }}>×{m.count}</span>
                  </div>
                ))
              )}
          </Panel>
        </div>
      )}
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>{children}</div>;
}

function NotAvailable({ text }: { text: string }) {
  return (
    <div style={{ padding: '18px 0', textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
      <RefreshCw size={20} style={{ marginBottom: 8, opacity: 0.4 }} />
      <div>{text}</div>
    </div>
  );
}

function PanelError({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--red)' }}>
      <span style={{ flex: 1 }}>{message || 'Something went wrong.'}</span>
      <button
        onClick={onRetry}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}
      >
        <RefreshCw size={12} /> Retry
      </button>
    </div>
  );
}

function ActivityChart({ recent }: { recent: { date: string; attempts: number; passes: number }[] }) {
  const max = recent.reduce((m, r) => Math.max(m, r.attempts), 0) || 1;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}>
        {recent.map((r, i) => (
          <div
            key={i}
            title={`${fmtDate(r.date)}: ${r.attempts} attempt${r.attempts === 1 ? '' : 's'}, ${r.passes} passed`}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}
          >
            <div style={{ position: 'relative', height: `${(r.attempts / max) * 100}%`, background: 'var(--bg-input)', borderRadius: 4, minHeight: 3, overflow: 'hidden' }}>
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${r.attempts ? (r.passes / r.attempts) * 100 : 0}%`, background: 'var(--green)' }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12, fontSize: 11, color: 'var(--text-dim)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--green)' }} /> Passed
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--bg-input)' }} /> Attempts
        </span>
      </div>
    </div>
  );
}

function OverviewCard({ Icon, label, value, color, isMobile }: { Icon: React.FC<{ size?: number; strokeWidth?: number }>; label: string; value: string | number; color: string; isMobile: boolean }) {
  return (
    <div style={{
      padding: isMobile ? '14px 14px' : '20px 22px', borderRadius: 14, background: 'var(--bg-elevated)',
      border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 16,
    }}>
      <div style={{ width: isMobile ? 36 : 44, height: isMobile ? 36 : 44, borderRadius: 12, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ color, display: 'flex' }}><Icon size={isMobile ? 18 : 22} strokeWidth={1.5} /></span>
      </div>
      <div>
        <div style={{ fontSize: isMobile ? 20 : 26, fontWeight: 800, color, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: isMobile ? 11 : 12, color: 'var(--text-dim)', marginTop: 4 }}>{label}</div>
      </div>
    </div>
  );
}

function Panel({ title, children, isMobile }: { title: string; children: React.ReactNode; isMobile: boolean }) {
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
      borderRadius: 14, padding: isMobile ? '16px 16px' : '22px 24px',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  );
}
