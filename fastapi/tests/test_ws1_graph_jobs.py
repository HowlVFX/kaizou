"""WS1: REQUIRES orientation + depth, lineage, cluster persistence,
aggregate/evaluation jobs. Pure functions and in-memory fakes only."""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta, timezone

from app.config import Settings
from app.evaluation.aggregates import (
    compute_calibration,
    compute_portal_aggregates,
    compute_probe_discrimination,
    privacy_row,
)
from app.graph.cluster_service import plan_cluster_level, recluster_learner
from app.graph.lineage import LineageEvent, track_lineage
from app.graph.paths import generate_cluster_path, generate_concept_path
from app.graph.prerequisites import (
    build_requires_forward,
    compute_prerequisite_depths,
    plan_requires_edges,
)


# --------------------------------------------------------------------------
# REQUIRES orientation / depth
# --------------------------------------------------------------------------
def test_requires_forward_inverts_db_orientation_and_skips_conflicts():
    # DB rows: Hoisting REQUIRES CreationPhase REQUIRES ExecutionContext
    rows = [
        {"source_id": "hoist", "target_id": "creation", "flag": None},
        {"source_id": "creation", "target_id": "ctx", "flag": None},
        {"source_id": "ctx", "target_id": "hoist", "flag": "CYCLE_CONFLICT"},
    ]
    fwd = build_requires_forward(rows)
    assert fwd == {"creation": ["hoist"], "ctx": ["creation"]}
    assert compute_prerequisite_depths(fwd) == {"ctx": 0, "creation": 1, "hoist": 2}

    info = {k: {"label": k} for k in ("hoist", "creation", "ctx")}
    path = generate_concept_path("hoist", fwd, info)
    # foundations first, target last
    assert [n.concept_id for n in path.ordered] == ["ctx", "creation", "hoist"]
    assert [n.depth for n in path.ordered] == [0, 1, 2]
    assert path.has_cycle_break is False


def test_cluster_path_uses_learner_wide_depth():
    fwd = build_requires_forward([
        {"source_id": "b", "target_id": "a", "flag": None},   # b REQUIRES a (a outside cluster)
    ])
    path = generate_cluster_path(["b", "c"], fwd, {})
    depths = {n.concept_id: n.depth for n in path.ordered + path.unordered}
    assert depths == {"b": 1, "c": 0}


def test_plan_requires_edges_cycle_and_self():
    fwd = build_requires_forward([{"source_id": "x", "target_id": "y", "flag": None}])  # x REQUIRES y
    planned, depth = plan_requires_edges("y", ["x", "y", "z", "z"], fwd)
    assert planned == [
        {"source_id": "y", "target_id": "x", "flag": "CYCLE_CONFLICT"},
        {"source_id": "y", "target_id": "z", "flag": None},
    ]
    assert depth == 1  # via z only


# --------------------------------------------------------------------------
# Lineage
# --------------------------------------------------------------------------
def test_lineage_split_and_low_overlap_dissolve():
    prev = [{"cluster_id": "old", "member_ids": list("abcdef")},
            {"cluster_id": "gone", "member_ids": list("uvwxyz")}]
    cur = [{"cluster_id": "n1", "member_ids": list("abcd")},   # J=4/6 → SAME(old)
           {"cluster_id": "n2", "member_ids": list("efg")},    # J(old)=2/7 → SPLIT(old)
           {"cluster_id": "n3", "member_ids": list("uq1234567")}]  # J(gone)=1/14 < .2 → NEW
    recs = {r.new_cluster_id or r.old_cluster_ids[0]: r for r in track_lineage(cur, prev)}
    assert recs["n1"].event == LineageEvent.SAME and recs["n1"].old_cluster_ids == ["old"]
    assert recs["n2"].event == LineageEvent.SPLIT and recs["n2"].old_cluster_ids == ["old"]
    assert recs["n3"].event == LineageEvent.NEW
    # consumed by n3 below threshold → must still dissolve
    assert recs["gone"].event == LineageEvent.DISSOLVED


def test_plan_cluster_level_retains_ids_and_archives_merged():
    prev = [{"cluster_id": "p1", "member_ids": list("abc"), "label": "P1"},
            {"cluster_id": "p2", "member_ids": list("def"), "label": "P2"},
            {"cluster_id": "p3", "member_ids": list("ghij"), "label": "P3"}]
    det = [{"temp_id": "t0", "member_ids": list("abcdef"), "modularity": 0.4},  # MERGED p1+p2
           {"temp_id": "t1", "member_ids": list("ghij"), "modularity": 0.4}]    # SAME p3
    clusters, archived = plan_cluster_level(det, prev)
    by_temp = {c["temp_id"]: c for c in clusters}
    assert by_temp["t1"]["cluster_id"] == "p3" and not by_temp["t1"]["is_new"]
    assert by_temp["t0"]["event"] == "MERGED" and by_temp["t0"]["is_new"]
    assert sorted(by_temp["t0"]["parent_cluster_ids"]) == ["p1", "p2"]
    assert sorted(a["cluster_id"] for a in archived) == ["p1", "p2"]


# --------------------------------------------------------------------------
# recluster_learner against an in-memory store
# --------------------------------------------------------------------------
class ClusterDB:
    def __init__(self, concepts, edges):
        self.concepts = concepts
        self.edges = edges
        self.clusters: dict[str, dict] = {}
        self.members: set[tuple[str, str]] = set()
        self.lineage: list[dict] = []
        self.commits = 0

    def cursor(self, *a, **k):
        return ClusterCursor(self)

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        pass


class ClusterCursor:
    def __init__(self, db):
        self.db = db
        self.rows = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def fetchall(self):
        return self.rows

    async def execute(self, sql, params=()):
        db, s, p = self.db, " ".join(sql.split()), list(params)
        self.rows = []
        if s.startswith("SELECT id, canonical_label, status::text AS status FROM concepts"):
            self.rows = [dict(c) for c in db.concepts]
        elif s.startswith("SELECT source_id, target_id, type::text AS type, weight FROM edges"):
            self.rows = [dict(e) for e in db.edges]
        elif s.startswith("SELECT c.id, c.label, c.parent_cluster_id, cm.concept_id"):
            for cid, c in db.clusters.items():
                if c["status"] != "ACTIVE":
                    continue
                mems = [m for (k, m) in db.members if k == cid] or [None]
                for m in mems:
                    self.rows.append({"id": uuid.UUID(cid), "label": c["label"],
                                      "parent_cluster_id": c["parent"], "concept_id": m})
        elif s.startswith("INSERT INTO clusters"):
            cid, lid, parent, label, mod, count, res = p
            db.clusters[cid] = {"label": label, "parent": parent, "modularity": mod,
                                "member_count": count, "status": "ACTIVE"}
        elif s.startswith("UPDATE clusters SET parent_cluster_id"):
            parent, label, mod, count, rename, cid = p
            db.clusters[cid].update(parent=parent, label=label, modularity=mod,
                                    member_count=count, status="ACTIVE")
        elif s.startswith("DELETE FROM cluster_members"):
            db.members = {(k, m) for k, m in db.members if k != p[0]}
        elif s.startswith("INSERT INTO cluster_members"):
            db.members.add((p[0], p[1]))
        elif s.startswith("INSERT INTO cluster_lineage") and "'DISSOLVED'" in s:
            db.lineage.append({"cluster_id": p[1], "event": "DISSOLVED"})
        elif s.startswith("INSERT INTO cluster_lineage"):
            db.lineage.append({"cluster_id": p[1], "parents": p[2], "event": p[3]})
        elif s.startswith("UPDATE clusters SET status = 'ARCHIVED'"):
            db.clusters[p[0]]["status"] = "ARCHIVED"
        else:
            raise AssertionError("unexpected SQL: " + s)


def _two_communities():
    ids = [str(uuid.uuid4()) for _ in range(8)]
    concepts = [{"id": uuid.UUID(i), "canonical_label": f"C{n}", "status": "VERIFIED_CONCEPT"}
                for n, i in enumerate(ids)]
    concepts.append({"id": uuid.uuid4(), "canonical_label": "ghost", "status": "UNRESOLVED_PREREQUISITE"})
    edges = []
    for group in (ids[:4], ids[4:]):
        for a in range(4):
            for b in range(a + 1, 4):
                edges.append({"source_id": uuid.UUID(group[a]), "target_id": uuid.UUID(group[b]),
                              "type": "WIKILINK", "weight": 1.0})
    edges.append({"source_id": uuid.UUID(ids[0]), "target_id": uuid.UUID(ids[4]),
                  "type": "SEMANTIC", "weight": 0.81})
    return ids, concepts, edges


def test_recluster_persists_clusters_members_lineage_and_is_stable():
    async def run():
        ids, concepts, edges = _two_communities()
        db = ClusterDB(concepts, edges)
        s = Settings()
        r1 = await recluster_learner(db, "learner", s)
        assert r1["status"] == "OK" and r1["clusters"] == 2
        groups = {}
        for cid, mid in db.members:
            groups.setdefault(cid, set()).add(mid)
        # placeholder ("ghost") excluded; the two cliques become the clusters
        assert {frozenset(v) for v in groups.values()} == {frozenset(ids[:4]), frozenset(ids[4:])}
        assert all(l["event"] == "NEW" for l in db.lineage)
        assert all(c["label"] and c["member_count"] == 4 for c in db.clusters.values())
        first_ids = set(db.clusters)

        r2 = await recluster_learner(db, "learner", s)
        assert r2["events"] == {"SAME": 2}
        assert set(db.clusters) == first_ids  # ids persist across runs (§5.22)
    asyncio.run(run())


def test_recluster_no_structure_leaves_clusters_untouched():
    async def run():
        concepts = [{"id": uuid.uuid4(), "canonical_label": "solo", "status": "VERIFIED_CONCEPT"}]
        db = ClusterDB(concepts, [])
        r = await recluster_learner(db, "learner", Settings())
        assert r["status"] == "NO_STRUCTURE" and not db.clusters and db.commits == 1
    asyncio.run(run())


# --------------------------------------------------------------------------
# Aggregates / evaluation
# --------------------------------------------------------------------------
def test_privacy_row_suppresses_below_floor():
    assert privacy_row("x", 0.9, 4, 5) == {"metric_key": "x", "value": 0.0, "sample_size": 4,
                                           "suppressed": True, "dimensions": {}}
    assert privacy_row("x", 0.9, 5, 5)["value"] == 0.9


def test_compute_calibration_and_discrimination():
    rows = [{"learner_id": f"l{i}", "predicted_recall": p, "passed": o}
            for i, (p, o) in enumerate([(0.9, True), (0.8, True), (0.2, False), (0.3, False), (0.7, True)])]
    out = {r["metric_key"]: r for r in compute_calibration(rows, 5)}
    assert not out["brier_score"]["suppressed"] and out["auc"]["value"] == 1.0
    assert compute_calibration(rows[:4], 5)[0]["suppressed"] is True

    t0 = datetime(2025, 1, 1, tzinfo=timezone.utc)
    attempts = []
    for i in range(6):
        strong = i < 3
        attempts.append({"learner_id": f"l{i}", "probe_id": "p", "concept_id": "c1",
                         "passed": strong, "composite_score": 0.9 if strong else 0.1,
                         "submitted_at": t0})
        attempts.append({"learner_id": f"l{i}", "probe_id": "q", "concept_id": "c2",
                         "passed": strong, "composite_score": 0.9 if strong else 0.2,
                         "submitted_at": t0 + timedelta(hours=1)})
    disc = compute_probe_discrimination(attempts, 5)
    shares = {r["dimensions"].get("discrimination"): r for r in disc if r["dimensions"]}
    assert disc[0]["metric_key"] == "probes_evaluated" and disc[0]["value"] == 2.0
    assert shares["acceptable"]["value"] == 1.0 and not shares["acceptable"]["suppressed"]


class AggDB:
    def __init__(self):
        self.inserted = []

    def cursor(self, *a, **k):
        return AggCursor(self)

    async def commit(self):
        pass


class AggCursor:
    def __init__(self, db):
        self.db, self.row, self.rows = db, None, []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def fetchone(self):
        return self.row

    async def fetchall(self):
        return self.rows

    async def execute(self, sql, params=()):
        s = " ".join(sql.split())
        if s.startswith("INSERT INTO portal_aggregates"):
            self.db.inserted.append(params)
        elif "GROUP BY band" in s:
            self.rows = [{"band": "Full", "c": 6, "n": 6}, {"band": "Shallow", "c": 2, "n": 2}]
        else:
            self.row = {"value": 0.5, "n": 7}


def test_compute_portal_aggregates_writes_rows_with_floor():
    async def run():
        db = AggDB()
        n = await compute_portal_aggregates(db, {"window_days": 7}, Settings())
        assert n == len(db.inserted) == 10
        by_key = {}
        for p in db.inserted:
            by_key.setdefault(p[0], []).append(p)
        assert by_key["pass_rate"][0][3] == 0.5 and by_key["pass_rate"][0][5] is False
        shallow = next(p for p in by_key["band_share"] if p[6].obj == {"band": "Shallow"})
        assert shallow[5] is True and shallow[3] == 0.0  # 2 learners < floor → suppressed
    asyncio.run(run())
