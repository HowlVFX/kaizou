"""DB-backed job worker (§12.3, D-13).

🔒 No Redis/Celery. Single-process worker that polls the jobs table.
Uses SELECT ... FOR UPDATE SKIP LOCKED for safe concurrent claiming.
"""
from __future__ import annotations

import asyncio
import logging
import os
from uuid import UUID

import psycopg

from app.jobs.handlers import JOB_HANDLERS
from app.jobs.repository import JobRepository

logger = logging.getLogger(__name__)


class JobWorker:
    """Background job worker."""

    def __init__(
        self,
        conn: psycopg.AsyncConnection,
        worker_id: str | None = None,
        poll_interval: float = 5.0,
    ):
        self._conn = conn
        self._repo = JobRepository(conn)
        self._worker_id = worker_id or f"worker-{os.getpid()}"
        self._poll_interval = poll_interval
        self._running = False

    async def start(self) -> None:
        """Main worker loop: poll → claim → execute → repeat."""
        self._running = True
        logger.info("Job worker %s starting", self._worker_id)

        while self._running:
            try:
                job = await self._repo.claim_next_job(self._worker_id)
                if job:
                    await self._execute_job(job)
                else:
                    await asyncio.sleep(self._poll_interval)
            except Exception as e:
                logger.error("Worker loop error: %s", e, exc_info=True)
                await asyncio.sleep(self._poll_interval)

    async def stop(self) -> None:
        """Signal the worker to stop."""
        self._running = False
        logger.info("Job worker %s stopping", self._worker_id)

    async def _execute_job(self, job: dict) -> None:
        """Dispatch job to the appropriate handler."""
        job_id = job["id"]
        job_type = job["job_type"]
        payload = job.get("payload", {})

        handler = JOB_HANDLERS.get(job_type)
        if not handler:
            logger.error("No handler for job type: %s", job_type)
            await self._repo.fail_job(UUID(str(job_id)), f"Unknown job type: {job_type}")
            return

        try:
            logger.info("Executing job %s (type=%s)", job_id, job_type)
            await handler(payload, self._conn)
            await self._repo.complete_job(UUID(str(job_id)))
            logger.info("Job %s completed", job_id)
        except Exception as e:
            logger.error("Job %s failed: %s", job_id, e, exc_info=True)
            await self._repo.fail_job(UUID(str(job_id)), str(e))
