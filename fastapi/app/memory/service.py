"""Memory service — DB-backed memory state operations (§5.17–5.20).

Wraps the pure deterministic math functions with database I/O.
Ownership: FastAPI owns writes to memory_states (§12).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

import psycopg
from psycopg.rows import dict_row

from app.memory.decay import (
    calculate_recall_probability,
    update_half_life,
    calculate_initial_half_life,
    classify_recall_colour,
)
from app.memory.mastery import (
    check_mastery_procedural,
    check_mastery_claim_coverage,
    update_observed_complexity,
    can_exempt_decay,
)

logger = logging.getLogger(__name__)


class MemoryService:
    """Database-backed memory state management."""

    def __init__(self, conn: psycopg.AsyncConnection):
        self._conn = conn

    async def get_memory_state(
        self, concept_id: str, learner_id: str,
    ) -> Optional[dict]:
        """Fetch memory state with computed recall probability."""
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """SELECT ms.*, c.c_current AS complexity, c.shape, c.solo_level
                   FROM memory_states ms
                   JOIN concepts c ON c.id = ms.concept_id
                   WHERE ms.concept_id = %s AND ms.learner_id = %s""",
                (concept_id, learner_id),
            )
            row = await cur.fetchone()

        if not row:
            return None

        state = dict(row)
        # Compute recall on read (D-21)
        if state.get("last_reviewed"):
            state["recall"] = calculate_recall_probability(
                state["last_reviewed"],
                state["half_life"],
                state.get("decay_exempt", False),
            )
        else:
            state["recall"] = 1.0  # never reviewed = pre-first-probe

        state["colour"] = classify_recall_colour(
            state["recall"],
            is_decay_exempt=state.get("decay_exempt", False),
        )
        return state

    async def update_after_attempt(
        self,
        concept_id: str,
        learner_id: str,
        score: float,
        passed: bool,
        predicted_recall: float,
    ) -> dict:
        """Update memory state after a graded attempt.
        
        1. Update half-life based on score and predicted recall
        2. Update streak (reset on failure)
        3. Update attempts/passes counters
        4. Check mastery
        5. Update observed complexity (if enough attempts)
        """
        state = await self.get_memory_state(concept_id, learner_id)
        if not state:
            raise ValueError(f"No memory state for concept {concept_id}")

        complexity = state.get("complexity", 1.0)
        h_current = state["half_life"]
        streak = state["streak"]
        attempts = state["attempts"]
        passes = state["passes"]

        # Update half-life
        h_new = update_half_life(h_current, score, predicted_recall, complexity)

        # Update streak
        if passed:
            new_streak = streak + 1
            new_passes = passes + 1
        else:
            new_streak = 0
            new_passes = passes

        new_attempts = attempts + 1

        # Write updates
        async with self._conn.cursor() as cur:
            await cur.execute(
                """
                UPDATE memory_states
                SET half_life = %s,
                    last_reviewed = NOW(),
                    streak = %s,
                    attempts = %s,
                    passes = %s
                WHERE concept_id = %s AND learner_id = %s
                """,
                (h_new, new_streak, new_attempts, new_passes,
                 concept_id, learner_id),
            )

            # Update observed complexity
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
        }

    async def get_review_queue(
        self, learner_id: str, session_size: int = 8,
    ) -> list[dict]:
        """Build the review queue for a learner (§5.20).
        
        Fetches all active concepts with memory states,
        computes priorities, applies prerequisite detours.
        """
        from app.memory.scheduler import calculate_priority, build_review_queue

        now = datetime.now(timezone.utc)

        # Fetch all concepts with memory states
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT c.id AS concept_id, c.canonical_label AS concept_label,
                       c.c_current AS complexity, c.solo_level,
                       ms.half_life, ms.last_reviewed, ms.decay_exempt,
                       ms.streak, ms.mastered_at
                FROM concepts c
                JOIN memory_states ms ON ms.concept_id = c.id AND ms.learner_id = c.learner_id
                WHERE c.learner_id = %s
                  AND c.status = 'VERIFIED_CONCEPT'
                  AND c.probe_eligible = true
                  AND ms.decay_exempt = false
                  AND ms.mastered_at IS NULL
                """,
                (learner_id,),
            )
            concepts = await cur.fetchall()

        if not concepts:
            return []

        # Fetch prerequisite edges
        concept_ids = [str(c["concept_id"]) for c in concepts]
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT source_id, target_id FROM edges
                WHERE learner_id = %s AND type = 'REQUIRES'
                """,
                (learner_id,),
            )
            prereq_edges = await cur.fetchall()

        # Build prereq map
        prereq_map: dict[str, list[str]] = {}
        for edge in prereq_edges:
            target = str(edge["target_id"])
            source = str(edge["source_id"])
            prereq_map.setdefault(target, []).append(source)

        # Compute recalls and priorities
        candidates = []
        recall_cache: dict[str, float] = {}

        for concept in concepts:
            cid = str(concept["concept_id"])
            if concept["last_reviewed"]:
                recall = calculate_recall_probability(
                    concept["last_reviewed"],
                    concept["half_life"],
                    concept.get("decay_exempt", False),
                    now,
                )
            else:
                recall = 1.0
            recall_cache[cid] = recall

        for concept in concepts:
            cid = str(concept["concept_id"])
            recall = recall_cache[cid]

            # Get prerequisite recalls
            prereqs = prereq_map.get(cid, [])
            prereq_recalls = {
                pid: recall_cache.get(pid, 1.0) for pid in prereqs
            }

            # Hours since last attempt
            if concept["last_reviewed"]:
                hours = (now - concept["last_reviewed"]).total_seconds() / 3600
            else:
                hours = 999.0

            priority = calculate_priority(
                recall, list(prereq_recalls.values()), 0.5, hours,
            )

            candidates.append({
                "concept_id": cid,
                "concept_label": concept["concept_label"],
                "recall_probability": recall,
                "priority_score": priority,
                "solo_level": concept.get("solo_level", "Prestructural"),
                "complexity": concept.get("complexity", 1.0),
                "prereq_recalls": prereq_recalls,
            })

        queue = build_review_queue(candidates, session_size)
        return [
            {
                "concept_id": item.concept_id,
                "concept_label": item.concept_label,
                "recall_probability": item.recall_probability,
                "priority_score": item.priority_score,
                "is_detour": item.is_detour,
                "detour_reason": item.detour_reason,
                "solo_level": item.solo_level,
                "complexity": item.complexity,
            }
            for item in queue
        ]
