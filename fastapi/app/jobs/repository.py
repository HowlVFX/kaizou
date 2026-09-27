"""Job repository — DB-backed job queue (§5.26, D-13).

🔒 No Redis/Celery. Jobs live in PostgreSQL.
Worker claiming uses SELECT ... FOR UPDATE SKIP LOCKED.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID, uuid4

import psycopg
from psycopg.rows import dict_row

logger = logging.getLogger(__name__)

# One job type for both the weekly schedule and post-ingestion reclusters, so
# the per-learner pending-job dedupe covers both.
CLUSTER_JOB_TYPE = "WEEKLY_CLUSTER"


class JobRepository:
    """CRUD and worker operations on the jobs table."""

    def __init__(self, conn: psycopg.AsyncConnection):
        self._conn = conn

    async def create_job(
        self,
        job_type: str,
        payload: dict,
        run_after: Optional[datetime] = None,
        max_attempts: int = 3,
    ) -> UUID:
        """Insert a new job into the queue."""
        job_id = uuid4()
        run_at = run_after or datetime.now(timezone.utc)
        async with self._conn.cursor() as cur:
            await cur.execute(
                """
                INSERT INTO jobs (id, job_type, payload, status, run_after, max_attempts, created_at)
                VALUES (%s, %s, %s::jsonb, 'PENDING', %s, %s, NOW())
                """,
                (str(job_id), job_type, psycopg.types.json.Jsonb(payload), run_at, max_attempts),
            )
        await self._conn.commit()
        return job_id

    async def create_job_if_absent(
        self,
        job_type: str,
        payload: dict,
        dedupe_on: dict,
        run_after: Optional[datetime] = None,
        max_attempts: int = 3,
        commit: bool = True,
    ) -> Optional[UUID]:
        """Insert a job unless a PENDING one of the same type matches ``dedupe_on``.

        ``dedupe_on`` is matched by JSONB containment against the pending
        job's payload (e.g. {"learner_id": "..."}). Returns the new job id,
        or None when a pending duplicate already exists. With commit=False the
        insert joins the caller's transaction (used by ingestion so the job
        only exists if the ingestion commits).
        """
        job_id = uuid4()
        run_at = run_after or datetime.now(timezone.utc)
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                INSERT INTO jobs (id, job_type, payload, status, run_after, max_attempts, created_at)
                SELECT %s::uuid, %s::text, %s::jsonb, 'PENDING'::job_status,
                       %s::timestamptz, %s::integer, NOW()
                WHERE NOT EXISTS (
                    SELECT 1 FROM jobs
                    WHERE job_type = %s AND status = 'PENDING' AND payload @> %s::jsonb
                )
                RETURNING id
                """,
                (
                    str(job_id), job_type, psycopg.types.json.Jsonb(payload), run_at,
                    max_attempts, job_type, psycopg.types.json.Jsonb(dedupe_on),
                ),
            )
            row = await cur.fetchone()
        if commit:
            await self._conn.commit()
        return job_id if row else None

    async def enqueue_recluster(self, learner_id: str, commit: bool = False) -> Optional[UUID]:
        """Enqueue a per-learner cluster job unless one is already pending."""
        from datetime import timedelta
        from app.config import get_settings
        delay = get_settings().recluster_delay_seconds
        return await self.create_job_if_absent(
            CLUSTER_JOB_TYPE,
            {"learner_id": str(learner_id), "reason": "ingestion"},
            dedupe_on={"learner_id": str(learner_id)},
            run_after=datetime.now(timezone.utc) + timedelta(seconds=delay),
            commit=commit,
        )

    async def ensure_periodic_job(
        self, job_type: str, payload: dict, period_seconds: int,
    ) -> Optional[UUID]:
        """Enqueue ``job_type`` unless one is pending/running or was created
        within the last ``period_seconds``. Commits. Returns the new id or None.
        """
        job_id = uuid4()
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                INSERT INTO jobs (id, job_type, payload, status, run_after, max_attempts, created_at)
                SELECT %s::uuid, %s::text, %s::jsonb, 'PENDING'::job_status, NOW(), 3, NOW()
                WHERE NOT EXISTS (
                    SELECT 1 FROM jobs
                    WHERE job_type = %s AND payload @> %s::jsonb
                      AND (status IN ('PENDING', 'RUNNING')
                           OR created_at > NOW() - make_interval(secs => %s))
                )
                RETURNING id
                """,
                (
                    str(job_id), job_type, psycopg.types.json.Jsonb(payload),
                    job_type, psycopg.types.json.Jsonb(payload), period_seconds,
                ),
            )
            row = await cur.fetchone()
        await self._conn.commit()
        return job_id if row else None

    async def claim_next_job(self, worker_id: str) -> Optional[dict]:
        """Claim the next available job using SELECT ... FOR UPDATE SKIP LOCKED.
        
        Returns the claimed job dict or None if no jobs available.
        """
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                UPDATE jobs
                SET status = 'RUNNING',
                    locked_by = %s,
                    locked_at = NOW(),
                    attempts = attempts + 1
                WHERE id = (
                    SELECT id FROM jobs
                    WHERE status = 'PENDING'
                      AND run_after <= NOW()
                      AND attempts < max_attempts
                    ORDER BY run_after ASC
                    LIMIT 1
                    FOR UPDATE SKIP LOCKED
                )
                RETURNING *
                """,
                (worker_id,),
            )
            row = await cur.fetchone()
        await self._conn.commit()
        return dict(row) if row else None

    async def complete_job(self, job_id: UUID) -> None:
        """Mark a job as completed."""
        async with self._conn.cursor() as cur:
            await cur.execute(
                """
                UPDATE jobs
                SET status = 'COMPLETED',
                    completed_at = NOW()
                WHERE id = %s
                """,
                (str(job_id),),
            )
        await self._conn.commit()

    async def fail_job(self, job_id: UUID, error: str) -> None:
        """Mark a job as failed. Will be retried if attempts < max_attempts."""
        async with self._conn.cursor() as cur:
            await cur.execute(
                """
                UPDATE jobs
                SET status = CASE
                        WHEN attempts >= max_attempts THEN 'FAILED'::job_status
                        ELSE 'PENDING'::job_status
                    END,
                    -- Exponential backoff: 30s, 60s, 120s, ... (attempts already incremented on claim)
                    run_after = NOW() + make_interval(secs => 30 * power(2, GREATEST(attempts - 1, 0))),
                    last_error = %s,
                    locked_by = NULL,
                    locked_at = NULL
                WHERE id = %s
                """,
                (error, str(job_id)),
            )
        await self._conn.commit()

    async def get_job_status(self, job_id: UUID) -> Optional[dict]:
        """Get the current status of a job."""
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                "SELECT * FROM jobs WHERE id = %s",
                (str(job_id),),
            )
            row = await cur.fetchone()
        return dict(row) if row else None

    async def get_pending_jobs(
        self,
        job_type: Optional[str] = None,
        limit: int = 50,
    ) -> list[dict]:
        """List pending jobs, optionally filtered by type."""
        async with self._conn.cursor(row_factory=dict_row) as cur:
            if job_type:
                await cur.execute(
                    """
                    SELECT * FROM jobs
                    WHERE status = 'PENDING' AND job_type = %s
                    ORDER BY run_after ASC
                    LIMIT %s
                    """,
                    (job_type, limit),
                )
            else:
                await cur.execute(
                    """
                    SELECT * FROM jobs
                    WHERE status = 'PENDING'
                    ORDER BY run_after ASC
                    LIMIT %s
                    """,
                    (limit,),
                )
            rows = await cur.fetchall()
        return [dict(r) for r in rows]
