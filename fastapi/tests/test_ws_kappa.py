"""WS-kappa: Cohen's κ data path (aggregates) + capability_events logging.

Pure functions and in-memory fakes only — no DB, no AI calls (§5.25.1).
"""
from __future__ import annotations

import asyncio

from app.config import Settings
from app.evaluation.aggregates import compute_cohens_kappa
from app.evaluation.metrics import calculate_cohens_kappa


# --------------------------------------------------------------------------
# κ aggregation from (machine, human) band pairs
# --------------------------------------------------------------------------
def _labels(pairs):
    return [{"machine_band": m, "human_band": h} for m, h in pairs]


def test_compute_cohens_kappa_perfect_agreement_unsuppressed():
    # 20 pairs, all agree → κ = 1.0, not suppressed at min_labels=20.
    rows = _labels([("Full", "Full")] * 10 + [("Shallow", "Shallow")] * 10)
    r = compute_cohens_kappa(rows, min_labels=20, floor=5)
    assert r["metric_key"] == "cohens_kappa"
    assert r["suppressed"] is False
    assert r["sample_size"] == 20
    assert abs(r["value"] - 1.0) < 1e-9
    assert r["dimensions"] == {}  # empty → portal read picks it up


def test_compute_cohens_kappa_matches_metric_helper():
    pairs = (
        [("Full", "Full")] * 8
        + [("Shallow", "Full")] * 3
        + [("Shallow", "Shallow")] * 7
        + [("Incomplete", "Not_Yet_Engaged")] * 4
    )
    rows = _labels(pairs)
    r = compute_cohens_kappa(rows, min_labels=20, floor=5)
    expected = calculate_cohens_kappa([m for m, _ in pairs], [h for _, h in pairs])
    assert r["suppressed"] is False
    assert abs(r["value"] - expected) < 1e-9


def test_compute_cohens_kappa_below_min_labels_suppressed():
    rows = _labels([("Full", "Full")] * 10)  # 10 < 20
    r = compute_cohens_kappa(rows, min_labels=20, floor=5)
    assert r["suppressed"] is True
    assert r["value"] == 0.0
    assert r["sample_size"] == 10


def test_compute_cohens_kappa_ignores_unpaired_labels():
    # Rows without a machine band (attempt band missing) are dropped before κ.
    rows = _labels([("Full", "Full")] * 20) + [
        {"machine_band": None, "human_band": "Shallow"},
        {"machine_band": "Full", "human_band": None},
    ]
    r = compute_cohens_kappa(rows, min_labels=20, floor=5)
    assert r["sample_size"] == 20  # only the fully-paired rows count
    assert r["suppressed"] is False


def test_compute_cohens_kappa_privacy_floor_dominates_when_higher():
    # A tiny min_labels never lets κ escape below the privacy floor.
    rows = _labels([("Full", "Full")] * 4)  # 4 < floor 5
    r = compute_cohens_kappa(rows, min_labels=1, floor=5)
    assert r["suppressed"] is True
    assert r["sample_size"] == 4


def test_kappa_min_labels_default_setting():
    assert Settings().kappa_min_labels == 20


# --------------------------------------------------------------------------
# run_evaluation_metrics wires κ into the written rows
# --------------------------------------------------------------------------
class _EvalCursor:
    def __init__(self, db):
        self.db, self.rows = db, []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def fetchall(self):
        return self.rows

    async def execute(self, sql, params=()):
        s = " ".join(sql.split())
        if s.startswith("INSERT INTO portal_aggregates"):
            self.db.inserted.append(params)
        elif "FROM attempt_gold_labels g" in s:
            self.rows = self.db.labels
        elif "predicted_recall IS NOT NULL" in s:
            self.rows = []  # no calibration data
        else:
            self.rows = []  # no probe-discrimination attempts


class _EvalDB:
    def __init__(self, labels):
        self.labels = labels
        self.inserted = []

    def cursor(self, *a, **k):
        return _EvalCursor(self)

    async def commit(self):
        pass


def test_run_evaluation_metrics_writes_cohens_kappa_row():
    from app.evaluation.aggregates import run_evaluation_metrics

    async def run():
        labels = _labels([("Full", "Full")] * 15 + [("Shallow", "Shallow")] * 10)
        db = _EvalDB(labels)
        n = await run_evaluation_metrics(db, {"window_days": 7}, Settings())
        assert n == len(db.inserted)
        kappa_rows = [p for p in db.inserted if p[0] == "cohens_kappa"]
        assert len(kappa_rows) == 1
        # params: (metric_key, window_start, window_end, value, sample_size,
        #          suppressed, dimensions)
        assert kappa_rows[0][4] == 25          # sample_size
        assert kappa_rows[0][5] is False       # not suppressed
        assert abs(kappa_rows[0][3] - 1.0) < 1e-9

    asyncio.run(run())


# --------------------------------------------------------------------------
# capability_events insert helper (probes.service._log_capability_event)
# --------------------------------------------------------------------------
class _CapCursor:
    def __init__(self, db):
        self.db = db

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def execute(self, sql, params=()):
        self.db.executed.append((" ".join(sql.split()), params))


class _CapConn:
    def __init__(self):
        self.executed = []

    def cursor(self, *a, **k):
        return _CapCursor(self)

    async def commit(self):
        pass


def _service(conn):
    from app.probes.service import ProbeService

    return ProbeService(conn, settings=Settings())


def test_log_capability_event_with_attempt_id_dedupes():
    async def run():
        conn = _CapConn()
        svc = _service(conn)
        await svc._log_capability_event(
            "learner-1", "concept-1", "PERTURBATION_PASS",
            {"delta_score": 0.8}, attempt_id="attempt-9",
        )
        assert len(conn.executed) == 1
        sql, params = conn.executed[0]
        assert "INSERT INTO capability_events" in sql
        assert "NOT EXISTS" in sql  # idempotent guard
        assert params[0] == "learner-1"
        assert params[1] == "concept-1"
        assert params[2] == "attempt-9"
        assert params[3] == "PERTURBATION_PASS"

    asyncio.run(run())


def test_log_capability_event_solo_advance_no_attempt_id():
    async def run():
        conn = _CapConn()
        svc = _service(conn)
        await svc._log_capability_event(
            "learner-1", "concept-1", "SOLO_ADVANCE",
            {"from": "Unistructural", "to": "Multistructural"},
        )
        sql, params = conn.executed[0]
        assert "INSERT INTO capability_events" in sql
        assert "attempt_id" not in sql.split("SELECT")[0]  # attempt_id omitted
        assert params[2] == "SOLO_ADVANCE"

    asyncio.run(run())
