"""Portal aggregates and evaluation metrics jobs (§5.25, §14, D-10).

Both jobs are deterministic SQL + arithmetic — no AI calls.

Privacy (D-10):
    * portal_aggregates has no free-text columns; ``dimensions`` only holds
      enum-valued keys (band, discrimination class).
    * sample_size is the number of DISTINCT learners behind a value. When it
      is below ``privacy_floor`` (N=5) the row is written with
      suppressed=true and value=0, so the real value never leaves the DB.

Metric keys written:
    aggregates job: pass_rate, mean_composite_score, band_share{band},
        mastery_rate, mean_half_life, mean_source_coverage,
        contradiction_rate, probe_leak_rate, cluster_modularity_mean
    evaluation job: brier_score, ece, auc (memory calibration from
        attempts.predicted_recall vs passed), probe_discrimination_share
        {discrimination}, probes_evaluated, cohens_kappa (grading agreement
        from attempt_gold_labels joined attempts, §5.25.1)
"""
from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone

import psycopg
import psycopg.types.json
from psycopg.rows import dict_row

from app.evaluation.metrics import (
    calculate_auc,
    calculate_brier_score,
    calculate_cohens_kappa,
    calculate_ece,
    calculate_point_biserial,
    classify_probe_discrimination,
)

logger = logging.getLogger(__name__)

DEFAULT_WINDOW_DAYS = 30


def privacy_row(metric_key: str, value: float | None, sample_size: int, floor: int,
                dimensions: dict | None = None) -> dict:
    """Build a portal_aggregates row, suppressing values below the floor."""
    suppressed = sample_size < floor or value is None
    return {
        "metric_key": metric_key,
        "value": 0.0 if suppressed else float(value),
        "sample_size": int(sample_size),
        "suppressed": suppressed,
        "dimensions": dimensions or {},
    }


def compute_calibration(rows: list[dict], floor: int) -> list[dict]:
    """Brier / ECE / AUC from attempts with a predicted recall.

    rows: [{'learner_id', 'predicted_recall', 'passed'}]
    """
    probs = [float(r["predicted_recall"]) for r in rows]
    outcomes = [bool(r["passed"]) for r in rows]
    n_learners = len({str(r["learner_id"]) for r in rows})
    if not rows:
        return [privacy_row(k, None, 0, floor) for k in ("brier_score", "ece", "auc")]
    pos = [p for p, o in zip(probs, outcomes) if o]
    neg = [p for p, o in zip(probs, outcomes) if not o]
    return [
        privacy_row("brier_score", calculate_brier_score(probs, outcomes), n_learners, floor),
        privacy_row("ece", calculate_ece(probs, outcomes), n_learners, floor),
        privacy_row("auc", calculate_auc(pos, neg) if pos and neg else None, n_learners, floor),
    ]


def compute_probe_discrimination(rows: list[dict], floor: int) -> list[dict]:
    """Share of probes per discrimination class (§5.16).

    rows: [{'learner_id', 'probe_id', 'concept_id', 'passed', 'composite_score',
            'submitted_at'}]

    For each probe answered by >= floor distinct learners: binary outcome =
    the learner's latest attempt on it; continuous score = that learner's
    mean composite on OTHER concepts. Probes without enough learners (or
    whose learners have no other-concept attempts) are not classified.
    """
    by_learner_concept: dict[tuple[str, str], list[float]] = defaultdict(list)
    latest: dict[tuple[str, str], dict] = {}
    for r in rows:
        lid, pid, cid = str(r["learner_id"]), str(r["probe_id"]), str(r["concept_id"])
        by_learner_concept[(lid, cid)].append(float(r["composite_score"]))
        key = (pid, lid)
        if key not in latest or r["submitted_at"] >= latest[key]["submitted_at"]:
            latest[key] = {**r, "learner_id": lid, "concept_id": cid}

    per_probe: dict[str, list[dict]] = defaultdict(list)
    for (pid, _lid), r in latest.items():
        per_probe[pid].append(r)

    classes: dict[str, int] = defaultdict(int)
    learners_used: set[str] = set()
    for pid, attempts in per_probe.items():
        outcomes, others = [], []
        for a in attempts:
            other_scores = [
                s for (lid, cid), scores in by_learner_concept.items()
                if lid == a["learner_id"] and cid != a["concept_id"]
                for s in scores
            ]
            if not other_scores:
                continue
            outcomes.append(bool(a["passed"]))
            others.append(sum(other_scores) / len(other_scores))
        if len(outcomes) < floor:
            continue
        classes[classify_probe_discrimination(calculate_point_biserial(outcomes, others))] += 1
        learners_used.update(a["learner_id"] for a in attempts)

    total = sum(classes.values())
    out = [privacy_row("probes_evaluated", float(total), len(learners_used), floor)]
    for cls in ("acceptable", "weak", "retire", "inverted_defect"):
        share = classes.get(cls, 0) / total if total else None
        out.append(privacy_row("probe_discrimination_share", share, len(learners_used), floor,
                               {"discrimination": cls}))
    return out


def compute_cohens_kappa(rows: list[dict], min_labels: int, floor: int) -> dict:
    """Grading agreement κ from hand-labelled attempts (§5.25.1).

    rows: [{'machine_band', 'human_band'}] — one per labelled attempt whose
    machine band is present. κ is written as a single ``cohens_kappa`` row
    (no dimensions, so the portal read picks it up) with sample_size = the
    number of labelled pairs. Suppressed below ``min_labels`` (too small a
    sample) — the effective threshold is max(min_labels, floor) so the row is
    never surfaced below the privacy floor either.
    """
    threshold = max(int(min_labels), int(floor))
    pairs = [
        (str(r["machine_band"]), str(r["human_band"]))
        for r in rows
        if r.get("machine_band") is not None and r.get("human_band") is not None
    ]
    n = len(pairs)
    if n < threshold:
        return privacy_row("cohens_kappa", None, n, threshold)
    predicted = [p for p, _ in pairs]
    actual = [a for _, a in pairs]
    return privacy_row("cohens_kappa", calculate_cohens_kappa(predicted, actual), n, threshold)


async def _write_rows(conn, rows: list[dict], window_start, window_end) -> None:
    async with conn.cursor() as cur:
        for r in rows:
            await cur.execute(
                """INSERT INTO portal_aggregates (
                       metric_key, cohort_key, window_start, window_end,
                       value, sample_size, suppressed, dimensions
                   ) VALUES (%s, 'all', %s, %s, %s, %s, %s, %s)""",
                (r["metric_key"], window_start, window_end, r["value"], r["sample_size"],
                 r["suppressed"], psycopg.types.json.Jsonb(r["dimensions"])),
            )


def _window(payload: dict) -> tuple[datetime, datetime]:
    days = int(payload.get("window_days") or DEFAULT_WINDOW_DAYS)
    end = datetime.now(timezone.utc)
    return end - timedelta(days=days), end


async def compute_portal_aggregates(conn: psycopg.AsyncConnection, payload: dict, settings) -> int:
    """Compute population metrics into portal_aggregates. Commits. Returns row count."""
    floor = settings.privacy_floor
    start, end = _window(payload)
    rows: list[dict] = []

    # (metric_key, SQL returning value + n, params)
    scalar_metrics = [
        ("pass_rate",
         "SELECT AVG(CASE WHEN passed THEN 1.0 ELSE 0.0 END) AS value, "
         "COUNT(DISTINCT learner_id) AS n FROM attempts WHERE submitted_at >= %s",
         (start,)),
        ("mean_composite_score",
         "SELECT AVG(composite_score) AS value, COUNT(DISTINCT learner_id) AS n "
         "FROM attempts WHERE submitted_at >= %s",
         (start,)),
        ("mastery_rate",
         "SELECT AVG(CASE WHEN mastered_at IS NOT NULL THEN 1.0 ELSE 0.0 END) AS value, "
         "COUNT(DISTINCT learner_id) AS n FROM memory_states",
         ()),
        ("mean_half_life",
         "SELECT AVG(half_life) AS value, COUNT(DISTINCT learner_id) AS n FROM memory_states",
         ()),
        ("mean_source_coverage",
         "SELECT AVG(v.source_coverage) AS value, COUNT(DISTINCT n.learner_id) AS n "
         "FROM validations v JOIN notes n ON n.id = v.note_id WHERE v.computed_at >= %s",
         (start,)),
        ("contradiction_rate",
         "SELECT AVG(CASE WHEN v.contradiction_count > 0 THEN 1.0 ELSE 0.0 END) AS value, "
         "COUNT(DISTINCT n.learner_id) AS n "
         "FROM validations v JOIN notes n ON n.id = v.note_id WHERE v.computed_at >= %s",
         (start,)),
        ("probe_leak_rate",
         "SELECT AVG(CASE WHEN p.leaked THEN 1.0 ELSE 0.0 END) AS value, "
         "COUNT(DISTINCT c.learner_id) AS n "
         "FROM probes p JOIN concepts c ON c.id = p.concept_id WHERE p.created_at >= %s",
         (start,)),
        ("cluster_modularity_mean",
         "SELECT AVG(modularity) AS value, COUNT(DISTINCT learner_id) AS n "
         "FROM clusters WHERE status = 'ACTIVE'",
         ()),
    ]

    async with conn.cursor(row_factory=dict_row) as cur:
        for key, sql, params in scalar_metrics:
            await cur.execute(sql, params)
            r = await cur.fetchone() or {}
            rows.append(privacy_row(key, r.get("value"), int(r.get("n") or 0), floor))

        await cur.execute(
            """SELECT band::text AS band, COUNT(*) AS c, COUNT(DISTINCT learner_id) AS n
               FROM attempts WHERE submitted_at >= %s GROUP BY band""",
            (start,),
        )
        bands = await cur.fetchall()
    total = sum(int(b["c"]) for b in bands)
    for b in bands:
        rows.append(privacy_row("band_share", int(b["c"]) / total if total else None,
                                int(b["n"]), floor, {"band": b["band"]}))

    await _write_rows(conn, rows, start, end)
    await conn.commit()
    return len(rows)


async def run_evaluation_metrics(conn: psycopg.AsyncConnection, payload: dict, settings) -> int:
    """Memory calibration + probe discrimination into portal_aggregates. Commits."""
    floor = settings.privacy_floor
    start, end = _window(payload)
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            """SELECT learner_id, predicted_recall, passed FROM attempts
               WHERE predicted_recall IS NOT NULL AND submitted_at >= %s""",
            (start,),
        )
        calib = await cur.fetchall()
        await cur.execute(
            """SELECT learner_id, probe_id, concept_id, passed, composite_score, submitted_at
               FROM attempts WHERE submitted_at >= %s""",
            (start,),
        )
        attempts = await cur.fetchall()
        # Grading agreement κ: pair the machine band with the human gold band
        # for every labelled attempt. Not window-scoped — labelling is a slow
        # manual effort, so all gold labels count toward the sample.
        await cur.execute(
            """SELECT a.band::text AS machine_band, g.human_band::text AS human_band
               FROM attempt_gold_labels g
               JOIN attempts a ON a.id = g.attempt_id"""
        )
        labels = await cur.fetchall()

    rows = (
        compute_calibration(calib, floor)
        + compute_probe_discrimination(attempts, floor)
        + [compute_cohens_kappa(labels, settings.kappa_min_labels, floor)]
    )
    await _write_rows(conn, rows, start, end)
    await conn.commit()
    return len(rows)
