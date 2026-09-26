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
                        WHEN attempts >= max_attempts THEN 'FAILED'
                        ELSE 'PENDING'
                    END,
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
