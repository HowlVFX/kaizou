"""Job dispatcher — enqueues jobs for background processing (§12.3)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

import psycopg

from app.jobs.repository import JobRepository


class JobDispatcher:
    """Enqueues jobs into the DB-backed queue."""

    def __init__(self, conn: psycopg.AsyncConnection):
        self._repo = JobRepository(conn)

    async def dispatch(
        self,
        job_type: str,
        payload: dict,
        run_after: Optional[datetime] = None,
    ) -> UUID:
        """Enqueue a generic job."""
        return await self._repo.create_job(job_type, payload, run_after)

    async def dispatch_ingest(self, note_id: UUID, learner_id: UUID) -> UUID:
        """Enqueue a note ingestion job."""
        return await self._repo.create_job(
            job_type="INGEST",
            payload={"note_id": str(note_id), "learner_id": str(learner_id)},
        )

    async def dispatch_weekly_cluster(self, learner_id: UUID) -> UUID:
        """Enqueue a weekly cluster detection job."""
        return await self._repo.create_job(
            job_type="WEEKLY_CLUSTER",
            payload={"learner_id": str(learner_id)},
        )

    async def dispatch_compute_aggregates(self) -> UUID:
        """Enqueue a portal aggregate computation job."""
        return await self._repo.create_job(
            job_type="COMPUTE_AGGREGATES",
            payload={},
        )

    async def dispatch_evaluation_run(self, config: dict) -> UUID:
        """Enqueue an evaluation harness run."""
        return await self._repo.create_job(
            job_type="EVALUATION_RUN",
            payload=config,
        )
