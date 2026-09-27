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

const SELECT_NOTE = `
  SELECT n.id, n.title, n.body_md AS body, n.ingestion_status,
         n.created_at, n.updated_at, ${CONCEPTS_SUBQUERY}
  FROM notes n`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

function toApiNote(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    status: STATUS_TO_UI[row.ingestion_status] || 'processing',
    ingestion_status: row.ingestion_status,
    concepts: row.concepts || [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function fetchNote(noteId, learnerId) {
  const result = await db.query(`${SELECT_NOTE} WHERE n.id = $1 AND n.learner_id = $2`, [noteId, learnerId]);
  return result.rows[0] ? toApiNote(result.rows[0]) : null;
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

    const result = await db.query(
      `INSERT INTO notes (id, learner_id, title, body_md)
       VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, COALESCE($4, ''))
       RETURNING id, body_md`,
      [noteId, learnerId, title, body]
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
    const contentChanged = title !== undefined || body !== undefined;

    // A content change puts the note back in the ingestion queue. A
    // status-only PUT touches nothing but still returns the current note.
    const result = await db.query(
      `UPDATE notes
       SET
         title = COALESCE($1, title),
         body_md = COALESCE($2, body_md),
         ingestion_status = CASE WHEN $5::boolean THEN 'PENDING'::note_status
                                 ELSE ingestion_status END,
         updated_at = CASE WHEN $5::boolean THEN CURRENT_TIMESTAMP ELSE updated_at END
       WHERE id = $3 AND learner_id = $4
       RETURNING id, body_md`,
      [title ?? null, body ?? null, noteId, learnerId, contentChanged]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Note not found or unauthorized' });
    }

    const updated = result.rows[0];
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

    const result = await db.query(
      'DELETE FROM notes WHERE id = $1 AND learner_id = $2 RETURNING id',
      [noteId, learnerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Note not found or unauthorized' });
    }

    cancelIngestion(noteId);
    res.json({ message: 'Note deleted successfully', id: noteId });
  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/notes/fetch-source { url } -> { url, title, text, truncated }
// Server-side fetch of a web page's readable text (browsers can't fetch
// cross-origin, and this reuses FastAPI's SSRF-protected fetcher). The client
// appends the returned text into the note body; ingestion then runs normally.
// No DB write here. FastAPI statuses (400 blocked, 413 too large, 422 empty,
// 502 fetch failed, 503 down) pass straight through.
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
