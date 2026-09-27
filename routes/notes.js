const express = require('express');
const db = require('../database/db');
const verifyToken = require('../middleware/auth');
const { scheduleIngestion, cancelIngestion } = require('./ingest-trigger');
const { fastapi, sendFastApiError } = require('../services/fastapi');

const router = express.Router();

// Response shape (every endpoint that returns a note):
//   { id, title, body, status, ingestion_status, concepts, created_at, updated_at }
//
//   body             <- body_md
//   ingestion_status <- raw DB enum: PENDING | READY | FAILED
//   status           <- UI vocabulary: processing | completed | failed
//   concepts         <- [{ id, canonical_label }] from the note_concepts join
//                       (empty until ingestion has linked concepts)
//
// Ingestion status is owned by the backend (FastAPI moves it PENDING ->
// READY/FAILED; a content edit resets it to PENDING). A client-sent `status`
// (e.g. the UI's local 'draft') is accepted and ignored; it is not stored.
const STATUS_TO_UI = { PENDING: 'processing', READY: 'completed', FAILED: 'failed' };

// Concepts are scoped to the note owner's learner_id as well as the join, so a
// stray cross-learner link can never leak another learner's concept label.
const CONCEPTS_SUBQUERY = `
  COALESCE((
    SELECT json_agg(json_build_object('id', c.id, 'canonical_label', c.canonical_label)
                    ORDER BY c.canonical_label)
    FROM note_concepts nc
    JOIN concepts c ON c.id = nc.concept_id AND c.learner_id = n.learner_id
    WHERE nc.note_id = n.id
  ), '[]'::json) AS concepts`;

// Source metadata only (no content) so note lists stay small.
const SOURCES_SUBQUERY = `
  COALESCE((
    SELECT json_agg(json_build_object(
             'id', s.id, 'kind', s.kind, 'title', s.title, 'url', s.url,
             'chars', char_length(s.content_text), 'created_at', s.created_at)
           ORDER BY s.created_at)
    FROM note_sources s WHERE s.note_id = n.id
  ), '[]'::json) AS sources`;

const SELECT_NOTE = `
  SELECT n.id, n.title, n.body_md AS body, n.ingestion_status,
         n.note_type, n.analogy_target_concept_id, n.target_concept_id,
         (SELECT canonical_label FROM concepts WHERE id = n.analogy_target_concept_id) AS analogy_target_label,
         n.created_at, n.updated_at, ${CONCEPTS_SUBQUERY}, ${SOURCES_SUBQUERY}
  FROM notes n`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

// notes.note_type (migration 007).
//   SOURCE_BACKED — learner's note, may have sources attached
//   USER_DEFINED  — learner's own understanding, no sources allowed
//   ANALOGY       — the note is an analogy for analogy_target_concept_id
const NOTE_TYPES = new Set(['SOURCE_BACKED', 'USER_DEFINED', 'ANALOGY']);
const SOURCE_KINDS = new Set(['link', 'file', 'paste']);
const MAX_SOURCE_CHARS = 200000;
const MAX_SOURCES_PER_NOTE = 20;

function toApiNote(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    status: STATUS_TO_UI[row.ingestion_status] || 'processing',
    ingestion_status: row.ingestion_status,
    note_type: row.note_type || 'SOURCE_BACKED',
    analogy_target_concept_id: row.analogy_target_concept_id || null,
    analogy_target_label: row.analogy_target_label || null,
    target_concept_id: row.target_concept_id || null,
    concepts: row.concepts || [],
    sources: row.sources || [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** True when conceptId is a concept owned by learnerId. */
async function ownsConcept(conceptId, learnerId) {
  if (!isUuid(conceptId)) return false;
  const r = await db.query('SELECT 1 FROM concepts WHERE id = $1 AND learner_id = $2', [conceptId, learnerId]);
  return r.rows.length > 0;
}

/**
 * Validate note_type / analogy_target_concept_id from a request body.
 * Returns { error } or { noteType, analogyTarget } (undefined = not sent).
 */
async function parseTypeFields(body, learnerId) {
  const out = { noteType: undefined, analogyTarget: undefined };
  if (body.note_type !== undefined) {
    if (!NOTE_TYPES.has(body.note_type)) {
      return { error: `note_type must be one of ${[...NOTE_TYPES].join(', ')}` };
    }
    out.noteType = body.note_type;
  }
  if (body.analogy_target_concept_id !== undefined) {
    const t = body.analogy_target_concept_id;
    if (t === null || t === '') {
      out.analogyTarget = null;
    } else if (!(await ownsConcept(t, learnerId))) {
      return { error: 'analogy_target_concept_id must be one of your concepts' };
    } else {
      out.analogyTarget = t;
    }
  }
  return out;
}

async function fetchNote(noteId, learnerId) {
  const result = await db.query(`${SELECT_NOTE} WHERE n.id = $1 AND n.learner_id = $2`, [noteId, learnerId]);
  return result.rows[0] ? toApiNote(result.rows[0]) : null;
}

/**
 * Delete a note together with the graph nodes that only existed because of it
 * (one transaction):
 *   1. concepts linked ONLY to this note (a concept shared with another note
 *      survives; that note still backs it)
 *   2. embedded-analogy children of those concepts (ANALOGY_OF → concept,
 *      track ANALOGY, no note of their own)
 *   3. locked prerequisite placeholders that were connected to them and are
 *      left with no edges at all (placeholders still required by another
 *      concept, or targeted by a "learn this concept" note, stay)
 * Edges, claims, probes, attempts and memory state cascade via FKs.
 * Returns null when the note is not found / not owned.
 */
async function deleteNoteCascade(noteId, learnerId) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      'SELECT id FROM notes WHERE id = $1 AND learner_id = $2 FOR UPDATE',
      [noteId, learnerId]
    );
    if (found.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const owned = (await client.query(
      `SELECT nc.concept_id AS id
       FROM note_concepts nc
       JOIN concepts c ON c.id = nc.concept_id AND c.learner_id = $2
       WHERE nc.note_id = $1
         AND NOT EXISTS (SELECT 1 FROM note_concepts o
                         WHERE o.concept_id = nc.concept_id AND o.note_id <> $1)`,
      [noteId, learnerId]
    )).rows.map(r => r.id);

    let children = [];
    let placeholderCandidates = [];
    if (owned.length) {
      children = (await client.query(
        `SELECT DISTINCT c.id
         FROM concepts c
         JOIN edges e ON e.source_id = c.id AND e.type = 'ANALOGY_OF' AND e.target_id = ANY($1::uuid[])
         WHERE c.learner_id = $2 AND c.track = 'ANALOGY'
           AND NOT EXISTS (SELECT 1 FROM note_concepts nc WHERE nc.concept_id = c.id)`,
        [owned, learnerId]
      )).rows.map(r => r.id);

      placeholderCandidates = (await client.query(
        `SELECT DISTINCT c.id
         FROM edges e
         JOIN concepts c ON c.id = CASE WHEN e.source_id = ANY($1::uuid[]) THEN e.target_id ELSE e.source_id END
         WHERE (e.source_id = ANY($1::uuid[]) OR e.target_id = ANY($1::uuid[]))
           AND c.learner_id = $2 AND c.status = 'UNRESOLVED_PREREQUISITE'`,
        [owned, learnerId]
      )).rows.map(r => r.id);
    }

    await client.query('DELETE FROM notes WHERE id = $1 AND learner_id = $2', [noteId, learnerId]);

    // A concept that another concept still REQUIRES (e.g. a locked node this
    // note unlocked) goes back to being a locked prerequisite instead of
    // vanishing, so the other note's prerequisite chain stays intact.
    let relocked = [];
    if (owned.length) {
      relocked = (await client.query(
        `SELECT DISTINCT e.target_id AS id FROM edges e
         WHERE e.type IN ('REQUIRES', 'EXPLAINED_BY') AND e.target_id = ANY($1::uuid[])
           AND NOT (e.source_id = ANY($1::uuid[]))`,
        [owned]
      )).rows.map(r => r.id);
    }
    if (relocked.length) {
      await client.query('DELETE FROM claims WHERE concept_id = ANY($1::uuid[])', [relocked]);
      await client.query('DELETE FROM probes WHERE concept_id = ANY($1::uuid[])', [relocked]);
      await client.query('DELETE FROM memory_states WHERE concept_id = ANY($1::uuid[])', [relocked]);
      await client.query('DELETE FROM edges WHERE source_id = ANY($1::uuid[])', [relocked]);
      await client.query(
        `UPDATE concepts SET status = 'UNRESOLVED_PREREQUISITE', probe_eligible = false,
                track = 'SELF_AUTHORED', shape = 'DEFINITION', category = 'DETERMINISTIC_MECHANISM',
                solo_level = 'Prestructural',
                deeper_question = NULL, deeper_primer = NULL, simplification_note = NULL,
                deeper_version = NULL, is_bedrock = false, bedrock_reason = NULL
         WHERE id = ANY($1::uuid[]) AND learner_id = $2`,
        [relocked, learnerId]
      );
    }

    const doomed = [...owned.filter(id => !relocked.includes(id)), ...children];
    let deletedConcepts = 0;
    if (doomed.length) {
      const r = await client.query(
        'DELETE FROM concepts WHERE id = ANY($1::uuid[]) AND learner_id = $2',
        [doomed, learnerId]
      );
      deletedConcepts += r.rowCount;
    }
    if (placeholderCandidates.length) {
      const r = await client.query(
        `DELETE FROM concepts c
         WHERE c.id = ANY($1::uuid[]) AND c.learner_id = $2
           AND c.status = 'UNRESOLVED_PREREQUISITE'
           AND NOT EXISTS (SELECT 1 FROM edges e WHERE e.source_id = c.id OR e.target_id = c.id)
           AND NOT EXISTS (SELECT 1 FROM note_concepts nc WHERE nc.concept_id = c.id)
           AND NOT EXISTS (SELECT 1 FROM notes n WHERE n.target_concept_id = c.id)`,
        [placeholderCandidates, learnerId]
      );
      deletedConcepts += r.rowCount;
    }

    await client.query('COMMIT');
    return { deletedConcepts };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// GET all notes for the authenticated user
router.get('/', verifyToken, async (req, res) => {
  try {
    const result = await db.query(
      `${SELECT_NOTE} WHERE n.learner_id = $1 ORDER BY n.updated_at DESC`,
      [req.user.id]
    );
    res.json(result.rows.map(toApiNote));
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET a single note
router.get('/:id', verifyToken, async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Note not found or unauthorized' });
    const note = await fetchNote(req.params.id, req.user.id);
    if (!note) return res.status(404).json({ error: 'Note not found or unauthorized' });
    res.json(note);
  } catch (error) {
    console.error('Error fetching note:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST a new note (`status` in the body is ignored, see header comment)
router.post('/', verifyToken, async (req, res) => {
  try {
    const learnerId = req.user.id;
    const { id, title, body } = req.body;

    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'title is required' });
    }
    if (body !== undefined && body !== null && typeof body !== 'string') {
      return res.status(400).json({ error: 'body must be a string' });
    }
    // A client-supplied id is honoured only if it is a UUID; anything else
    // (e.g. a timestamp) would fail the uuid column, so the DB generates one.
    const noteId = isUuid(id) ? id : null;

    const typed = await parseTypeFields(req.body, learnerId);
    if (typed.error) return res.status(400).json({ error: typed.error });
    const noteType = typed.noteType || 'SOURCE_BACKED';
    const analogyTarget = noteType === 'ANALOGY' ? (typed.analogyTarget ?? null) : null;

    // "Learn this concept" on a locked node: the note is bound to that exact
    // concept so ingestion promotes it instead of creating a duplicate.
    let targetConcept = null;
    if (req.body.target_concept_id !== undefined && req.body.target_concept_id !== null) {
      if (!(await ownsConcept(req.body.target_concept_id, learnerId))) {
        return res.status(400).json({ error: 'target_concept_id must be one of your concepts' });
      }
      targetConcept = req.body.target_concept_id;
    }

    const result = await db.query(
      `INSERT INTO notes (id, learner_id, title, body_md, note_type, analogy_target_concept_id, target_concept_id)
       VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, COALESCE($4, ''), $5::note_type, $6, $7)
       RETURNING id, body_md`,
      [noteId, learnerId, title, body, noteType, analogyTarget, targetConcept]
    );

    const created = result.rows[0];
    if (created.body_md && created.body_md.trim()) scheduleIngestion(created.id, learnerId);
    res.status(201).json(await fetchNote(created.id, learnerId));
  } catch (error) {
    console.error('Error creating note:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A note with this id already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT (update) an existing note (`status` in the body is ignored)
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const learnerId = req.user.id;
    const noteId = req.params.id;
    if (!isUuid(noteId)) {
      return res.status(404).json({ error: 'Note not found or unauthorized' });
    }
    const { title, body } = req.body;
    if (title !== undefined && (typeof title !== 'string' || !title)) {
      return res.status(400).json({ error: 'title must be a non-empty string' });
    }
    if (body !== undefined && typeof body !== 'string') {
      return res.status(400).json({ error: 'body must be a string' });
    }
    const typed = await parseTypeFields(req.body, learnerId);
    if (typed.error) return res.status(400).json({ error: typed.error });
    const typeSent = typed.noteType !== undefined || typed.analogyTarget !== undefined;
    const contentChanged = title !== undefined || body !== undefined || typeSent;

    const client = await db.getClient();
    let updated;
    try {
      await client.query('BEGIN');
      // A content change puts the note back in the ingestion queue. A
      // status-only PUT touches nothing but still returns the current note.
      // Leaving ANALOGY clears the analogy target.
      const result = await client.query(
        `UPDATE notes
         SET
           title = COALESCE($1, title),
           body_md = COALESCE($2, body_md),
           note_type = COALESCE($6::note_type, note_type),
           analogy_target_concept_id = CASE
             WHEN COALESCE($6::note_type, note_type) <> 'ANALOGY' THEN NULL
             WHEN $7::boolean THEN $8::uuid
             ELSE analogy_target_concept_id END,
           ingestion_status = CASE WHEN $5::boolean THEN 'PENDING'::note_status
                                   ELSE ingestion_status END,
           updated_at = CASE WHEN $5::boolean THEN CURRENT_TIMESTAMP ELSE updated_at END
         WHERE id = $3 AND learner_id = $4
         RETURNING id, body_md, note_type`,
        [title ?? null, body ?? null, noteId, learnerId, contentChanged,
         typed.noteType ?? null, typed.analogyTarget !== undefined, typed.analogyTarget ?? null]
      );
      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Note not found or unauthorized' });
      }
      updated = result.rows[0];
      // A user-defined note has no sources by definition.
      if (updated.note_type === 'USER_DEFINED') {
        await client.query('DELETE FROM note_sources WHERE note_id = $1', [noteId]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    if (contentChanged && updated.body_md && updated.body_md.trim()) scheduleIngestion(updated.id, learnerId);
    res.json(await fetchNote(updated.id, learnerId));
  } catch (error) {
    console.error('Error updating note:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE a note
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const learnerId = req.user.id;
    const noteId = req.params.id;
    if (!isUuid(noteId)) {
      return res.status(404).json({ error: 'Note not found or unauthorized' });
    }

    const removed = await deleteNoteCascade(noteId, learnerId);
    if (!removed) {
      return res.status(404).json({ error: 'Note not found or unauthorized' });
    }

    cancelIngestion(noteId);
    res.json({ message: 'Note deleted successfully', id: noteId, deleted_concepts: removed.deletedConcepts });
  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Note sources ────────────────────────────────────────────────────────
// Sources are stored in note_sources and NEVER merged into the note body:
// ingestion reads only the learner's own words.

async function ownedNote(noteId, learnerId) {
  if (!isUuid(noteId)) return null;
  const r = await db.query(
    'SELECT id, note_type FROM notes WHERE id = $1 AND learner_id = $2',
    [noteId, learnerId]
  );
  return r.rows[0] || null;
}

// GET /api/notes/:id/sources -> [{ id, kind, title, url, chars, created_at }]
router.get('/:id/sources', verifyToken, async (req, res) => {
  try {
    const note = await ownedNote(req.params.id, req.user.id);
    if (!note) return res.status(404).json({ error: 'Note not found or unauthorized' });
    const r = await db.query(
      `SELECT id, kind, title, url, char_length(content_text) AS chars, created_at
       FROM note_sources WHERE note_id = $1 ORDER BY created_at`,
      [note.id]
    );
    res.json(r.rows);
  } catch (error) {
    console.error('Error listing sources:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/notes/:id/sources/:sourceId -> full source incl. content_text
router.get('/:id/sources/:sourceId', verifyToken, async (req, res) => {
  try {
    const note = await ownedNote(req.params.id, req.user.id);
    if (!note || !isUuid(req.params.sourceId)) return res.status(404).json({ error: 'Source not found' });
    const r = await db.query(
      `SELECT id, kind, title, url, content_text, created_at
       FROM note_sources WHERE id = $1 AND note_id = $2`,
      [req.params.sourceId, note.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Source not found' });
    res.json(r.rows[0]);
  } catch (error) {
    console.error('Error fetching source:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/notes/:id/sources
//   { kind: 'link', url }                  -> server fetches readable text
//   { kind: 'file'|'paste', title?, text } -> stored as given
router.post('/:id/sources', verifyToken, async (req, res) => {
  try {
    const note = await ownedNote(req.params.id, req.user.id);
    if (!note) return res.status(404).json({ error: 'Note not found or unauthorized' });
    if (note.note_type === 'USER_DEFINED') {
      return res.status(409).json({ error: 'User-defined notes have no sources. Change the note type to add one.' });
    }
    const { kind } = req.body || {};
    if (!SOURCE_KINDS.has(kind)) {
      return res.status(400).json({ error: "kind must be 'link', 'file' or 'paste'" });
    }
    const count = await db.query('SELECT COUNT(*)::int AS n FROM note_sources WHERE note_id = $1', [note.id]);
    if (count.rows[0].n >= MAX_SOURCES_PER_NOTE) {
      return res.status(409).json({ error: `A note can have at most ${MAX_SOURCES_PER_NOTE} sources` });
    }

    let title = typeof req.body.title === 'string' ? req.body.title.trim().slice(0, 300) : '';
    let url = null;
    let text = '';
    if (kind === 'link') {
      url = typeof req.body.url === 'string' ? req.body.url.trim() : '';
      if (!url || !/^https?:\/\//i.test(url)) {
        return res.status(400).json({ error: 'A valid http(s) URL is required' });
      }
      try {
        const response = await fastapi.post('/retrieval/extract-text', { url });
        text = response.data.text || '';
        url = response.data.url || url;
        title = title || response.data.title || new URL(url).hostname;
      } catch (err) {
        return sendFastApiError(res, err, 'Could not fetch that link');
      }
    } else {
      text = typeof req.body.text === 'string' ? req.body.text : '';
      if (!text.trim()) return res.status(400).json({ error: 'text is required' });
      title = title || (kind === 'paste' ? 'Pasted text' : 'Uploaded file');
    }

    const r = await db.query(
      `INSERT INTO note_sources (note_id, kind, title, url, content_text)
       VALUES ($1, $2::note_source_kind, $3, $4, $5)
       RETURNING id, kind, title, url, char_length(content_text) AS chars, created_at`,
      [note.id, kind, title, url, text.slice(0, MAX_SOURCE_CHARS)]
    );
    res.status(201).json({ ...r.rows[0], truncated: text.length > MAX_SOURCE_CHARS });
  } catch (error) {
    console.error('Error adding source:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/notes/:id/sources/:sourceId
router.delete('/:id/sources/:sourceId', verifyToken, async (req, res) => {
  try {
    const note = await ownedNote(req.params.id, req.user.id);
    if (!note || !isUuid(req.params.sourceId)) return res.status(404).json({ error: 'Source not found' });
    const r = await db.query(
      'DELETE FROM note_sources WHERE id = $1 AND note_id = $2 RETURNING id',
      [req.params.sourceId, note.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Source not found' });
    res.json({ id: r.rows[0].id });
  } catch (error) {
    console.error('Error deleting source:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/notes/fetch-source { url } -> { url, title, text, truncated }
// Preview-only fetch of a web page's readable text (no DB write). Attaching a
// link to a note goes through POST /:id/sources instead. FastAPI statuses
// (400 blocked, 413 too large, 422 empty, 502 fetch failed, 503 down) pass
// straight through.
router.post('/fetch-source', verifyToken, async (req, res) => {
  const url = req.body && typeof req.body.url === 'string' ? req.body.url.trim() : '';
  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: 'A valid http(s) URL is required' });
  }
  try {
    const response = await fastapi.post('/retrieval/extract-text', { url });
    res.json(response.data);
  } catch (err) {
    sendFastApiError(res, err, 'Could not fetch that link');
  }
});

module.exports = router;
