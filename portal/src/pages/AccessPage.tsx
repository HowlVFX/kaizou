import React, { useCallback, useEffect, useState } from 'react';
import { adminApi, isOwner } from '../api/client';
import type { AllowlistEntry, AdminAccount } from '../api/types';
import { PageTitle, SectionTitle, Loading, ErrorMessage } from '../components/PageState';
import { DataTable } from '../components/DataTable';

// Access control: manage who may access this portal (allowlist — any admin) and, for
// owners only, manage moderator admin accounts. Owners are protected server-side.
export const AccessPage: React.FC = () => {
  const owner = isOwner();

  const [allowlist, setAllowlist] = useState<AllowlistEntry[] | null>(null);
  const [admins, setAdmins] = useState<AdminAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteNote, setInviteNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [modEmail, setModEmail] = useState('');
  const [modPassword, setModPassword] = useState('');
  const [modName, setModName] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await adminApi.listAllowlist() as AllowlistEntry[];
      setAllowlist(list);
      if (owner) setAdmins(await adminApi.listAdmins() as AdminAccount[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load access data.');
    } finally {
      setLoading(false);
    }
  }, [owner]);

  useEffect(() => { refresh(); }, [refresh]);

  const addInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !inviteEmail.trim()) return;
    setBusy(true); setMsg(null); setError(null);
    try {
      await adminApi.addAllowlist(inviteEmail.trim(), inviteNote.trim() || undefined);
      setInviteEmail(''); setInviteNote('');
      setMsg('Email added to the management allowlist.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that email.');
    } finally { setBusy(false); }
  };

  const removeInvite = async (id: string) => {
    setError(null);
    try { await adminApi.removeAllowlist(id); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not remove.'); }
  };

  const addModerator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !modEmail.trim() || modPassword.length < 8) return;
    setBusy(true); setMsg(null); setError(null);
    try {
      await adminApi.createModerator(modEmail.trim(), modPassword, modName.trim() || undefined);
      setModEmail(''); setModPassword(''); setModName('');
      setMsg('Moderator created.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create moderator.');
    } finally { setBusy(false); }
  };

  const removeAdmin = async (id: string) => {
    setError(null);
    try { await adminApi.removeAdmin(id); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not remove admin.'); }
  };

  if (loading) return <Loading />;

  return (
    <div>
      <PageTitle>Access Control</PageTitle>
      {error && <ErrorMessage message={error} />}
      {msg && <div role="status" style={{ color: '#58CC02', marginBottom: '1rem' }}>{msg}</div>}

      <SectionTitle>Management access allowlist</SectionTitle>
      <p style={{ color: '#a0a0a0', fontSize: '0.85rem', marginBottom: '1rem' }}>
        Only emails on this list can sign up for or log in to this management portal (owners are exempt).
        Removing an email revokes that moderator&apos;s portal access. Learner accounts are open to any email.
      </p>
      <form onSubmit={addInvite} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input type="email" placeholder="email to allow" value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)} required style={fieldStyle} />
        <input type="text" placeholder="note (optional)" value={inviteNote}
          onChange={(e) => setInviteNote(e.target.value)} style={fieldStyle} />
        <button type="submit" disabled={busy} style={btnStyle}>Add</button>
      </form>
      <DataTable
        headers={['Email', 'Note', 'Added by', 'Signed up?', '']}
        rows={(allowlist || []).map((r) => [
          r.email,
          r.note || '—',
          r.added_by_email || '—',
          r.used_at ? 'yes' : 'no',
          <button key={r.id} onClick={() => removeInvite(r.id)} style={linkBtn}>remove</button>,
        ])}
        emptyMessage="No emails invited yet."
      />

      {owner && (
        <>
          <SectionTitle>Admins</SectionTitle>
          <p style={{ color: '#a0a0a0', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Owner-only. New admins are always moderators. Owners are protected and cannot be created or removed here.
          </p>
          <form onSubmit={addModerator} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <input type="email" placeholder="moderator email" value={modEmail}
              onChange={(e) => setModEmail(e.target.value)} required style={fieldStyle} />
            <input type="text" placeholder="name (optional)" value={modName}
              onChange={(e) => setModName(e.target.value)} style={fieldStyle} />
            <input type="password" placeholder="password (>=8)" value={modPassword}
              onChange={(e) => setModPassword(e.target.value)} required style={fieldStyle} />
            <button type="submit" disabled={busy} style={btnStyle}>Create moderator</button>
          </form>
          <DataTable
            headers={['Email', 'Name', 'Role', 'Last login', '']}
            rows={(admins || []).map((a) => [
              a.email,
              a.name || '—',
              a.admin_role,
              a.last_login_at ? new Date(a.last_login_at).toLocaleString() : '—',
              a.admin_role === 'owner'
                ? <span key={a.id} style={{ color: '#808080' }}>protected</span>
                : <button key={a.id} onClick={() => removeAdmin(a.id)} style={linkBtn}>remove</button>,
            ])}
            emptyMessage="No admins."
          />
        </>
      )}
    </div>
  );
};

const fieldStyle: React.CSSProperties = {
  padding: '0.5rem 0.65rem', borderRadius: '8px', border: '1px solid #0f3460',
  background: '#1a1a2e', color: '#e0e0e0', fontSize: '0.85rem', minWidth: '180px',
};
const btnStyle: React.CSSProperties = {
  padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', background: '#533483',
  color: '#fff', fontWeight: 'bold', cursor: 'pointer',
};
const linkBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: '#e06060', cursor: 'pointer', fontSize: '0.85rem',
};
