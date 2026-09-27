const express = require('express');
const db = require('../../database/db');
const managementAuth = require('../../middleware/management-auth');
const { num, meetsFloor, ok, suppressed, floorRows, sendError } = require('./_shared');

const router = express.Router();

// GET /api/management/sources
router.get('/', managementAuth, async (req, res) => {
  try {
    // Sources reach a learner through their concept.
    const summary = await db.query(`
      SELECT
        COUNT(*)::int AS total_sources,
        COUNT(DISTINCT s.domain)::int AS distinct_domains,
        AVG((NOT s.robots_ok)::int)::float8 AS robots_blocked_rate,
        COUNT(DISTINCT c.learner_id)::int AS n_learners
      FROM sources s
      JOIN concepts c ON c.id = s.concept_id
    `);
    const s = summary.rows[0];

    if (!meetsFloor(s.n_learners)) {
      return res.json(suppressed('Fewer than 5 learners have fetched sources', {
        total_sources: null,
        distinct_domains: null,
        robots_blocked_rate: null,
        trust_tier_distribution: [],
        top_domains: [],
        validations: null,
      }));
    }

    const [tiers, domains, validations] = await Promise.all([
      db.query(`
        SELECT s.trust_tier::text AS tier, COUNT(*)::int AS count,
               COUNT(DISTINCT c.learner_id)::int AS n_learners
        FROM sources s
        JOIN concepts c ON c.id = s.concept_id
        GROUP BY s.trust_tier
        ORDER BY s.trust_tier
      `),
      // A domain is only shown once >= 5 learners use it (domains can identify people).
      db.query(`
        SELECT s.domain, COUNT(*)::int AS count,
               COUNT(DISTINCT c.learner_id)::int AS n_learners
        FROM sources s
        JOIN concepts c ON c.id = s.concept_id
        GROUP BY s.domain
        ORDER BY count DESC
      `),
      // Validations reach a learner through their note.
      db.query(`
        SELECT COUNT(*)::int AS total,
               AVG(v.source_coverage)::float8 AS avg_coverage,
               AVG(v.contradiction_count)::float8 AS avg_contradictions,
               AVG((v.contradiction_count > 0)::int)::float8 AS contradiction_rate,
               COUNT(DISTINCT n.learner_id)::int AS n_learners
        FROM validations v
        JOIN notes n ON n.id = v.note_id
      `),
    ]);

    const tierRows = floorRows(tiers.rows, (r) => ({ tier: r.tier, count: num(r.count) }));
    const domainRows = floorRows(domains.rows, (r) => ({ domain: r.domain, count: num(r.count) }));
    const v = validations.rows[0];

    res.json(ok({
      total_sources: s.total_sources,
      distinct_domains: s.distinct_domains,
      robots_blocked_rate: num(s.robots_blocked_rate),
      trust_tier_distribution: tierRows.rows,
      top_domains: domainRows.rows.slice(0, 20),
      suppressed_groups: tierRows.suppressed_groups + domainRows.suppressed_groups,
      validations: meetsFloor(v.n_learners)
        ? {
            total: v.total,
            avg_coverage: num(v.avg_coverage),
            avg_contradictions: num(v.avg_contradictions),
            contradiction_rate: num(v.contradiction_rate),
          }
        : null,
    }));
  } catch (err) {
    sendError(res, 'sources', err);
  }
});

module.exports = router;
