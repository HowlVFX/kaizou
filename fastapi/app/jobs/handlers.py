"""Job handler registry (§12.3).

Maps job types to their handler coroutines.
Each handler receives the job payload dict and a DB connection.
"""
from __future__ import annotations

import logging
from typing import Any, Callable, Coroutine

import psycopg

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
    """Run weekly cluster detection for a learner.
    
    Pipeline: build graph → Louvain → name clusters → track lineage.
    """
    logger.info("Running weekly cluster job for learner %s", payload.get("learner_id"))
    # TODO: implement full pipeline
    # 1. Fetch all concepts and edges for learner
    # 2. Build weighted graph
    # 3. Run Louvain at γ=1.0
    # 4. Run sub-clustering at γ=1.6 for large communities
    # 5. Name clusters via LLM
    # 6. Track lineage against previous week
    # 7. Persist results


async def handle_compute_aggregates_job(payload: dict, conn: psycopg.AsyncConnection) -> None:
    """Compute portal aggregate metrics.
    
    Aggregates are written to portal_aggregates with privacy floor N=5.
    No free-text columns (D-10).
    """
    logger.info("Computing portal aggregates")
    # TODO: implement aggregate computation
    # Metrics: recall distribution, mastery rates, grader reliability,
    # probe discrimination, source coverage, etc.


async def handle_evaluation_run_job(payload: dict, conn: psycopg.AsyncConnection) -> None:
    """Run evaluation harness."""
    logger.info("Running evaluation harness")
    # TODO: implement evaluation pipeline


# --- Handler Registry ---
JOB_HANDLERS: dict[str, Callable[..., Coroutine[Any, Any, None]]] = {
    "INGEST": handle_ingest_job,
    "WEEKLY_CLUSTER": handle_weekly_cluster_job,
    "COMPUTE_AGGREGATES": handle_compute_aggregates_job,
    "EVALUATION_RUN": handle_evaluation_run_job,
}
