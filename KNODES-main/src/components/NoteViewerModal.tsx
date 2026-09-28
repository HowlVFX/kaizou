import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, describeApiError } from '../lib/api';

// "View original note": the note(s) behind a node, read-only. When a note has
// been updated since it was first written, its original version is shown too.

interface ConceptNote {
  id: string;
  title: string;
  body: string;
  note_type: string;
  created_at: string;
  updated_at: string;
  revisions: number;
  original: { title: string; body: string; written_at: string | null } | null;
}

interface Props {
  conceptId: string;
  label: string;
  onClose: () => void;
  onOpenInNotes: () => void;
}

export default function NoteViewerModal({ conceptId, label, onClose, onOpenInNotes }: Props) {
  const [notes, setNotes] = useState<ConceptNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  useEffect(() => {
    api<ConceptNote[]>(`/api/concepts/${conceptId}/notes`)
      .then(setNotes)
      .catch(err => setError(describeApiError(err, 'Could not load the note.')));
  }, [conceptId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const fmt = (d: string | null | undefined) => (d ? new Date(d).toLocaleString() : '');

  // Rendered through a portal to <body>: the ConceptExplorer panel that mounts
  // this modal has a CSS transform, which would otherwise make position:fixed
  // anchor to the 420px panel instead of the viewport (modal trapped/clipped).
  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 400 }} />
      <div role="dialog" aria-modal="true" aria-label={`Note for ${label}`} style={{
        position: 'fixed', top: '8vh', left: '50%', transform: 'translateX(-50%)',
        width: 'min(680px, 92vw)', maxHeight: '84vh', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 14,
        boxShadow: 'var(--shadow)', zIndex: 401,
      }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>Your note</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
          </div>
          <button onClick={onOpenInNotes} style={{
            padding: '5px 12px', borderRadius: 7, background: 'var(--bg-input)', border: '1px solid var(--border)',
            color: 'var(--text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>Open in Notes</button>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '14px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && <div role="alert" style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>}
          {!error && !notes && <div role="status" style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>}
          {notes && notes.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>This node has no note of its own yet.</div>
          )}
          {notes?.map(n => {
            const orig = showOriginal && n.original;
            return (
              <article key={n.id}>
                {n.original && (
                  <div role="tablist" aria-label="Version" style={{ display: 'flex', gap: 3, background: 'var(--bg-input)', padding: 3, borderRadius: 8, marginBottom: 10, width: 'fit-content' }}>
                    {[['Original', true], [`Current (updated ${n.revisions}×)`, false]].map(([lbl, isOrig]) => (
                      <button key={String(lbl)} role="tab" aria-selected={showOriginal === isOrig}
                        onClick={() => setShowOriginal(Boolean(isOrig))}
                        style={{
                          padding: '4px 10px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                          background: showOriginal === isOrig ? 'var(--bg-elevated)' : 'transparent',
                          color: showOriginal === isOrig ? 'var(--text)' : 'var(--text-dim)',
                        }}>{lbl}</button>
                    ))}
                  </div>
                )}
                <h3 style={{ margin: '0 0 4px', fontSize: 15, color: 'var(--text)' }}>{orig ? orig.title : n.title}</h3>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 10 }}>
                  {orig ? `Written ${fmt(orig.written_at || n.created_at)}` : `Last saved ${fmt(n.updated_at)}`}
                </div>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.75, color: 'var(--text-2)' }}>
                  {orig ? orig.body : n.body}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </>,
    document.body,
  );
}
