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
import { FileText, Network, Link, Puzzle, Brain, RefreshCw, Check, X as XIcon, Search, AlertTriangle } from '../components/Icon';

// ── Pipeline steps (learner-friendly labels) ─────────────────────
const PIPELINE_STEPS = [
  { id: 1, label: 'Reading your note', Icon: FileText },
  { id: 2, label: 'Finding concepts', Icon: Puzzle },
  { id: 3, label: 'Structuring key statements', Icon: Check },
  { id: 4, label: 'Mapping prerequisites', Icon: Link },
  { id: 5, label: 'Connecting knowledge', Icon: Network },
  { id: 6, label: 'Updating your Brain', Icon: Brain },
];

const EXTRACTED_CONCEPTS = ['Hoisting', 'Creation Phase', 'var', 'let', 'const', 'TDZ', 'Function Declaration'];

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

const DEMO_SOURCES: Source[] = [
  { id: 's1', type: 'file', title: 'JavaScript Fundamentals.pdf', meta: '2.4 MB · PDF', status: 'extracted' },
  { id: 's2', type: 'link', title: 'MDN — JavaScript Execution Context', meta: 'developer.mozilla.org', status: 'extracted' },
];

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
    if (notes[0]) init[notes[0].id] = DEMO_SOURCES;
    return init;
  });
  const [sourcesExpanded, setSourcesExpanded] = useState(true);
  const [showSourceChooser, setShowSourceChooser] = useState(false);
  const [addingLink, setAddingLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState('');

  // Mobile results sheet
  const [showMobileResults, setShowMobileResults] = useState(false);

  // Pipeline state
  const [processingNoteId, setProcessingNoteId] = useState<string | null>(null);
  const [pipelineStep, setPipelineStep] = useState(0);
  const [pipelineDone, setPipelineDone] = useState(false);
  const [extractedVisible, setExtractedVisible] = useState(0);
  const processingRef = useRef(false);

  // Dirty tracking
  const [extractedBodies, setExtractedBodies] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    notes.forEach(n => { if (n.status === 'completed') init[n.id] = n.body; });
    return init;
  });

  const selectedNote = isNewNote ? null : notes.find(n => n.id === selectedNoteId);
  const isProcessing = processingNoteId !== null && !pipelineDone;

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

  const runPipeline = useCallback((noteId: string, onComplete: () => void) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setProcessingNoteId(noteId);
    setPipelineStep(0);
    setPipelineDone(false);
    setExtractedVisible(0);
    updateNoteStatus(noteId, 'processing');

    let step = 0;
    const advance = () => {
      step++;
      setPipelineStep(step);
      if (step < PIPELINE_STEPS.length) {
        setTimeout(advance, 800 + Math.random() * 400);
      } else {
        setTimeout(() => {
          setPipelineDone(true);
          updateNoteStatus(noteId, 'completed');
          processingRef.current = false;
          onComplete();
          let c = 0;
          const timer = setInterval(() => {
            c++;
            setExtractedVisible(c);
            if (c >= EXTRACTED_CONCEPTS.length) clearInterval(timer);
          }, 160);
        }, 500);
      }
    };
    setTimeout(advance, 600);
  }, [updateNoteStatus]);

  const handleProcessNew = () => {
    if (processingRef.current) return;
    const id = Date.now().toString();
    const note: Note = { id, title: newTitle, body: newBody, status: 'processing', updatedAt: 'Just now' };
    addNote(note);
    setSelectedNoteId(id);
    setIsNewNote(false);
    setExtractedBodies(prev => ({ ...prev, [id]: newBody }));
    runPipeline(id, () => {});
  };

  const handleReExtract = () => {
    if (!selectedNote || processingRef.current) return;
    setExtractedBodies(prev => ({ ...prev, [selectedNote.id]: selectedNote.body }));
    runPipeline(selectedNote.id, () => {});
  };

  const handleNewNote = () => {
    setIsNewNote(true);
    setSelectedNoteId(null);
    setNewTitle('Untitled Note');
    setNewBody(NEW_NOTE_TEMPLATE);
    setProcessingNoteId(null);
    setPipelineDone(false);
    processingRef.current = false;
    setShowSourceChooser(false);
    setAddingLink(false);
    setLinkUrl('');
  };

  const handleSelectNote = (id: string) => {
    setSelectedNoteId(id);
    setIsNewNote(false);
    setProcessingNoteId(null);
    setPipelineDone(false);
    processingRef.current = false;
    setShowSourceChooser(false);
    setAddingLink(false);
    setLinkUrl('');
  };

  const handleAddLink = () => {
    if (!linkUrl.trim()) return;
    try {
      new URL(linkUrl.startsWith('http') ? linkUrl : 'https://' + linkUrl);
    } catch {
      setLinkError("That doesn't look like a valid web address.");
      return;
    }
    setLinkError('');
    const domain = linkUrl.replace(/^https?:\/\//, '').split('/')[0];
    const newSource: Source = {
      id: Date.now().toString(),
      type: 'link',
      title: domain,
      meta: domain,
      status: 'attached',
    };
    const noteId = selectedNote?.id ?? 'new';
    setSources(prev => ({ ...prev, [noteId]: [...(prev[noteId] ?? []), newSource] }));
    setLinkUrl('');
    setAddingLink(false);
    setShowSourceChooser(false);
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

  const showExtractionPanel = isProcessing || pipelineDone || (selectedNote?.status === 'completed' && !isProcessing && !pipelineDone);

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
              {!showSourceChooser && !addingLink && (
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
                    { icon: '📄', label: 'Upload file', action: () => setShowSourceChooser(false) },
                    { icon: '🔗', label: 'Add web link', action: () => { setAddingLink(true); setShowSourceChooser(false); } },
                    { icon: '📋', label: 'Paste text', action: () => setShowSourceChooser(false) },
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
                      style={{ padding: '6px 12px', borderRadius: 7, background: 'var(--blue)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}
                    >Add</button>
                    <button
                      onClick={() => { setAddingLink(false); setLinkUrl(''); setLinkError(''); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', display: 'flex', padding: 0 }}
                    ><XIcon size={13} /></button>
                  </div>
                  {linkError && <span style={{ fontSize: 11, color: 'var(--red)' }}>{linkError}</span>}
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
              {(pipelineDone || (selectedNote?.status === 'completed' && !isProcessing)) && (
                <ExtractionResults
                  note={pipelineDone ? null : (selectedNote ?? null)}
                  extractedVisible={pipelineDone ? extractedVisible : undefined}
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
              {isProcessing ? 'Structuring your note…' : pipelineDone ? 'Extraction complete' : 'Latest extraction'}
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

            {/* Extraction results */}
            {(pipelineDone || (selectedNote?.status === 'completed' && !isProcessing)) && (
              <ExtractionResults
                note={pipelineDone ? null : (selectedNote ?? null)}
                extractedVisible={pipelineDone ? extractedVisible : undefined}
              />
            )}
          </div>
        </div>
      )}
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
function ExtractionResults({ note, extractedVisible }: { note: Note | null; extractedVisible?: number }) {
  const concepts = note?.concepts ?? EXTRACTED_CONCEPTS;
  const visibleConcepts = extractedVisible !== undefined ? concepts.slice(0, extractedVisible) : concepts;
  const claims = note?.claims ?? 8;
  const connections = note?.connections ?? 5;
  const justCompleted = extractedVisible !== undefined && extractedVisible >= EXTRACTED_CONCEPTS.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* "Your Brain just grew" completion message */}
      {justCompleted && (
        <div style={{
          padding: '14px', borderRadius: 10,
          background: 'rgba(88,204,2,0.07)', border: '1px solid rgba(88,204,2,0.25)',
          animation: 'fadeUp 0.3s ease',
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)', marginBottom: 4 }}>Your Brain just grew.</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>Knowledge added and connected to your graph.</div>
        </div>
      )}

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {[
          { label: 'Concepts', value: concepts.length, color: 'var(--green)' },
          { label: 'Key Statements', value: claims, color: 'var(--blue)' },
          { label: 'Prerequisites', value: 2, color: 'var(--orange)' },
          { label: 'Connections', value: connections, color: 'var(--text-2)' },
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
              animation: extractedVisible !== undefined ? 'fadeUp 0.25s ease' : 'none',
            }}>{c}</span>
          ))}
          {visibleConcepts.length === 0 && extractedVisible !== undefined && (
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Finding concepts…</span>
          )}
        </div>
      </div>

      {/* Key statements */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 8 }}>Key Statements</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { text: 'var is initialized to undefined during creation.', status: 'structured' },
            { text: 'let and const remain uninitialized until execution.', status: 'structured' },
            { text: '"Hoisting happens first."', status: 'incomplete' },
          ].map(({ text, status }) => (
            <div key={text} style={{
              display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 7,
              background: 'var(--bg)', border: `1px solid ${status === 'structured' ? 'rgba(88,204,2,0.15)' : 'rgba(255,150,0,0.15)'}`,
            }}>
              <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1, color: status === 'structured' ? 'var(--green)' : 'var(--orange)' }}>
                {status === 'structured' ? '✓' : '△'}
              </span>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5 }}>{text}</div>
                <div style={{ fontSize: 10, color: status === 'structured' ? 'var(--green)' : 'var(--orange)', marginTop: 2, fontWeight: 500 }}>
                  {status === 'structured' ? 'Structured' : 'Incomplete'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Prerequisites */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 8 }}>Prerequisites</div>
        <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg)', border: '1px solid rgba(255,75,75,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 13 }}>🔒</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>Missing prerequisite</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 8 }}>
            Creation Phase was identified as a prerequisite for Hoisting, but it isn't established in your Brain yet.
          </div>
          <button style={{
            padding: '5px 12px', borderRadius: 6, background: 'none',
            border: '1px solid var(--border)', color: 'var(--text-muted)',
            fontSize: 11, fontFamily: 'inherit', cursor: 'pointer', fontWeight: 500,
          }}>Learn this concept</button>
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
