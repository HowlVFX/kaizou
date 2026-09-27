import { useState, useRef, useEffect, useCallback } from 'react';

function useVW() {
  const [vw, setVw] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setVw(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return vw;
}
import { useApp } from '../context/AppContext';
import type { Note } from '../types';
import { api, describeApiError } from '../lib/api';
import { FileText, Network, Link, Puzzle, Brain, RefreshCw, Check, X as XIcon, Search, AlertTriangle } from '../components/Icon';

// Cap appended source text so a huge page can't blow up the note body.
const MAX_SOURCE_CHARS = 20000;

/** Append extracted source text to a note body under a labelled heading. */
function appendSource(body: string, label: string, text: string): string {
  const clean = text.trim().slice(0, MAX_SOURCE_CHARS);
  const base = body.trimEnd();
  return `${base}${base ? '\n\n' : ''}## Source: ${label}\n\n${clean}\n`;
}

// ── Pipeline steps (learner-friendly labels) ─────────────────────
const PIPELINE_STEPS = [
  { id: 1, label: 'Reading your note', Icon: FileText },
  { id: 2, label: 'Finding concepts', Icon: Puzzle },
  { id: 3, label: 'Structuring key statements', Icon: Check },
  { id: 4, label: 'Mapping prerequisites', Icon: Link },
  { id: 5, label: 'Connecting knowledge', Icon: Network },
  { id: 6, label: 'Updating your Brain', Icon: Brain },
];


const NEW_NOTE_TEMPLATE = `Write what you know...

Explain concepts, mechanisms, examples, relationships, and anything you want your Brain to remember.
`;

function wordCount(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

// ── Source types ──────────────────────────────────────────────────
type SourceType = 'file' | 'link' | 'paste';
interface Source {
  id: string;
  type: SourceType;
  title: string;
  meta: string;
  status: 'attached' | 'reading' | 'extracted' | 'unavailable' | 'failed';
}

function sourceIcon(type: SourceType) {
  if (type === 'file') return '📄';
  if (type === 'link') return '🌐';
  return '📝';
}

function sourceStatusColor(status: Source['status']) {
  if (status === 'extracted') return 'var(--green)';
  if (status === 'reading') return 'var(--blue)';
  if (status === 'unavailable' || status === 'failed') return 'var(--red)';
  return 'var(--text-dim)';
}

function sourceStatusLabel(status: Source['status']) {
  const map: Record<Source['status'], string> = { attached: '○ Attached', reading: '● Reading', extracted: '✓ Extracted', unavailable: '△ Unavailable', failed: '! Failed' };
  return map[status];
}

type FilterTab = 'all' | 'attention' | 'processing' | 'completed';

// ── Main page ────────────────────────────────────────────────────
export default function NotesPage() {
  const { notes, addNote, updateNoteStatus, updateNoteTitle, updateNoteBody, deleteNote } = useApp();
  const vw = useVW();
  const isMobile = vw < 640;
  const isTablet = vw >= 640 && vw < 1024;
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(notes[0]?.id ?? null);
  const [isNewNote, setIsNewNote] = useState(false);
  const [newTitle, setNewTitle] = useState('Untitled Note');
  const [newBody, setNewBody] = useState(NEW_NOTE_TEMPLATE);
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');

  // Source state
  const [sources, setSources] = useState<Record<string, Source[]>>(() => {
    const init: Record<string, Source[]> = {};
    // No sources endpoint yet: sources are local-only attachments for this session.
    return init;
  });
  const [sourcesExpanded, setSourcesExpanded] = useState(true);
  const [showSourceChooser, setShowSourceChooser] = useState(false);
  const [addingLink, setAddingLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState('');
  const [pastingText, setPastingText] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [sourceBusy, setSourceBusy] = useState(false); // fetching a web link
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Mobile results sheet
  const [showMobileResults, setShowMobileResults] = useState(false);

  // Pipeline state. pipelineStep is a visual cue only; pipelineDone/failed are
  // derived from the note's real backend status (see below), never from a timer.
  const [processingNoteId, setProcessingNoteId] = useState<string | null>(null);
  const [pipelineStep, setPipelineStep] = useState(0);
  const stepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dirty tracking
  const [extractedBodies, setExtractedBodies] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    notes.forEach(n => { if (n.status === 'completed') init[n.id] = n.body; });
    return init;
  });

  const selectedNote = isNewNote ? null : notes.find(n => n.id === selectedNoteId);
  // The note we kicked off ingestion for, tracked by its real backend status
  // (AppContext polls PENDING -> READY/FAILED). The stepper reflects that, not a timer.
  const processingNote = processingNoteId ? notes.find(n => n.id === processingNoteId) : null;
  const processingFailed = processingNote?.status === 'failed';
  // "Done" means the backend actually finished, not that the animation ran out.
  const pipelineDone = processingNote?.status === 'completed';
  const isProcessing = processingNoteId !== null && !pipelineDone && !processingFailed;

  const isDirty = selectedNote
    ? selectedNote.body !== (extractedBodies[selectedNote.id] ?? selectedNote.body)
    : false;

  const canProcess = isNewNote
    ? newBody.trim().length > 20
    : (selectedNote?.status === 'completed' || selectedNote?.status === 'draft' || selectedNote?.status === 'failed') && isDirty;

  // Filter + search
  const filteredNotes = notes.filter(n => {
    const matchSearch = search.trim() === '' ||
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      (n.concepts ?? []).some(c => c.toLowerCase().includes(search.toLowerCase()));
    if (!matchSearch) return false;
    if (filterTab === 'attention') return n.status === 'failed' || n.status === 'partial';
    if (filterTab === 'processing') return n.status === 'processing';
    if (filterTab === 'completed') return n.status === 'completed';
    return true;
  });

  const currentSources = selectedNote ? (sources[selectedNote.id] ?? []) : [];

  // Advance the visual stepper while the backend works. It walks up to the
  // SECOND-TO-LAST step and then waits: the final "Updating your Brain" step
  // and the results only land when the note's real status becomes 'completed'
  // (an effect below finalises it). If ingestion fails, the failure UI shows.
  const runPipeline = useCallback((noteId: string) => {
    if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
    setProcessingNoteId(noteId);
    setPipelineStep(0);
    updateNoteStatus(noteId, 'processing');

    const HOLD_AT = PIPELINE_STEPS.length - 1; // don't claim "done" on a timer
    let step = 0;
    const advance = () => {
      step += 1;
      setPipelineStep(step);
      if (step < HOLD_AT) {
        stepTimerRef.current = setTimeout(advance, 800 + Math.random() * 400);
      }
    };
    stepTimerRef.current = setTimeout(advance, 600);
  }, [updateNoteStatus]);

  // Finalise the stepper from the note's REAL status. When ingestion actually
  // completes, fill the last step; when it fails, stop the animation.
  useEffect(() => {
    if (!processingNote) return;
    if (processingNote.status === 'completed') {
      if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
      setPipelineStep(PIPELINE_STEPS.length);
    } else if (processingNote.status === 'failed') {
      if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
    }
  }, [processingNote?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clean up the stepper timer on unmount.
  useEffect(() => () => { if (stepTimerRef.current) clearTimeout(stepTimerRef.current); }, []);

  const handleProcessNew = () => {
    if (isProcessing) return;
    // Backend requires a UUID primary key; timestamp ids get rejected on later PUTs.
    const id = crypto.randomUUID();
    const note: Note = { id, title: newTitle, body: newBody, status: 'processing', updatedAt: 'Just now' };
    addNote(note);
    setSelectedNoteId(id);
    setIsNewNote(false);
    setExtractedBodies(prev => ({ ...prev, [id]: newBody }));
    runPipeline(id);
  };

  const handleReExtract = () => {
    if (!selectedNote || isProcessing) return;
    setExtractedBodies(prev => ({ ...prev, [selectedNote.id]: selectedNote.body }));
    runPipeline(selectedNote.id);
  };

  const handleNewNote = () => {
    setIsNewNote(true);
    setSelectedNoteId(null);
    setNewTitle('Untitled Note');
    setNewBody(NEW_NOTE_TEMPLATE);
    if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
    setProcessingNoteId(null);
    setShowSourceChooser(false);
    setAddingLink(false);
    setLinkUrl('');
  };

  const handleSelectNote = (id: string) => {
    setSelectedNoteId(id);
    setIsNewNote(false);
    if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
    setProcessingNoteId(null);
    setShowSourceChooser(false);
    setAddingLink(false);
    setLinkUrl('');
  };

  // Append extracted source text into the current note body (new or existing).
  // The appended text becomes part of the note and is ingested normally.
  const applyToBody = (label: string, text: string): boolean => {
    if (!text.trim()) return false;
    if (isNewNote) {
      setNewBody(prev => appendSource(prev, label, text));
    } else if (selectedNote) {
      updateNoteBody(selectedNote.id, appendSource(selectedNote.body, label, text));
    } else {
      return false;
    }
    return true;
  };

  const recordSource = (source: Source) => {
    const noteId = selectedNote?.id ?? 'new';
    setSources(prev => ({ ...prev, [noteId]: [...(prev[noteId] ?? []), source] }));
  };

  const closeSourceUi = () => {
    setShowSourceChooser(false);
    setAddingLink(false);
    setPastingText(false);
    setLinkUrl('');
    setLinkError('');
    setPasteText('');
  };

  // Web link: server fetches + extracts the page text (SSRF-safe), we append it.
  const handleAddLink = async () => {
    const raw = linkUrl.trim();
    if (!raw || sourceBusy) return;
    const url = raw.startsWith('http') ? raw : 'https://' + raw;
    try {
      new URL(url);
    } catch {
      setLinkError("That doesn't look like a valid web address.");
      return;
    }
    setLinkError('');
    setSourceBusy(true);
    try {
      const res = await api<{ url: string; title?: string; text: string; truncated?: boolean }>(
        '/api/notes/fetch-source', { method: 'POST', body: { url } },
      );
      const domain = (res.title || url.replace(/^https?:\/\//, '').split('/')[0]);
      if (!applyToBody(domain, res.text)) {
        setLinkError('Open or create a note first.');
        return;
      }
      recordSource({ id: crypto.randomUUID(), type: 'link', title: domain, meta: res.truncated ? `${domain} · truncated` : domain, status: 'extracted' });
      closeSourceUi();
    } catch (err) {
      setLinkError(describeApiError(err, 'Could not fetch that link.'));
    } finally {
      setSourceBusy(false);
    }
  };

  // Paste text: append the pasted content directly.
  const handlePasteConfirm = () => {
    const text = pasteText.trim();
    if (!text) return;
    if (!applyToBody('Pasted text', text)) return;
    recordSource({ id: crypto.randomUUID(), type: 'paste', title: 'Pasted text', meta: `${wordCount(text)} words`, status: 'extracted' });
    closeSourceUi();
  };

  // File upload: read a plain-text / markdown file client-side and append.
  const handleFilePicked = async (file: File | undefined) => {
    if (!file) return;
    const isText = /\.(txt|md|markdown|text)$/i.test(file.name) || file.type.startsWith('text/');
    if (!isText) {
      setLinkError('Only .txt or .md files can be read right now.');
      setShowSourceChooser(true);
      return;
    }
    try {
      const text = await file.text();
      if (!applyToBody(file.name, text)) return;
      recordSource({ id: crypto.randomUUID(), type: 'file', title: file.name, meta: `${wordCount(text)} words`, status: 'extracted' });
      closeSourceUi();
    } catch {
      setLinkError('Could not read that file.');
      setShowSourceChooser(true);
    }
  };

  const handleRemoveSource = (sourceId: string) => {
    const noteId = selectedNote?.id ?? 'new';
    setSources(prev => ({ ...prev, [noteId]: (prev[noteId] ?? []).filter(s => s.id !== sourceId) }));
  };

  useEffect(() => {
    if (selectedNote && selectedNote.status === 'completed' && !(selectedNote.id in extractedBodies)) {
      setExtractedBodies(prev => ({ ...prev, [selectedNote.id]: selectedNote.body }));
    }
  }, [selectedNote?.id]);

  const currentBody = isNewNote ? newBody : (selectedNote?.body ?? '');
  const currentTitle = isNewNote ? newTitle : (selectedNote?.title ?? '');
  const wc = wordCount(currentBody);

  // Show the extraction panel while processing, when done, when a failure needs
  // reporting, or when viewing an already-completed note.
  const showExtractionPanel = isProcessing || pipelineDone || processingFailed || selectedNote?.status === 'completed';

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>

      {/* Mobile sidebar overlay */}
      {isMobile && mobileSidebarOpen && (
        <div
          onClick={() => setMobileSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }}
        />
      )}

      {/* ── Sidebar ──────────────────────────────────── */}
      <div style={{
        width: isMobile ? 280 : isTablet ? 220 : 252,
        flexShrink: 0, borderRight: '1px solid var(--border)',
        background: 'var(--bg-elevated)', display: 'flex', flexDirection: 'column',
        ...(isMobile ? {
          position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 201,
          transform: mobileSidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s cubic-bezier(0.16,1,0.3,1)',
        } : {}),
      }}>
        {/* Header */}
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <button
            onClick={handleNewNote}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 8,
              background: 'var(--green)', color: '#fff', border: 'none',
              cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              marginBottom: 10,
            }}
          >+ New Note</button>

          {/* Search */}
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', display: 'flex', pointerEvents: 'none' }}>
              <Search size={13} />
            </span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search notes..."
              style={{
                width: '100%', padding: '7px 10px 7px 30px', borderRadius: 7,
                background: 'var(--bg-input)', border: '1px solid var(--border)',
                color: 'var(--text)', fontSize: 12, fontFamily: 'inherit', outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)'}
              onBlur={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', display: 'flex', padding: 0 }}
              ><XIcon size={11} /></button>
            )}
          </div>

          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: 3 }}>
            {(['all', 'completed', 'attention'] as FilterTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setFilterTab(tab)}
                style={{
                  flex: 1, padding: '4px 0', borderRadius: 5, border: 'none',
                  background: filterTab === tab ? 'var(--bg-input)' : 'transparent',
                  color: filterTab === tab ? 'var(--text)' : 'var(--text-dim)',
                  fontSize: 10, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                  letterSpacing: '0.02em',
                  transition: 'all 0.12s',
                }}
              >
                {tab === 'all' ? 'All' : tab === 'completed' ? 'Done' : 'Attention'}
              </button>
            ))}
          </div>
        </div>

        {/* Note list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
          {filteredNotes.length === 0 && (
            <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
              {search ? `No notes match "${search}"` : 'No notes yet'}
            </div>
          )}
          {filteredNotes.map(note => (
            <NoteItem
              key={note.id}
              note={note}
              selected={!isNewNote && selectedNoteId === note.id}
              dirty={note.id in extractedBodies && note.body !== extractedBodies[note.id]}
              onSelect={() => handleSelectNote(note.id)}
              onRename={t => updateNoteTitle(note.id, t)}
              onDelete={() => {
                deleteNote(note.id);
                const remaining = notes.filter(n => n.id !== note.id);
                if (selectedNoteId === note.id) {
                  if (remaining.length > 0) handleSelectNote(remaining[0].id);
                  else handleNewNote();
                }
              }}
            />
          ))}
        </div>

        {/* Stats footer */}
        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 12, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{notes.filter(n => n.status === 'completed').length} extracted</span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>·</span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{notes.reduce((s, n) => s + (n.concepts?.length ?? 0), 0)} concepts</span>
        </div>
      </div>

      {/* ── Editor area ──────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Title toolbar */}
        <div style={{
          padding: '0 16px 0 28px', height: 58, borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
          background: 'var(--bg)',
        }}>
          {isMobile && (
            <button
              onClick={() => setMobileSidebarOpen(true)}
              style={{
                width: 32, height: 32, borderRadius: 7, border: '1px solid var(--border)',
                background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: 'var(--text-muted)', flexShrink: 0, fontSize: 14,
              }}
            >☰</button>
          )}
          <input
            value={currentTitle}
            onChange={e => isNewNote ? setNewTitle(e.target.value) : selectedNote && updateNoteTitle(selectedNote.id, e.target.value)}
            placeholder="Note title..."
            style={{
              flex: 1, background: 'none', border: 'none', color: 'var(--text)',
              fontSize: 20, fontWeight: 700, fontFamily: 'inherit', outline: 'none',
              minWidth: 0, letterSpacing: '-0.01em',
            }}
          />

          {isMobile && showExtractionPanel && (
            <button onClick={() => setShowMobileResults(true)} style={{
              padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)',
              background: 'var(--bg-elevated)', color: 'var(--green)',
              fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
            }}>
              {isProcessing ? '⟳ Processing' : '◉ Results'}
            </button>
          )}

          {!isNewNote && isDirty && !isProcessing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 5, background: 'rgba(255,150,0,0.1)', border: '1px solid rgba(255,150,0,0.3)', flexShrink: 0 }}>
              <AlertTriangle size={11} style={{ color: 'var(--orange)' }} />
              <span style={{ fontSize: 11, color: 'var(--orange)', fontWeight: 600 }}>Modified</span>
            </div>
          )}

          {selectedNote && !isNewNote && (
            <StatusBadge status={selectedNote.status} />
          )}

          {isNewNote ? (
            <button
              onClick={handleProcessNew}
              disabled={newBody.trim().length < 20 || isProcessing}
              style={{
                padding: '7px 18px', borderRadius: 8, background: 'var(--green)',
                color: '#fff', border: 'none', cursor: newBody.trim().length < 20 ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                opacity: newBody.trim().length < 20 ? 0.45 : 1,
                display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
              }}
            >
              <Puzzle size={13} /> Save to Brain
            </button>
          ) : isDirty && selectedNote && !isProcessing ? (
            <button
              onClick={handleReExtract}
              style={{
                padding: '7px 18px', borderRadius: 8, background: 'var(--orange)',
                color: '#fff', border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
              }}
            >
              <RefreshCw size={13} /> Re-extract
            </button>
          ) : isProcessing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--blue)', flexShrink: 0 }}>
              <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Processing…
            </div>
          ) : null}
        </div>

        {/* ── Sources section ── */}
        <div style={{
          padding: '0 28px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg)',
          flexShrink: 0,
        }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setSourcesExpanded(!sourcesExpanded)}
          >
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>Sources</span>
            {currentSources.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', background: 'rgba(28,176,246,0.1)', padding: '1px 7px', borderRadius: 10 }}>
                {currentSources.length}
              </span>
            )}
            <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 'auto', transform: sourcesExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▲</span>
          </div>

          {sourcesExpanded && (
            <div style={{ paddingBottom: 10 }}>
              {/* Source cards */}
              {currentSources.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {currentSources.map(src => (
                    <SourceCard key={src.id} source={src} onRemove={() => handleRemoveSource(src.id)} />
                  ))}
                </div>
              )}

              {/* Empty state / add button */}
              {!showSourceChooser && !addingLink && !pastingText && (
                <button
                  onClick={() => setShowSourceChooser(true)}
                  style={{
                    padding: '5px 12px', borderRadius: 7, border: '1px dashed var(--border)',
                    background: 'transparent', color: 'var(--text-muted)',
                    fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 5,
                    transition: 'border-color 0.15s, color 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
                >+ Add source</button>
              )}

              {/* Source chooser popover */}
              {showSourceChooser && !addingLink && (
                <div style={{
                  display: 'inline-flex', flexDirection: 'column', gap: 2,
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: 6, boxShadow: 'var(--shadow)',
                  animation: 'fadeUp 0.15s ease',
                }}>
                  {[
                    // All three append extracted text into the note body, which is
                    // then ingested normally. File reads .txt/.md client-side; web
                    // link fetches server-side (SSRF-safe); paste is direct.
                    { icon: '📄', label: 'Upload file', action: () => fileInputRef.current?.click() },
                    { icon: '🔗', label: 'Add web link', action: () => { setAddingLink(true); setShowSourceChooser(false); setLinkError(''); } },
                    { icon: '📋', label: 'Paste text', action: () => { setPastingText(true); setShowSourceChooser(false); setPasteText(''); } },
                  ].map(({ icon, label, action }) => (
                    <button
                      key={label}
                      onClick={action}
                      style={{
                        padding: '7px 12px', borderRadius: 7, border: 'none', background: 'transparent',
                        color: 'var(--text-2)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-input)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                    >
                      <span>{icon}</span> {label}
                    </button>
                  ))}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md,.markdown,.text,text/plain,text/markdown"
                    style={{ display: 'none' }}
                    onChange={e => { handleFilePicked(e.target.files?.[0]); e.currentTarget.value = ''; }}
                  />
                  <button onClick={() => setShowSourceChooser(false)} style={{ position: 'absolute', top: 6, right: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 0, display: 'flex' }}>
                    <XIcon size={12} />
                  </button>
                </div>
              )}

              {/* Add link input */}
              {addingLink && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, animation: 'fadeUp 0.15s ease' }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      autoFocus
                      value={linkUrl}
                      onChange={e => { setLinkUrl(e.target.value); setLinkError(''); }}
                      placeholder="https://..."
                      onKeyDown={e => { if (e.key === 'Enter') handleAddLink(); if (e.key === 'Escape') { setAddingLink(false); setLinkUrl(''); setLinkError(''); } }}
                      style={{
                        flex: 1, padding: '6px 10px', borderRadius: 7,
                        border: linkError ? '1px solid var(--red)' : '1px solid var(--border-strong)',
                        background: 'var(--bg-input)', color: 'var(--text)',
                        fontSize: 12, fontFamily: 'inherit', outline: 'none',
                      }}
                    />
                    <button
                      onClick={handleAddLink}
                      disabled={sourceBusy}
                      style={{ padding: '6px 12px', borderRadius: 7, background: 'var(--blue)', color: '#fff', border: 'none', cursor: sourceBusy ? 'default' : 'pointer', opacity: sourceBusy ? 0.6 : 1, fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}
                    >{sourceBusy ? 'Fetching…' : 'Add'}</button>
                    <button
                      onClick={() => { setAddingLink(false); setLinkUrl(''); setLinkError(''); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', display: 'flex', padding: 0 }}
                    ><XIcon size={13} /></button>
                  </div>
                  {linkError && <span style={{ fontSize: 11, color: 'var(--red)' }}>{linkError}</span>}
                </div>
              )}

              {/* Paste text input */}
              {pastingText && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, animation: 'fadeUp 0.15s ease' }}>
                  <textarea
                    autoFocus
                    value={pasteText}
                    onChange={e => setPasteText(e.target.value)}
                    placeholder="Paste source text here…"
                    rows={4}
                    style={{
                      width: '100%', padding: '8px 10px', borderRadius: 7,
                      border: '1px solid var(--border-strong)', background: 'var(--bg-input)',
                      color: 'var(--text)', fontSize: 12, fontFamily: 'inherit', outline: 'none',
                      resize: 'vertical', boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={handlePasteConfirm}
                      disabled={!pasteText.trim()}
                      style={{ padding: '6px 12px', borderRadius: 7, background: 'var(--blue)', color: '#fff', border: 'none', cursor: pasteText.trim() ? 'pointer' : 'default', opacity: pasteText.trim() ? 1 : 0.6, fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}
                    >Add text</button>
                    <button
                      onClick={() => { setPastingText(false); setPasteText(''); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', display: 'flex', padding: '6px 0', fontSize: 12, fontFamily: 'inherit' }}
                    >Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Markdown editor ── */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <textarea
            value={currentBody}
            onChange={e => {
              if (isNewNote) setNewBody(e.target.value);
              else if (selectedNote) updateNoteBody(selectedNote.id, e.target.value);
            }}
            placeholder="Write what you know..."
            spellCheck={false}
            style={{
              flex: 1, padding: '22px 28px', background: 'none',
              border: 'none', color: 'var(--text-2)', fontSize: 15,
              fontFamily: "Inter, system-ui, sans-serif",
              lineHeight: 1.85, resize: 'none', outline: 'none',
              boxSizing: 'border-box', width: '100%',
            }}
          />

          {/* Footer */}
          <div style={{
            padding: '6px 28px', borderTop: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0,
            background: 'var(--bg)',
          }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{wc} words</span>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>·</span>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{currentBody.length} chars</span>
            {selectedNote?.updatedAt && (
              <>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>·</span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Saved {selectedNote.updatedAt}</span>
              </>
            )}
            {isDirty && (
              <>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>·</span>
                <span style={{ fontSize: 11, color: 'var(--orange)', fontWeight: 500 }}>Knowledge structure is out of date</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Mobile bottom sheet: Knowledge Processing ── */}
      {isMobile && showMobileResults && (
        <>
          <div onClick={() => setShowMobileResults(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300 }} />
          <div style={{
            position: 'fixed', left: 0, right: 0, bottom: 0, maxHeight: '75vh',
            background: 'var(--bg-elevated)', borderRadius: '18px 18px 0 0',
            borderTop: '1px solid var(--border)', zIndex: 301, overflowY: 'auto',
            animation: 'slideInBottom 0.3s cubic-bezier(0.16,1,0.3,1)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border-strong)' }} />
            </div>
            <div style={{ padding: '4px 20px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Knowledge Processing</span>
              <button onClick={() => setShowMobileResults(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 20, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
              {(isProcessing || pipelineDone) && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {PIPELINE_STEPS.map((step, i) => {
                    const done = pipelineStep > i;
                    const active = pipelineStep === i && !pipelineDone;
                    const isLast = i === PIPELINE_STEPS.length - 1;
                    return (
                      <div key={step.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                          <div style={{
                            width: 26, height: 26, borderRadius: '50%',
                            background: done ? 'var(--green)' : active ? 'rgba(28,176,246,0.15)' : 'var(--bg-input)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: active ? '1.5px solid var(--blue)' : done ? 'none' : '1px solid var(--border)',
                            color: done ? '#fff' : active ? 'var(--blue)' : 'var(--text-dim)',
                          }}>
                            {done ? <Check size={12} strokeWidth={2.5} /> : <step.Icon size={12} />}
                          </div>
                          {!isLast && <div style={{ width: 1, flex: 1, minHeight: 12, background: done ? 'var(--green)' : 'var(--border)', opacity: done ? 0.5 : 0.4, margin: '3px 0' }} />}
                        </div>
                        <div style={{ paddingTop: 3, paddingBottom: isLast ? 0 : 12 }}>
                          <div style={{ fontSize: 12, color: done ? 'var(--text)' : active ? 'var(--blue)' : 'var(--text-dim)', fontWeight: done || active ? 500 : 400, lineHeight: 1.4 }}>
                            {step.label}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {processingFailed && <IngestionFailed onRetry={handleReExtract} />}
              {(pipelineDone || (selectedNote?.status === 'completed' && !isProcessing)) && (
                <ExtractionResults
                  note={selectedNote ?? null}
                />
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Right panel: Knowledge Processing ────────── */}
      {showExtractionPanel && !isMobile && (
        <div style={{
          width: isTablet ? 280 : 320, flexShrink: 0, borderLeft: '1px solid var(--border)',
          background: 'var(--bg-elevated)', display: 'flex', flexDirection: 'column',
          overflowY: 'auto', animation: 'slideInRight 0.22s ease',
        }}>

          {/* Panel header */}
          <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 2 }}>
              Knowledge Processing
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {isProcessing ? 'Structuring your note…' : processingFailed ? 'Processing failed' : pipelineDone ? 'Extraction complete' : 'Latest extraction'}
            </div>
          </div>

          <div style={{ flex: 1, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Re-extract CTA when dirty */}
            {!isProcessing && !pipelineDone && isDirty && selectedNote && (
              <div style={{
                padding: '12px 14px', borderRadius: 10,
                background: 'rgba(255,150,0,0.08)', border: '1px solid rgba(255,150,0,0.3)',
                animation: 'fadeUp 0.2s ease',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <AlertTriangle size={14} style={{ color: 'var(--orange)', flexShrink: 0, marginTop: 1 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--orange)', marginBottom: 4 }}>Knowledge structure is out of date.</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 10 }}>
                      You edited this note after its last extraction. Re-extract to update your Brain.
                    </div>
                    <button
                      onClick={handleReExtract}
                      style={{
                        padding: '6px 14px', borderRadius: 7, background: 'var(--orange)',
                        color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11,
                        fontWeight: 700, fontFamily: 'inherit',
                        display: 'flex', alignItems: 'center', gap: 5,
                      }}
                    >
                      <RefreshCw size={11} /> Re-extract Now
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Pipeline stepper */}
            {(isProcessing || pipelineDone) && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {PIPELINE_STEPS.map((step, i) => {
                  const done = pipelineStep > i;
                  const active = pipelineStep === i && !pipelineDone;
                  const isLast = i === PIPELINE_STEPS.length - 1;
                  return (
                    <div key={step.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                        <div style={{
                          width: 26, height: 26, borderRadius: '50%',
                          background: done ? 'var(--green)' : active ? 'rgba(28,176,246,0.15)' : 'var(--bg-input)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: active ? '1.5px solid var(--blue)' : done ? 'none' : '1px solid var(--border)',
                          color: done ? '#fff' : active ? 'var(--blue)' : 'var(--text-dim)',
                          transition: 'all 0.35s',
                          animation: active ? 'pulse 1.5s ease infinite' : 'none',
                        }}>
                          {done ? <Check size={12} strokeWidth={2.5} /> : <step.Icon size={12} />}
                        </div>
                        {!isLast && (
                          <div style={{ width: 1, flex: 1, minHeight: 12, background: done ? 'var(--green)' : 'var(--border)', opacity: done ? 0.5 : 0.4, margin: '3px 0' }} />
                        )}
                      </div>
                      <div style={{ paddingTop: 3, paddingBottom: isLast ? 0 : 12 }}>
                        <div style={{ fontSize: 12, color: done ? 'var(--text)' : active ? 'var(--blue)' : 'var(--text-dim)', fontWeight: done || active ? 500 : 400, lineHeight: 1.4 }}>
                          {step.label}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Ingestion failed */}
            {processingFailed && <IngestionFailed onRetry={handleReExtract} />}

            {/* Extraction results */}
            {(pipelineDone || (selectedNote?.status === 'completed' && !isProcessing)) && (
              <ExtractionResults
                note={selectedNote ?? null}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Shown when the backend reports a note's ingestion FAILED (real status, not a timer).
function IngestionFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(255,75,75,0.08)', border: '1px solid rgba(255,75,75,0.3)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <AlertTriangle size={14} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--red)', marginBottom: 4 }}>Couldn&apos;t process this note</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 10 }}>
            Something went wrong while structuring this note into your Brain. Your text is safe. You can try again.
          </div>
          <button
            onClick={onRetry}
            style={{
              padding: '6px 14px', borderRadius: 7, background: 'var(--red)', color: '#fff',
              border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <RefreshCw size={11} /> Try again
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Source Card ───────────────────────────────────────────────────
function SourceCard({ source, onRemove }: { source: Source; onRemove: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px',
        borderRadius: 7, border: `1px solid ${hovered ? 'var(--border-strong)' : 'var(--border)'}`,
        background: 'var(--bg)', fontSize: 11, color: 'var(--text-2)',
        transition: 'border-color 0.15s', cursor: 'default', maxWidth: 240,
      }}
    >
      <span style={{ fontSize: 13 }}>{sourceIcon(source.type)}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.title}</div>
        <div style={{ fontSize: 10, color: sourceStatusColor(source.status) }}>{sourceStatusLabel(source.status)}</div>
      </div>
      {hovered && (
        <button
          onClick={onRemove}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', display: 'flex', padding: 0, flexShrink: 0 }}
          title="Remove source"
        ><XIcon size={11} /></button>
      )}
    </div>
  );
}

// ── Extraction Results Panel ──────────────────────────────────────
function ExtractionResults({ note }: { note: Note | null }) {
  const concepts = note?.concepts ?? [];
  const visibleConcepts = concepts;
  const isPending = !note || note.status === 'processing';
  const isFailed = note?.status === 'failed';

  if (isPending || isFailed) {
    return (
      <div role="status" style={{
        padding: '14px', borderRadius: 10, background: 'var(--bg)',
        border: `1px solid ${isFailed ? 'rgba(255,75,75,0.25)' : 'var(--border)'}`,
        fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6,
      }}>
        {isFailed
          ? <><span style={{ color: 'var(--red)', fontWeight: 600 }}>Processing failed.</span> Edit the note and try again.</>
          : <><span style={{ color: 'var(--blue)', fontWeight: 600 }}>Processing your note…</span> Concepts will appear here once your Brain has finished structuring it.</>}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>


      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {[
          { label: 'Concepts', value: concepts.length, color: 'var(--green)' },
          { label: 'Key Statements', value: note?.claims ?? '—', color: 'var(--blue)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ padding: '10px 8px', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color, letterSpacing: '-0.02em' }}>{value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Concepts */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 8 }}>Concepts Found</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {visibleConcepts.map(c => (
            <span key={c} style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
              background: 'rgba(88,204,2,0.08)', color: 'var(--green)',
              border: '1px solid rgba(88,204,2,0.2)',

            }}>{c}</span>
          ))}
          {visibleConcepts.length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>No concepts linked to this note yet.</span>
          )}
        </div>
      </div>

      {/* Status */}
      <div style={{
        padding: '10px 12px', borderRadius: 8, background: 'var(--bg)',
        border: '1px solid rgba(88,204,2,0.2)',
        fontSize: 11, color: 'var(--text-2)', lineHeight: 1.6,
      }}>
        <span style={{ color: 'var(--green)', fontWeight: 600 }}>✓ Brain updated.</span>{' '}
        {note
          ? `${concepts.length} concepts linked to your graph.`
          : 'Note successfully added to your Brain.'}
      </div>
    </div>
  );
}

// ── Note sidebar item ─────────────────────────────────────────────
function NoteItem({ note, selected, dirty, onSelect, onRename, onDelete }: {
  note: Note; selected: boolean; dirty: boolean;
  onSelect: () => void; onRename: (t: string) => void; onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.title);

  const commitRename = () => {
    if (draft.trim()) onRename(draft.trim());
    else setDraft(note.title);
    setEditing(false);
  };

  const statusDot: Record<Note['status'], string> = {
    completed: 'var(--green)',
    processing: 'var(--blue)',
    draft: 'var(--text-dim)',
    partial: 'var(--orange)',
    failed: 'var(--red)',
  };

  return (
    <div
      style={{ position: 'relative', marginBottom: 1 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        onClick={onSelect}
        style={{
          padding: '9px 10px', borderRadius: 8, cursor: 'pointer',
          background: selected ? 'var(--bg-input)' : hovered ? 'rgba(255,255,255,0.03)' : 'transparent',
          border: selected ? '1px solid var(--border)' : '1px solid transparent',
          transition: 'background 0.12s, border-color 0.12s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3, paddingRight: hovered && !editing ? 44 : 0 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusDot[note.status], flexShrink: 0 }} />
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setDraft(note.title); setEditing(false); } }}
              onClick={e => e.stopPropagation()}
              style={{
                flex: 1, background: 'var(--bg)', border: '1px solid var(--border-strong)',
                borderRadius: 4, padding: '1px 6px', color: 'var(--text)', fontSize: 12,
                fontFamily: 'inherit', outline: 'none',
              }}
            />
          ) : (
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {note.title}
            </div>
          )}
          {dirty && !editing && (
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--orange)', flexShrink: 0 }} title="Modified — re-extraction needed" />
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', paddingLeft: 13 }}>
          {note.concepts && <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{note.concepts.length} concepts</span>}
          {note.concepts && <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>·</span>}
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{note.updatedAt}</span>
        </div>
      </div>
      {hovered && !editing && (
        <div style={{ position: 'absolute', top: 7, right: 6, display: 'flex', gap: 2 }}>
          <button
            title="Rename"
            onClick={e => { e.stopPropagation(); setDraft(note.title); setEditing(true); }}
            style={{
              width: 20, height: 20, borderRadius: 4, border: 'none', cursor: 'pointer',
              background: 'var(--bg-elevated)', color: 'var(--text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
          >✎</button>
          <button
            title="Delete"
            onClick={e => { e.stopPropagation(); onDelete(); }}
            style={{
              width: 20, height: 20, borderRadius: 4, border: 'none', cursor: 'pointer',
              background: 'var(--bg-elevated)', color: 'var(--text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--red)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,75,75,0.1)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'; }}
          ><XIcon size={10} /></button>
        </div>
      )}
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────
function StatusBadge({ status }: { status: Note['status'] }) {
  const map: Record<Note['status'], { label: string; color: string; bg: string }> = {
    draft:      { label: 'Draft',      color: 'var(--text-dim)',  bg: 'var(--bg-input)' },
    processing: { label: 'Processing', color: 'var(--blue)',      bg: 'rgba(28,176,246,0.1)' },
    completed:  { label: 'Extracted',  color: 'var(--green)',     bg: 'rgba(88,204,2,0.1)' },
    partial:    { label: 'Partial',    color: 'var(--orange)',    bg: 'rgba(255,150,0,0.1)' },
    failed:     { label: 'Failed',     color: 'var(--red)',       bg: 'rgba(255,75,75,0.1)' },
  };
  const s = map[status];
  return (
    <span style={{
      fontSize: 10, color: s.color, fontWeight: 700, padding: '2px 8px',
      borderRadius: 5, background: s.bg, letterSpacing: '0.03em', flexShrink: 0,
    }}>{s.label}</span>
  );
}
