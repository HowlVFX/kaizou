import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';

function useVW() {
  const [vw, setVw] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setVw(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return vw;
}
import { Brain, Sun, Moon, LogOut, ChevronRight, Check, X } from '../components/Icon';

const SECTIONS = ['Profile', 'Appearance', 'Learning', 'Account'] as const;
type Section = typeof SECTIONS[number];

// Profile stats (concepts, connections, recall, the Brain summary) only mean
// something once there's a small graph to describe, so they stay locked until
// the learner has this many notes fully ingested into concepts. Settings
// (name/email, theme, sign-out) are never gated. One knob, easy to retune.
const PROFILE_UNLOCK_NOTES = 3;

export default function ProfilePage() {
  const { user, theme, setTheme, logout, updateUser, learningPrefs, setLearningPrefs, nodes, edges, notes, isLoggedIn } = useApp();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<Section>('Profile');
  const [showSignOut, setShowSignOut] = useState(false);
  const [totalReviews, setTotalReviews] = useState<number | null>(null);

  const handleSignOut = () => {
    logout();
    navigate('/');
  };

  // Real review count from the analytics activity endpoint (logged-in only).
  useEffect(() => {
    if (!isLoggedIn) { setTotalReviews(null); return; }
    let cancelled = false;
    api<{ total_attempts?: number }>('/api/analytics/activity')
      .then(d => { if (!cancelled) setTotalReviews(Number(d?.total_attempts) || 0); })
      .catch(() => { if (!cancelled) setTotalReviews(null); });
    return () => { cancelled = true; };
  }, [isLoggedIn]);

  const reviewCount = nodes.filter(n => n.recall !== null && n.recall < 50).length;
  const vw = useVW();
  const isMobile = vw < 640;

  // Gate on notes that finished ingestion (became concepts), not drafts in flight.
  const ingestedNotes = notes.filter(n => n.status === 'completed').length;
  const statsUnlocked = ingestedNotes >= PROFILE_UNLOCK_NOTES;
  const notesRemaining = Math.max(0, PROFILE_UNLOCK_NOTES - ingestedNotes);

  const stats = [
    { label: 'Concepts', value: nodes.filter(n => !n.locked).length },
    { label: 'Connections', value: edges.length },
    { label: 'Notes', value: notes.length },
    { label: 'Reviews', value: totalReviews === null ? '—' : totalReviews },
  ];

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: isMobile ? '20px 16px' : '32px 36px' }}>
      <h1 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, margin: '0 0 20px', letterSpacing: '-0.02em', color: 'var(--text)' }}>Profile</h1>

      {/* Avatar + stats */}
      <div style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 16, padding: isMobile ? '16px' : '24px', marginBottom: 16,
      }}>
        {/* Top row: avatar + name/email */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: isMobile ? 16 : 20 }}>
          <div style={{
            width: isMobile ? 52 : 64, height: isMobile ? 52 : 64,
            borderRadius: '50%', background: 'var(--green)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: isMobile ? 20 : 26, fontWeight: 800, color: '#fff', flexShrink: 0,
          }}>
            {user.avatarInitial}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: isMobile ? 16 : 18, color: 'var(--text)', marginBottom: 2 }}>{user.name}</div>
            <div style={{ fontSize: isMobile ? 12 : 13, color: 'var(--text-muted)', marginBottom: isMobile ? 0 : 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
            {!isMobile && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Member since {user.memberSince}</div>}
          </div>
        </div>
        {isMobile && (
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 14, marginLeft: 2 }}>Member since {user.memberSince}</div>
        )}
        {/* Stats grid — unlocked once enough notes are ingested */}
        {statsUnlocked ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: isMobile ? 8 : 16 }}>
            {stats.map(({ label, value }) => (
              <div key={label} style={{
                textAlign: 'center',
                background: isMobile ? 'var(--bg-input)' : 'transparent',
                borderRadius: isMobile ? 10 : 0,
                padding: isMobile ? '10px 4px' : 0,
              }}>
                <div style={{ fontSize: isMobile ? 17 : 20, fontWeight: 700, color: 'var(--text)' }}>{value}</div>
                <div style={{ fontSize: isMobile ? 10 : 11, color: 'var(--text-dim)', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        ) : (
          <StatsLocked
            ingested={ingestedNotes}
            remaining={notesRemaining}
            target={PROFILE_UNLOCK_NOTES}
            onAddNote={() => navigate('/notes')}
            isMobile={isMobile}
          />
        )}
      </div>

      {/* Brain shortcut — hidden until stats unlock (there's nothing to summarise yet) */}
      {statsUnlocked && (
        <div
          onClick={() => navigate('/brain')}
          style={{
            background: 'linear-gradient(135deg, rgba(88,204,2,0.12), rgba(28,176,246,0.08))',
            border: '1px solid var(--green)',
            borderRadius: 12, padding: isMobile ? '12px 16px' : '16px 20px', marginBottom: 16,
            display: 'flex', alignItems: 'center', gap: 14,
            cursor: 'pointer', transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.85'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
        >
          <span style={{ color: 'var(--green)', display: 'flex' }}><Brain size={isMobile ? 22 : 26} strokeWidth={1.4} /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: isMobile ? 14 : 15, color: 'var(--text)', marginBottom: 2 }}>Your Brain</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {nodes.filter(n => !n.locked).length} concepts · {reviewCount} need review
            </div>
          </div>
          <span style={{ color: 'var(--green)', display: 'flex' }}><ChevronRight size={18} /></span>
        </div>
      )}

      {/* Section nav */}
      <div style={{ display: 'flex', gap: isMobile ? 0 : 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0, overflowX: 'auto' }}>
        {SECTIONS.map(s => (
          <button
            key={s}
            onClick={() => setActiveSection(s)}
            style={{
              padding: isMobile ? '8px 14px' : '8px 16px', border: 'none', background: 'none',
              cursor: 'pointer', fontSize: isMobile ? 12 : 13, fontFamily: 'inherit',
              color: activeSection === s ? 'var(--text)' : 'var(--text-muted)',
              fontWeight: activeSection === s ? 600 : 400,
              borderBottom: activeSection === s ? '2px solid var(--green)' : '2px solid transparent',
              marginBottom: -1, transition: 'color 0.15s', whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >{s}</button>
        ))}
      </div>

      {activeSection === 'Profile' && (
        <ProfileSection user={user} onUpdate={updateUser} isMobile={isMobile} />
      )}

      {activeSection === 'Appearance' && (
        <AppearanceSection theme={theme} setTheme={setTheme} />
      )}

      {activeSection === 'Learning' && (
        <LearningSection prefs={learningPrefs} setPrefs={setLearningPrefs} />
      )}

      {activeSection === 'Account' && (
        <AccountSection onSignOut={() => setShowSignOut(true)} />
      )}

      {showSignOut && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
          }}
          onClick={() => setShowSignOut(false)}
        >
          <div
            style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 16, padding: 32, maxWidth: 360, width: '90%',
              animation: 'fadeUp 0.2s ease',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--red)', marginBottom: 12 }}>
              <LogOut size={28} strokeWidth={1.4} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text)', marginBottom: 8, textAlign: 'center' }}>Sign out?</div>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 24px', lineHeight: 1.6, textAlign: 'center' }}>
              Your Brain and all progress are saved. You can sign back in anytime.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowSignOut(false)}
                style={{
                  flex: 1, padding: '10px', borderRadius: 8,
                  background: 'var(--bg-input)', border: '1px solid var(--border)',
                  color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14,
                }}
              >Cancel</button>
              <button
                onClick={handleSignOut}
                style={{
                  flex: 1, padding: '10px', borderRadius: 8,
                  background: 'var(--red)', border: 'none',
                  color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
                }}
              >Sign Out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Locked stats: shown until enough notes are ingested ── */
function StatsLocked({ ingested, remaining, target, onAddNote, isMobile }: {
  ingested: number; remaining: number; target: number; onAddNote: () => void; isMobile?: boolean;
}) {
  const pct = Math.min(100, Math.round((ingested / target) * 100));
  return (
    <div style={{
      background: 'var(--bg-input)', borderRadius: 12,
      padding: isMobile ? '18px 16px' : '22px 20px', textAlign: 'center',
    }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12, color: 'var(--text-dim)' }}>
        <Brain size={isMobile ? 26 : 30} strokeWidth={1.4} />
      </div>
      <div style={{ fontSize: isMobile ? 15 : 16, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
        {remaining === 1
          ? "Add 1 more note to unlock your profile stats"
          : `Add ${remaining} more notes to unlock your profile stats`}
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px', lineHeight: 1.6, maxWidth: 420, marginInline: 'auto' }}>
        Your concept count, connections and recall appear once Kaizou has turned
        a few notes into concepts. You have {ingested} of {target} so far.
      </p>

      {/* Progress bar */}
      <div style={{ maxWidth: 320, margin: '0 auto 16px' }}>
        <div style={{ height: 8, background: 'var(--bg-elevated)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, var(--green), var(--blue))', borderRadius: 4, transition: 'width 0.4s ease' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 8 }}>
          {Array.from({ length: target }).map((_, i) => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: '50%',
              background: i < ingested ? 'var(--green)' : 'var(--bg-elevated)',
              border: `1.5px solid ${i < ingested ? 'var(--green)' : 'var(--border-strong)'}`,
            }} />
          ))}
        </div>
      </div>

      <button
        onClick={onAddNote}
        style={{
          padding: '10px 20px', borderRadius: 10, background: 'var(--green)', border: 'none',
          color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 8,
        }}
      >
        Write a note <ChevronRight size={16} />
      </button>
    </div>
  );
}

/* ── Profile section with inline editing ── */
function ProfileSection({ user, onUpdate, isMobile }: { user: { name: string; email: string; memberSince: string }; onUpdate: (f: Partial<{ name: string; email: string }>) => Promise<void>; isMobile?: boolean }) {
  const [editing, setEditing] = useState<'name' | 'email' | null>(null);
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState<string | null>(null);

  const startEdit = (field: 'name' | 'email') => {
    setEditing(field);
    setDraft(field === 'name' ? user.name : user.email);
  };

  const [saveError, setSaveError] = useState<string | null>(null);

  const save = async () => {
    if (!editing || !draft.trim()) return;
    const field = editing;
    setSaveError(null);
    setEditing(null);
    try {
      await onUpdate({ [field]: draft.trim() });
      setSaved(field);
      setTimeout(() => setSaved(null), 1800);
    } catch (err) {
      setSaveError((err as Error)?.message || 'Could not save your changes.');
    }
  };

  const cancel = () => { setEditing(null); setDraft(''); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {saveError && (
        <div role="alert" style={{ fontSize: 13, color: 'var(--red)', padding: '10px 0' }}>{saveError}</div>
      )}
      {(['name', 'email'] as const).map(field => (
        <div
          key={field}
          style={{
            display: 'flex', flexDirection: isMobile ? 'column' : 'row',
            alignItems: isMobile ? 'flex-start' : 'center',
            gap: isMobile ? 6 : 16, padding: '14px 0',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ width: isMobile ? 'auto' : 140, fontSize: 12, color: 'var(--text-muted)', flexShrink: 0, textTransform: 'capitalize', fontWeight: isMobile ? 600 : 400 }}>{field}</div>
          {editing === field ? (
            <div style={{ flex: 1, display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
              <input
                autoFocus
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
                style={{
                  flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border-strong)',
                  borderRadius: 7, padding: '9px 11px', color: 'var(--text)',
                  fontSize: 14, fontFamily: 'inherit', outline: 'none',
                }}
              />
              <button onClick={save} style={{ background: 'var(--green)', border: 'none', borderRadius: 6, padding: '9px 14px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Save</button>
              <button onClick={cancel} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={15} /></button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, width: '100%' }}>
              <span style={{ flex: 1, fontSize: 14, color: 'var(--text)', wordBreak: 'break-all' }}>
                {field === 'name' ? user.name : user.email}
              </span>
              {saved === field
                ? <span style={{ fontSize: 12, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 4, animation: 'fadeIn 0.2s ease', flexShrink: 0 }}><Check size={13} strokeWidth={2.5} /> Saved</span>
                : <button onClick={() => startEdit(field)} style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', flexShrink: 0 }}>Edit</button>
              }
            </div>
          )}
        </div>
      ))}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? 6 : 16, padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
        <div style={{ width: isMobile ? 'auto' : 140, fontSize: 12, color: 'var(--text-muted)', flexShrink: 0, fontWeight: isMobile ? 600 : 400 }}>Member Since</div>
        <span style={{ flex: 1, fontSize: 14, color: 'var(--text)', opacity: 0.5 }}>{user.memberSince}</span>
      </div>
    </div>
  );
}

/* ── Appearance section ── */
function AppearanceSection({ theme, setTheme }: { theme: 'dark' | 'light'; setTheme: (t: 'dark' | 'light') => void }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>Choose your interface theme.</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxWidth: 400 }}>
        {(['dark', 'light'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTheme(t)}
            style={{
              padding: '20px 16px', borderRadius: 14, textAlign: 'center',
              background: t === 'dark' ? '#111827' : '#F3F4F6',
              border: theme === t ? '2px solid var(--green)' : '1px solid var(--border)',
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
              position: 'relative',
            }}
          >
            <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center', color: t === 'dark' ? '#9CA3AF' : '#F59E0B' }}>
              {t === 'dark' ? <Moon size={24} strokeWidth={1.5} /> : <Sun size={24} strokeWidth={1.5} />}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: t === 'dark' ? '#F9FAFB' : '#111827' }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </div>
            {theme === t && (
              <div style={{
                position: 'absolute', top: 8, right: 8,
                width: 18, height: 18, borderRadius: '50%', background: 'var(--green)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Check size={11} strokeWidth={2.5} stroke="#fff" />
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Learning section ── */
type LPrefs = { dailyGoal: number; reviewMode: 'Abstract' | 'Understand'; decaySensitivity: 'Low' | 'Standard' | 'High'; soloNotifications: boolean };

function LearningSection({ prefs, setPrefs }: { prefs: LPrefs; setPrefs: (p: Partial<LPrefs>) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Daily goal */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontSize: 14, color: 'var(--text-2)', fontWeight: 500 }}>Daily review goal</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>Concepts to review each day</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setPrefs({ dailyGoal: Math.max(1, prefs.dailyGoal - 5) })}
            style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >−</button>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', minWidth: 32, textAlign: 'center' }}>{prefs.dailyGoal}</span>
          <button
            onClick={() => setPrefs({ dailyGoal: Math.min(50, prefs.dailyGoal + 5) })}
            style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >+</button>
        </div>
      </div>

      {/* Review mode */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontSize: 14, color: 'var(--text-2)', fontWeight: 500 }}>Default review mode</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>How you prefer to be tested</div>
        </div>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-input)', borderRadius: 8, padding: 3 }}>
          {(['Understand', 'Abstract'] as const).map(m => (
            <button
              key={m}
              onClick={() => setPrefs({ reviewMode: m })}
              style={{
                padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 500, fontFamily: 'inherit',
                background: prefs.reviewMode === m ? 'var(--bg-elevated)' : 'transparent',
                color: prefs.reviewMode === m ? 'var(--text)' : 'var(--text-muted)',
                boxShadow: prefs.reviewMode === m ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
                transition: 'all 0.15s',
              }}
            >{m}</button>
          ))}
        </div>
      </div>

      {/* Decay sensitivity */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontSize: 14, color: 'var(--text-2)', fontWeight: 500 }}>Decay sensitivity</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>How fast recall fades without review</div>
        </div>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-input)', borderRadius: 8, padding: 3 }}>
          {(['Low', 'Standard', 'High'] as const).map(d => (
            <button
              key={d}
              onClick={() => setPrefs({ decaySensitivity: d })}
              style={{
                padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 500, fontFamily: 'inherit',
                background: prefs.decaySensitivity === d ? 'var(--bg-elevated)' : 'transparent',
                color: prefs.decaySensitivity === d ? 'var(--text)' : 'var(--text-muted)',
                boxShadow: prefs.decaySensitivity === d ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
                transition: 'all 0.15s',
              }}
            >{d}</button>
          ))}
        </div>
      </div>

      {/* SOLO notifications */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontSize: 14, color: 'var(--text-2)', fontWeight: 500 }}>SOLO notifications</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>Alerts when taxonomy level changes</div>
        </div>
        <Toggle checked={prefs.soloNotifications} onChange={v => setPrefs({ soloNotifications: v })} />
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
        background: checked ? 'var(--green)' : 'var(--bg-input)',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 3, left: checked ? 23 : 3,
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  );
}

/* ── Account section ── */
function AccountSection({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 12 }}>Data</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <ActionButton label="Export Brain" description="Download your knowledge graph as JSON" onClick={() => {
            const data = JSON.stringify({ exportedAt: new Date().toISOString(), source: 'KNODES' }, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'knodes-brain.json'; a.click();
            URL.revokeObjectURL(url);
          }} />
          <ActionButton label="Reset Progress" description="Clear all recall scores" onClick={() => alert('Reset would clear all recall scores. (Demo — no permanent effect)')} variant="warn" />
        </div>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--red)', marginBottom: 12 }}>Danger zone</div>
        <button
          onClick={onSignOut}
          style={{
            padding: '10px 20px', borderRadius: 8, background: 'rgba(255,75,75,0.1)',
            border: '1px solid var(--red)', color: 'var(--red)',
            cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,75,75,0.18)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,75,75,0.1)'}
        >
          <LogOut size={14} /> Sign Out
        </button>
      </div>
    </div>
  );
}

function ActionButton({ label, description, onClick, variant }: { label: string; description: string; onClick: () => void; variant?: 'warn' }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '14px 16px', borderRadius: 10, textAlign: 'left',
        background: 'var(--bg-elevated)', border: `1px solid ${variant === 'warn' ? 'rgba(255,150,0,0.3)' : 'var(--border)'}`,
        cursor: 'pointer', fontFamily: 'inherit', transition: 'border-color 0.15s',
        flex: 1,
      }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = variant === 'warn' ? 'var(--orange)' : 'var(--border-strong)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = variant === 'warn' ? 'rgba(255,150,0,0.3)' : 'var(--border)'}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: variant === 'warn' ? 'var(--orange)' : 'var(--text-2)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>{description}</div>
    </button>
  );
}
