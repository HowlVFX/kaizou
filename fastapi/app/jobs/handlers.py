"""Job handler registry (§12.3).

Maps job types to their handler coroutines.
Each handler receives the job payload dict and a DB connection.
"""
from __future__ import annotations

import logging
from typing import Any, Callable, Coroutine

import psycopg
from psycopg.rows import dict_row

logger = logging.getLogger(__name__)


async def handle_ingest_job(payload: dict, conn: psycopg.AsyncConnection) -> None:
    """Run the ingestion pipeline for a note.
    
    Pipeline: extract claims → resolve identity → compute embeddings →
              create edges → update complexity → enqueue validation.
    """
    from app.ingestion.service import IngestionService
    
    service = IngestionService(conn)
    note_id = payload["note_id"]
    learner_id = payload["learner_id"]
    await service.ingest_note(note_id, learner_id)


async def handle_weekly_cluster_job(payload: dict, conn: psycopg.AsyncConnection) -> None:
    """Run cluster detection for a learner (weekly or after ingestion).

    Pipeline: build graph → Louvain (γ=1.0) → sub-clusters (γ=1.6, |K|>=12)
    → lineage vs ACTIVE clusters → persist clusters / cluster_members /
    cluster_lineage. Naming is deterministic (no LLM).
    Payload without learner_id re-clusters every learner with concepts.
    """
    from app.config import get_settings
    from app.graph.cluster_service import recluster_learner

    settings = get_settings()
    learner_id = payload.get("learner_id")
    if learner_id:
        learner_ids = [str(learner_id)]
    else:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute("SELECT DISTINCT learner_id FROM concepts")
            learner_ids = [str(r["learner_id"]) for r in await cur.fetchall()]

    failed: list[str] = []
    for lid in learner_ids:
        try:
            result = await recluster_learner(conn, lid, settings)
            logger.info("Cluster run for learner %s: %s", lid, result)
        except Exception as e:
            # One learner's failure must not block the rest of an all-learner run.
            logger.error("Cluster run failed for learner %s: %s", lid, e, exc_info=True)
            await conn.rollback()
            failed.append(lid)
    if failed:
        raise RuntimeError(f"Cluster run failed for {len(failed)} learner(s)")


async def handle_compute_aggregates_job(payload: dict, conn: psycopg.AsyncConnection) -> None:
    """Compute portal aggregate metrics.

    Aggregates are written to portal_aggregates with privacy floor N=5.
    No free-text columns (D-10). Payload: {"window_days": int} (default 30).
    """
    from app.config import get_settings
    from app.evaluation.aggregates import compute_portal_aggregates

    n = await compute_portal_aggregates(conn, payload, get_settings())
    logger.info("Computed %d portal aggregate rows", n)


async def handle_evaluation_run_job(payload: dict, conn: psycopg.AsyncConnection) -> None:
    """Evaluation metrics from live data: memory calibration + probe discrimination.

    Cohen's kappa needs hand-labelled bands, which the schema does not store,
    so it is not computed here.
    """
    from app.config import get_settings
    from app.evaluation.aggregates import run_evaluation_metrics

    n = await run_evaluation_metrics(conn, payload, get_settings())
    logger.info("Evaluation run wrote %d metric rows", n)


# --- Handler Registry ---
JOB_HANDLERS: dict[str, Callable[..., Coroutine[Any, Any, None]]] = {
    "INGEST": handle_ingest_job,
    "WEEKLY_CLUSTER": handle_weekly_cluster_job,
    "COMPUTE_AGGREGATES": handle_compute_aggregates_job,
    "EVALUATION_RUN": handle_evaluation_run_job,
}
