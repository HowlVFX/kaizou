"""DB-backed job worker (§12.3, D-13).

🔒 No Redis/Celery. Single-process worker that polls the jobs table.
Uses SELECT ... FOR UPDATE SKIP LOCKED for safe concurrent claiming.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from uuid import UUID

import psycopg

from app.jobs.handlers import JOB_HANDLERS
from app.jobs.repository import CLUSTER_JOB_TYPE, JobRepository

logger = logging.getLogger(__name__)

DAY = 24 * 3600
# (job_type, payload, period_seconds). None of these make AI calls.
PERIODIC_JOBS: list[tuple[str, dict, int]] = [
    (CLUSTER_JOB_TYPE, {"scope": "all"}, 7 * DAY),   # weekly re-cluster, all learners
    ("COMPUTE_AGGREGATES", {"scope": "all"}, DAY),
    ("EVALUATION_RUN", {"scope": "all"}, 7 * DAY),
]
SCHEDULE_CHECK_SECONDS = 3600.0


class JobWorker:
    """Background job worker."""

    def __init__(
        self,
        conn: psycopg.AsyncConnection,
        worker_id: str | None = None,
        poll_interval: float = 5.0,
        schedule_periodic: bool = True,
    ):
        self._conn = conn
        self._repo = JobRepository(conn)
        self._worker_id = worker_id or f"worker-{os.getpid()}"
        self._poll_interval = poll_interval
        self._running = False
        self._schedule_periodic = schedule_periodic
        self._last_schedule_check = 0.0

    async def _maybe_schedule_periodic(self) -> None:
        """Enqueue periodic jobs (deduped in SQL, so several workers are safe)."""
        if not self._schedule_periodic:
            return
        now = time.monotonic()
        if self._last_schedule_check and now - self._last_schedule_check < SCHEDULE_CHECK_SECONDS:
            return
        self._last_schedule_check = now
        for job_type, payload, period in PERIODIC_JOBS:
            job_id = await self._repo.ensure_periodic_job(job_type, payload, period)
            if job_id:
                logger.info("Scheduled periodic job %s (%s)", job_type, job_id)

    async def start(self) -> None:
        """Main worker loop: poll → claim → execute → repeat."""
        self._running = True
        logger.info("Job worker %s starting", self._worker_id)

        while self._running:
            try:
                await self._maybe_schedule_periodic()
                job = await self._repo.claim_next_job(self._worker_id)
                if job:
                    await self._execute_job(job)
                else:
                    await asyncio.sleep(self._poll_interval)
            except Exception as e:
                logger.error("Worker loop error: %s", e, exc_info=True)
                await self._safe_rollback()
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
            # The handler may have left the transaction aborted; clear it so
            # fail_job's UPDATE can run instead of raising InFailedSqlTransaction.
            await self._safe_rollback()
            await self._repo.fail_job(UUID(str(job_id)), str(e)[:2000])

    async def _safe_rollback(self) -> None:
        """Roll back the current transaction, ignoring errors on a dead connection."""
        try:
            await self._conn.rollback()
        except Exception as rb_err:  # connection may already be closed
            logger.warning("Rollback failed: %s", rb_err)
