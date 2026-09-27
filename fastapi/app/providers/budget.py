"""AI budget ledger — the hard spend cap that protects credits.

Every paid call goes through:

    entry = await ledger.reserve(provider, model, task, worst_case_inr)
    ... make the call ...
    await ledger.record(entry, input_tokens, output_tokens, success, retries)

``reserve`` refuses (raises BudgetExhaustedError) when the worst-case cost
would push cumulative spend past ``ai_budget_inr``. Reserving the worst case
first means a runaway loop is halted *before* it spends, not after.

Spend = SUM(est_cost_inr) over provider_usage. A reserved row holds the
worst-case amount; ``record`` replaces it with the real (or best-estimate)
cost, so the running total self-corrects downward after each call.

🔒 Only accounting is stored — never note/answer/prompt text.

The ledger degrades safely: if no DB pool is configured (e.g. the standalone
health check), it operates in memory for the process so calls still work.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from uuid import UUID, uuid4

from psycopg.rows import dict_row

from app.providers.pricing import estimate_cost_inr
from app.providers.shared.errors import BudgetExhaustedError

logger = logging.getLogger(__name__)

# Fixed key for pg_advisory_xact_lock serializing reservations. Any bigint
# works as long as nothing else in the database uses the same key.
RESERVE_LOCK_KEY = 0x4B41495A4F55  # "KAIZOU"


async def _safe_rollback(conn) -> None:
    try:
        await conn.rollback()
    except Exception:  # pragma: no cover - connection already broken
        logger.exception("budget: rollback after failed reserve also failed")


@dataclass
class Reservation:
    id: UUID
    provider: str
    model: str
    task: str
    worst_case_inr: float
    in_db: bool


class BudgetLedger:
    """DB-backed spend cap and usage ledger."""

    def __init__(self, conn=None, *, settings=None):
        if settings is None:
            from app.config import get_settings
            settings = get_settings()
        self._conn = conn
        self._s = settings
        # In-memory fallback total when there is no DB connection.
        self._mem_spent_inr = 0.0

    @property
    def cap_inr(self) -> float:
        return self._s.ai_budget_inr

    async def spent_inr(self) -> float:
        """Cumulative estimated spend so far."""
        if self._conn is None:
            return self._mem_spent_inr
        # Alias the aggregate and read by name so this works regardless of the
        # connection's default row factory (the pool uses dict_row).
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute("SELECT COALESCE(SUM(est_cost_inr), 0) AS total FROM provider_usage")
            row = await cur.fetchone()
        return float(row["total"]) if row else 0.0

    async def remaining_inr(self) -> float:
        return max(0.0, self.cap_inr - await self.spent_inr())

    async def soft_limit_reached(self) -> bool:
        """True once spend passes the soft fraction — skip optional work."""
        return await self.spent_inr() >= self.cap_inr * self._s.ai_budget_soft_fraction

    async def reserve(self, provider: str, model: str, task: str, worst_case_inr: float) -> Reservation:
        """Hold worst-case budget for a call, or refuse if it exceeds the cap.

        Atomic across connections, workers, and processes: the check and the
        insert run in one transaction that first takes a transaction-scoped
        advisory lock, so concurrent reservers are serialized and each one's
        SUM sees every hold committed before it (READ COMMITTED takes a fresh
        snapshot per statement). The lock is released by the COMMIT/ROLLBACK
        at the end of this method, so no transaction is left open. Being
        transaction-scoped, it is also safe behind a transaction-mode pooler.

        One psycopg connection must not be shared by concurrently running
        tasks (psycopg has one transaction per connection); give each task
        its own pooled connection.
        """
        if not self._s.ai_ledger_enabled:
            return Reservation(uuid4(), provider, model, task, worst_case_inr, in_db=False)

        rid = uuid4()
        if self._conn is None:
            # Single event loop, no await between check and add → atomic.
            spent = self._mem_spent_inr
            if spent + worst_case_inr > self.cap_inr:
                raise BudgetExhaustedError(spent_inr=spent, cap_inr=self.cap_inr, needed_inr=worst_case_inr)
            self._mem_spent_inr += worst_case_inr
            return Reservation(rid, provider, model, task, worst_case_inr, in_db=False)

        try:
            async with self._conn.cursor(row_factory=dict_row) as cur:
                await cur.execute("SELECT pg_advisory_xact_lock(%s)", (RESERVE_LOCK_KEY,))
                await cur.execute("SELECT COALESCE(SUM(est_cost_inr), 0) AS total FROM provider_usage")
                row = await cur.fetchone()
                spent = float(row["total"]) if row else 0.0
                allowed = spent + worst_case_inr <= self.cap_inr
                if allowed:
                    await cur.execute(
                        """INSERT INTO provider_usage
                           (id, provider, model, task, est_cost_inr, reserved, success)
                           VALUES (%s, %s, %s, %s, %s, true, false)""",
                        (str(rid), provider, model, task, worst_case_inr),
                    )
            # Ends the transaction either way, releasing the advisory lock.
            await self._conn.commit()
        except BaseException:
            # DB error or cancellation mid-transaction: roll back so the lock
            # is released and the connection is not left in a failed txn.
            await _safe_rollback(self._conn)
            raise

        if not allowed:
            raise BudgetExhaustedError(spent_inr=spent, cap_inr=self.cap_inr, needed_inr=worst_case_inr)
        return Reservation(rid, provider, model, task, worst_case_inr, in_db=True)

    async def keep_worst_case(self, reservation: Reservation, *, reason: str) -> None:
        """Settle a hold at its worst-case amount (call may have been billed,
        but the real usage is unknown). Over-counting is the safe direction."""
        logger.warning("budget: keeping worst-case ₹%.4f for %s/%s (%s)",
                       reservation.worst_case_inr, reservation.provider, reservation.task, reason)
        await self.record(
            reservation, input_tokens=None, output_tokens=None,
            cost_inr=reservation.worst_case_inr, tokens_estimated=True, success=False,
        )

    async def record(
        self,
        reservation: Reservation,
        *,
        input_tokens: int | None,
        output_tokens: int | None,
        cost_inr: float | None = None,
        tokens_estimated: bool = False,
        success: bool = True,
        retry_count: int = 0,
    ) -> float:
        """Replace the reservation's worst-case hold with the real cost."""
        if cost_inr is None:
            cost_inr = estimate_cost_inr(
                reservation.model, input_tokens or 0, output_tokens or 0, self._s.usd_inr_rate,
            )
        if not self._s.ai_ledger_enabled:
            return cost_inr

        if not reservation.in_db:
            # In-memory: swap the worst-case hold for the real cost.
            self._mem_spent_inr += cost_inr - reservation.worst_case_inr
            return cost_inr

        async with self._conn.cursor() as cur:
            await cur.execute(
                """UPDATE provider_usage
                   SET est_cost_inr = %s, input_tokens = %s, output_tokens = %s,
                       tokens_estimated = %s, reserved = false,
                       success = %s, retry_count = %s
                   WHERE id = %s""",
                (cost_inr, input_tokens, output_tokens, tokens_estimated,
                 success, retry_count, str(reservation.id)),
            )
        await self._conn.commit()
        return cost_inr

    async def release(self, reservation: Reservation) -> None:
        """Drop a reservation whose call never happened (e.g. cache hit after reserve)."""
        if not self._s.ai_ledger_enabled:
            return
        if not reservation.in_db:
            self._mem_spent_inr -= reservation.worst_case_inr
            return
        async with self._conn.cursor() as cur:
            await cur.execute("DELETE FROM provider_usage WHERE id = %s", (str(reservation.id),))
        await self._conn.commit()
