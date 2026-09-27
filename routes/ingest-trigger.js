// Debounced trigger that asks FastAPI to ingest a note.
//
// The editor saves on every keystroke, and each ingestion makes paid AI
// calls, so we never call /ingest per request. Instead each note gets a
// timer that is reset on every save; FastAPI is only called once the note
// has been idle for INGEST_DEBOUNCE_MS. FastAPI also skips notes whose
// content hash hasn't changed, so repeat triggers are cheap.
//
// The timers are in-memory: a pending trigger is lost if Express restarts
// before it fires. The note stays PENDING and is picked up on its next save.
const { fastapi } = require('../services/fastapi');

const DEBOUNCE_MS = parseInt(process.env.INGEST_DEBOUNCE_MS || '15000', 10);

const timers = new Map(); // noteId -> Timeout

function scheduleIngestion(noteId, learnerId) {
  const existing = timers.get(noteId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    timers.delete(noteId);
    try {
      await fastapi.post('/ingest', { note_id: noteId, learner_id: learnerId });
    } catch (err) {
      // FastAPI marks the note FAILED itself; here we only log.
      const detail = err.response ? `${err.response.status} ${JSON.stringify(err.response.data)}` : err.message;
      console.error(`Ingestion trigger failed for note ${noteId}: ${detail}`);
    }
  }, DEBOUNCE_MS);

  // Don't keep the process alive just for a pending trigger.
  if (typeof timer.unref === 'function') timer.unref();
  timers.set(noteId, timer);
}

function cancelIngestion(noteId) {
  const existing = timers.get(noteId);
  if (existing) clearTimeout(existing);
  timers.delete(noteId);
}

module.exports = { scheduleIngestion, cancelIngestion };
