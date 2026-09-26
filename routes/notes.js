const express = require('express');
const db = require('../database/db');
const verifyToken = require('../middleware/auth');

const router = express.Router();

// GET all notes for the authenticated user
router.get('/', verifyToken, async (req, res) => {
  try {
    const learnerId = req.user.id;
    const result = await db.query(
      'SELECT id, title, body, status, concepts, created_at, updated_at FROM notes WHERE learner_id = $1 ORDER BY updated_at DESC',
      [learnerId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST a new note
router.post('/', verifyToken, async (req, res) => {
  try {
    const learnerId = req.user.id;
    const { id, title, body, status, concepts } = req.body;
    
    // concepts is JSON, default to empty array if not provided
    const conceptsJson = JSON.stringify(concepts || []);

    const result = await db.query(
      `INSERT INTO notes (id, learner_id, title, body, status, concepts) 
       VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6) 
       RETURNING id, title, body, status, concepts, created_at, updated_at`,
      [id, learnerId, title, body, status || 'draft', conceptsJson]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating note:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT (update) an existing note
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const learnerId = req.user.id;
    const noteId = req.params.id;
    const { title, body, status, concepts } = req.body;

    const conceptsJson = concepts ? JSON.stringify(concepts) : undefined;

    const result = await db.query(
      `UPDATE notes 
       SET 
         title = COALESCE($1, title),
         body = COALESCE($2, body),
         status = COALESCE($3, status),
         concepts = COALESCE($4, concepts),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 AND learner_id = $6
       RETURNING id, title, body, status, concepts, created_at, updated_at`,
      [title, body, status, conceptsJson, noteId, learnerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Note not found or unauthorized' });
    }

    res.json(result.rows[0]);
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

    const result = await db.query(
      'DELETE FROM notes WHERE id = $1 AND learner_id = $2 RETURNING id',
      [noteId, learnerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Note not found or unauthorized' });
    }

    res.json({ message: 'Note deleted successfully', id: noteId });
  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
