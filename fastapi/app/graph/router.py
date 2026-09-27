"""Learning-path API (§5.23).

Express proxies here:
    GET /learning-paths/concept/{concept_id}?learner_id=...
    GET /learning-paths/cluster/{cluster_id}?learner_id=...

Path generation logic lives in app.graph.paths; this builds the REQUIRES
graph + concept metadata from the DB and serialises the result.
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
import psycopg
from psycopg.rows import dict_row

from app.dependencies import get_db
from app.graph.paths import generate_cluster_path, generate_concept_path, LearningPath
from app.graph.prerequisites import build_requires_forward
from app.memory.decay import calculate_recall_probability

router = APIRouter(prefix="/learning-paths", tags=["Learning Paths"])


async def _load_graph(db, learner_id: str):
    """Return (requires_edges parent->[children], concept_info by id)."""
    async with db.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            """SELECT c.id, c.canonical_label, c.c_current, c.status,
                      ms.half_life, ms.last_reviewed, ms.decay_exempt
               FROM concepts c
               LEFT JOIN memory_states ms
                 ON ms.concept_id = c.id AND ms.learner_id = c.learner_id
               WHERE c.learner_id = %s""",
            (learner_id,),
        )
        rows = await cur.fetchall()

        await cur.execute(
            "SELECT source_id, target_id, flag::text AS flag FROM edges "
            "WHERE learner_id = %s AND type = 'REQUIRES'",
            (learner_id,),
        )
        edges = await cur.fetchall()

    now = datetime.now(timezone.utc)
    concept_info: dict[str, dict] = {}
    for r in rows:
        cid = str(r["id"])
        recall = 1.0
        if r.get("last_reviewed") and r.get("half_life"):
            recall = calculate_recall_probability(
                r["last_reviewed"], r["half_life"], r.get("decay_exempt", False), now,
            )
        concept_info[cid] = {
            "label": r["canonical_label"],
            "complexity": r.get("c_current") or 1.0,
            "recall": recall,
            "is_locked": r.get("status") == "UNRESOLVED_PREREQUISITE",
        }

    # REQUIRES edge source_id -> target_id means source requires target
    # (target is the prerequisite). paths.py expects parent -> [children]
    # with parent = prerequisite (roots are foundations, sorted first), so
    # the DB orientation is inverted here. CYCLE_CONFLICT edges are excluded.
    requires = build_requires_forward(edges)
    return requires, concept_info


def _serialise(path: LearningPath) -> dict:
    def node(n):
        return {"concept_id": n.concept_id, "concept_label": n.concept_label,
                "depth": n.depth, "complexity": n.complexity, "recall": n.recall,
                "is_locked": n.is_locked, "is_target": n.is_target}
    return {
        "target_concept_id": path.target_concept_id,
        "ordered": [node(n) for n in path.ordered],
        "unordered": [node(n) for n in path.unordered],
        "has_cycle_break": path.has_cycle_break,
        "cycle_break_info": path.cycle_break_info,
    }


@router.get("/concept/{concept_id}")
async def concept_path(
    concept_id: str,
    learner_id: str = Query(...),
    db: psycopg.AsyncConnection = Depends(get_db),
):
    requires, info = await _load_graph(db, learner_id)
    if concept_id not in info:
        raise HTTPException(status_code=404, detail="Concept not found for learner")
    return _serialise(generate_concept_path(concept_id, requires, info))


@router.get("/cluster/{cluster_id}")
async def cluster_path(
    cluster_id: str,
    learner_id: str = Query(...),
    db: psycopg.AsyncConnection = Depends(get_db),
):
    try:
        UUID(cluster_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Cluster not found")
    async with db.cursor(row_factory=dict_row) as cur:
        # Join through clusters so a learner can only read their own cluster.
        await cur.execute(
            """SELECT cm.concept_id
               FROM cluster_members cm
               JOIN clusters cl ON cl.id = cm.cluster_id
               WHERE cm.cluster_id = %s AND cl.learner_id = %s""",
            (cluster_id, learner_id),
        )
        members = [str(r["concept_id"]) for r in await cur.fetchall()]
    if not members:
        raise HTTPException(status_code=404, detail="Cluster not found or has no members")
    requires, info = await _load_graph(db, learner_id)
    return _serialise(generate_cluster_path(members, requires, info))
