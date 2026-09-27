"""Memory service â€” DB-backed memory state operations (Â§5.17â€“5.20).

Wraps the pure deterministic math functions with database I/O.
Ownership: FastAPI owns writes to memory_states (Â§12).
"""
from __future__ import annotations

import logging
import math
from datetime import datetime, timedelta, timezone
from typing import Optional

import psycopg
import psycopg.types.json
from psycopg.rows import dict_row

from app.memory.decay import (
    calculate_recall_probability,
    update_half_life,
    calculate_initial_half_life,
    classify_recall_colour,
    decay_factor,
)
from app.memory.mastery import (
    calculate_required_streak,
    check_mastery_procedural,
    check_mastery_claim_coverage,
    update_observed_complexity,
    can_exempt_decay,
    project_additional_probes,
)

logger = logging.getLogger(__name__)

NEUTRAL_PREDICTED_RECALL = 0.5  # used for the very first attempt (no prediction yet)


def _complexity(value) -> float:
    return float(value) if value is not None else 1.0


def next_review_at(
    last_reviewed: datetime, half_life_days: float, threshold: float,
) -> datetime:
    """When R(Î”t) = 2^(âˆ’Î”t/h) falls to the forgetting threshold (Â§6.9)."""
    threshold = min(max(threshold, 1e-6), 0.999999)
    days = half_life_days * math.log2(1.0 / threshold)
    return last_reviewed + timedelta(days=days)


class MemoryService:
    """Database-backed memory state management."""

    def __init__(self, conn: psycopg.AsyncConnection, settings=None):
        self._conn = conn
        if settings is None:
            from app.config import get_settings
            settings = get_settings()
        self._s = settings

    async def get_memory_state(
        self, concept_id: str, learner_id: str,
    ) -> Optional[dict]:
        """Fetch memory state with computed recall probability."""
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """SELECT ms.*, c.c_current AS complexity, c.shape, c.solo_level,
                          l.decay_sensitivity::text AS decay_sensitivity
                   FROM memory_states ms
                   JOIN concepts c ON c.id = ms.concept_id
                   JOIN learners l ON l.id = ms.learner_id
                   WHERE ms.concept_id = %s AND ms.learner_id = %s""",
                (concept_id, learner_id),
            )
            row = await cur.fetchone()

        if not row:
            return None

        state = dict(row)
        # decay_sensitivity is a per-learner READ lens: scale half-life for the
        # recall read only, never the stored value (used by update_after_attempt).
        factor = decay_factor(state.get("decay_sensitivity"), self._s)
        # Compute recall on read (D-21)
        if state.get("last_reviewed"):
            state["recall"] = calculate_recall_probability(
                state["last_reviewed"],
                state["half_life"] * factor,
                state.get("decay_exempt", False),
            )
            state["never_reviewed"] = False
        else:
            # Pre-first-probe: no prediction exists yet.
            state["recall"] = 1.0
            state["never_reviewed"] = True

        state["colour"] = classify_recall_colour(
            state["recall"],
            is_decay_exempt=state.get("decay_exempt", False),
        )
        return state

    async def ensure_memory_state(self, concept_id: str, learner_id: str) -> None:
        """Create the memory_states row if ingestion did not (h_0 = 1/C)."""
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                "SELECT c_current FROM concepts WHERE id = %s", (concept_id,),
            )
            row = await cur.fetchone()
            h0 = calculate_initial_half_life(_complexity((row or {}).get("c_current")))
            await cur.execute(
                """INSERT INTO memory_states (concept_id, learner_id, half_life)
                   VALUES (%s, %s, %s)
                   ON CONFLICT (concept_id, learner_id) DO NOTHING""",
                (concept_id, learner_id, h0),
            )

    async def update_after_attempt(
        self,
        concept_id: str,
        learner_id: str,
        score: float,
        passed: bool,
        predicted_recall: Optional[float],
    ) -> dict:
        """Update memory state after a graded attempt.

        1. Update half-life based on score and predicted recall
        2. Update streak (reset on failure)
        3. Update attempts/passes counters
        4. Update observed complexity (if enough attempts)
        Mastery is evaluated separately (evaluate_mastery) after this.
        """
        state = await self.get_memory_state(concept_id, learner_id)
        if not state:
            raise ValueError(f"No memory state for concept {concept_id}")

        complexity = _complexity(state.get("complexity"))
        h_current = state["half_life"]
        streak = state.get("streak") or 0
        attempts = state.get("attempts") or 0
        passes = state.get("passes") or 0
        p = NEUTRAL_PREDICTED_RECALL if predicted_recall is None else predicted_recall

        h_new = update_half_life(
            h_current, score, p, complexity,
            s_pass=self._s.pass_threshold,
            lambda_spacing=self._s.spacing_lambda,
            rho_failure=self._s.failure_multiplier,
        )

        if passed:
            new_streak = streak + 1
            new_passes = passes + 1
        else:
            new_streak = 0
            new_passes = passes
        new_attempts = attempts + 1

        now = datetime.now(timezone.utc)
        async with self._conn.cursor() as cur:
            await cur.execute(
                """
                UPDATE memory_states
                SET half_life = %s,
                    last_reviewed = %s,
                    streak = %s,
                    attempts = %s,
                    passes = %s
                WHERE concept_id = %s AND learner_id = %s
                """,
                (h_new, now, new_streak, new_attempts, new_passes,
                 concept_id, learner_id),
            )

            c_new = update_observed_complexity(complexity, score, new_attempts)
            if c_new != complexity:
                await cur.execute(
                    "UPDATE concepts SET c_current = %s WHERE id = %s",
                    (c_new, concept_id),
                )

        await self._conn.commit()

        return {
            "half_life": h_new,
            "streak": new_streak,
            "attempts": new_attempts,
            "passes": new_passes,
            "complexity": c_new,
            "last_reviewed": now,
            "next_review_at": next_review_at(
                now, h_new, self._s.review_forgetting_threshold,
            ),
        }

    async def evaluate_mastery(self, concept_id: str, learner_id: str) -> dict:
        """Evaluate mastery after an attempt (Â§5.18) and persist it.

        N_req is frozen at the first graded probe from C_0 (D-05) and written
        to concepts.n_req if still NULL. Newly mastered concepts get
        memory_states.mastered_at, which removes them from the review queue.
        """
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """SELECT c.shape::text AS shape, c.c_0, c.c_current, c.n_req, c.version,
                          ms.streak, ms.attempts, ms.passes, ms.mastered_at
                   FROM concepts c
                   JOIN memory_states ms ON ms.concept_id = c.id AND ms.learner_id = %s
                   WHERE c.id = %s""",
                (learner_id, concept_id),
            )
            row = await cur.fetchone()
        if not row:
            return {"mastered": False, "newly_mastered": False}

        is_procedural = row.get("shape") == "PROCEDURAL"
        n_req = row.get("n_req")
        if n_req is None:
            c0 = row.get("c_0") if row.get("c_0") is not None else _complexity(row.get("c_current"))
            n_req = calculate_required_streak(c0, is_procedural)
            async with self._conn.cursor() as cur:
                await cur.execute(
                    "UPDATE concepts SET n_req = %s WHERE id = %s AND n_req IS NULL",
                    (n_req, concept_id),
                )

        streak = row.get("streak") or 0
        if is_procedural:
            mastered = check_mastery_procedural(streak, n_req)
        else:
            async with self._conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    """SELECT a.composite_score, p.type::text AS type,
                              a.gap_report->'grading'->'matched_claim_ids' AS matched_ids
                       FROM attempts a
                       JOIN probes p ON p.id = a.probe_id
                       WHERE a.concept_id = %s AND a.learner_id = %s
                       ORDER BY a.submitted_at DESC
                       LIMIT %s""",
                    (concept_id, learner_id, n_req),
                )
                window = await cur.fetchall()
                await cur.execute(
                    """SELECT id::text AS id FROM claims
                       WHERE concept_id = %s AND concept_version = %s AND is_transition""",
                    (concept_id, row.get("version")),
                )
                transition_ids = {r["id"] for r in await cur.fetchall()}

            matched_union: set[str] = set()
            for a in window:
                ids = a.get("matched_ids")
                if isinstance(ids, list):
                    matched_union.update(str(i) for i in ids)
            # Condition 2: every transition claim matched in at least one of
            # the k attempts (vacuously true when the concept has none).
            covered = transition_ids <= matched_union
            mastered = check_mastery_claim_coverage(
                [float(a["composite_score"]) for a in window],
                [covered] * len(window),
                [a["type"] for a in window],
                n_req,
            )

        newly = False
        if mastered and row.get("mastered_at") is None:
            async with self._conn.cursor() as cur:
                await cur.execute(
                    """UPDATE memory_states SET mastered_at = NOW()
                       WHERE concept_id = %s AND learner_id = %s AND mastered_at IS NULL""",
                    (concept_id, learner_id),
                )
                # Capability timeline (§5.25.1): one MASTERY event on the first
                # time this concept is mastered, tagged with the latest attempt.
                await cur.execute(
                    """INSERT INTO capability_events
                           (learner_id, concept_id, attempt_id, event_type, detail)
                       SELECT %s, %s,
                              (SELECT id FROM attempts
                               WHERE concept_id = %s AND learner_id = %s
                               ORDER BY submitted_at DESC LIMIT 1),
                              'MASTERY', %s::jsonb
                       WHERE NOT EXISTS (
                           SELECT 1 FROM capability_events
                           WHERE learner_id = %s AND concept_id = %s
                             AND event_type = 'MASTERY'
                       )""",
                    (learner_id, concept_id, concept_id, learner_id,
                     psycopg.types.json.Jsonb({"n_req": n_req, "streak": streak}),
                     learner_id, concept_id),
                )
            newly = True
        await self._conn.commit()

        return {
            "mastered": bool(mastered or row.get("mastered_at") is not None),
            "newly_mastered": newly,
            "n_req": n_req,
            "streak": streak,
            "expected_additional_probes": project_additional_probes(
                n_req, streak, row.get("passes") or 0, row.get("attempts") or 0,
            ),
            "decay_exempt_eligible": can_exempt_decay(streak, n_req, bool(mastered)),
        }

    async def get_review_queue(
        self, learner_id: str, session_size: int = 8,
    ) -> list[dict]:
        """Build the review queue for a learner (Â§5.20, Â§6.9).

        Candidates: VERIFIED, probe-eligible, not decay-exempt, not mastered,
        and either never reviewed (treated as due, R = 0) or R(now) below
        the forgetting threshold. Priority uses real PageRank centrality
        over the learner's edges; REQUIRES detours use the prerequisite's
        own row.
        """
        from app.memory.scheduler import (
            calculate_priority, build_review_queue, compute_centrality,
        )

        s = self._s
        now = datetime.now(timezone.utc)

        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT c.id AS concept_id, c.canonical_label AS concept_label,
                       c.c_current AS complexity, c.solo_level::text AS solo_level,
                       c.status::text AS status, c.probe_eligible,
                       ms.concept_id AS ms_concept_id,
                       ms.half_life, ms.last_reviewed, ms.decay_exempt,
                       ms.streak, ms.mastered_at,
                       l.decay_sensitivity::text AS decay_sensitivity
                FROM concepts c
                JOIN learners l ON l.id = c.learner_id
                LEFT JOIN memory_states ms
                       ON ms.concept_id = c.id AND ms.learner_id = c.learner_id
                WHERE c.learner_id = %s
                """,
                (learner_id,),
            )
            rows = await cur.fetchall()

            if not rows:
                return []

            # Per-learner decay_sensitivity lens for recall reads (stored
            # half-life is untouched); the queue "due" filter shifts naturally.
            factor = decay_factor(rows[0].get("decay_sensitivity"), s)

            await cur.execute(
                """
                SELECT source_id, target_id, type::text AS type, weight,
                       flag::text AS flag
                FROM edges
                WHERE learner_id = %s
                """,
                (learner_id,),
            )
            edges = await cur.fetchall()

        # REQUIRES: source requires target â†’ target is the prerequisite.
        # CYCLE_CONFLICT edges are excluded (same rule as learning paths).
        prereq_map: dict[str, list[str]] = {}
        graph_edges: list[tuple[str, str, float]] = []
        for e in edges:
            src, tgt = str(e["source_id"]), str(e["target_id"])
            graph_edges.append((src, tgt, e.get("weight") or 1.0))
            if e.get("type") == "REQUIRES" and e.get("flag") != "CYCLE_CONFLICT":
                prereq_map.setdefault(src, []).append(tgt)

        centrality = compute_centrality([str(r["concept_id"]) for r in rows], graph_edges)

        info: dict[str, dict] = {}
        for r in rows:
            cid = str(r["concept_id"])
            never = r.get("ms_concept_id") is None or r.get("last_reviewed") is None
            if r.get("decay_exempt"):
                recall = 1.0
            elif never:
                recall = 0.0   # never reviewed â†’ due now
            else:
                recall = calculate_recall_probability(
                    r["last_reviewed"], r["half_life"] * factor, False, now,
                )
            info[cid] = {
                "concept_id": cid,
                "concept_label": r["concept_label"],
                "recall_probability": recall,
                "solo_level": r.get("solo_level") or "Prestructural",
                "complexity": _complexity(r.get("complexity")),
                "status": r.get("status"),
                "probe_eligible": r.get("probe_eligible") is not False,
                "decay_exempt": bool(r.get("decay_exempt")),
                "mastered": r.get("mastered_at") is not None,
                "is_new": never,
                "hours": (
                    (now - r["last_reviewed"]).total_seconds() / 3600
                    if r.get("last_reviewed") else float("inf")
                ),
            }

        def probe_able(i: dict) -> bool:
            return (i["status"] == "VERIFIED_CONCEPT" and i["probe_eligible"]
                    and not i["decay_exempt"])

        candidates: list[dict] = []
        index: dict[str, dict] = {}
        for cid, i in info.items():
            prereqs = prereq_map.get(cid, [])
            gaps = [
                {"concept_id": p, "concept_label": info[p]["concept_label"]}
                for p in prereqs
                if p in info and info[p]["status"] == "UNRESOLVED_PREREQUISITE"
            ]
            prereq_recalls = {
                p: info[p]["recall_probability"]
                for p in prereqs if p in info and probe_able(info[p])
            }
            i["prereq_recalls"] = prereq_recalls
            i["prerequisite_gaps"] = gaps
            if probe_able(i):
                index[cid] = i

            if not probe_able(i) or i["mastered"]:
                continue
            if not i["is_new"] and i["recall_probability"] >= s.review_forgetting_threshold:
                continue
            i["priority_score"] = calculate_priority(
                i["recall_probability"],
                list(prereq_recalls.values()),
                centrality.get(cid, 1.0),
                i["hours"],
                kappa=s.centrality_kappa,
                recency_guard_hours=s.recency_guard_hours,
            )
            candidates.append(i)

        # Priority for detour-only prerequisites (not otherwise candidates).
        for i in index.values():
            i.setdefault("priority_score", 0.0)

        queue = build_review_queue(
            candidates, session_size, concept_index=index,
            delta=s.detour_delta, max_depth=s.max_detour_depth,
        )
        return [
            {
                "concept_id": item.concept_id,
                "concept_label": item.concept_label,
                "recall_probability": item.recall_probability,
                "priority_score": item.priority_score,
                "is_detour": item.is_detour,
                "detour_reason": item.detour_reason,
                "detour_for": item.detour_for,
                "is_new": item.is_new,
                "solo_level": item.solo_level,
                "complexity": item.complexity,
                "prerequisite_gaps": item.prerequisite_gaps,
            }
            for item in queue
        ]
