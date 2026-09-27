"""Cluster detection run + persistence (§5.21, §5.22).

One run for one learner:
    1. Load concepts and edges
    2. Louvain at γ_top; sub-cluster communities with |K| >= 12 at γ_sub
       (one sub level → recursion depth 2, §5.21)
    3. Match against the learner's ACTIVE clusters (lineage, §5.22),
       separately for top-level and sub-level clusters
    4. Persist: retained clusters keep their id (SAME / EVOLVED); MERGED,
       SPLIT and NEW get new ids; unmatched old clusters are ARCHIVED
       (never deleted). Every event is written to cluster_lineage.

Naming is deterministic (highest-degree member labels) — no LLM call.
If the graph shows no clear structure (Q below threshold) the existing
clusters are left untouched rather than dissolved on a noisy run.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from uuid import uuid4

import psycopg
from psycopg.rows import dict_row

from app.graph.clustering import (
    build_weighted_graph,
    detect_clusters,
    detect_subclusters,
)
from app.graph.lineage import LineageEvent, track_lineage

logger = logging.getLogger(__name__)

MIN_CLUSTER_SIZE = 2          # singletons (isolated nodes) are not clusters
LABEL_MEMBERS = 3             # member labels used in a deterministic name


def name_cluster(member_ids: list[str], labels: dict[str, str], adjacency: dict) -> str:
    """Deterministic cluster label from its most connected members."""
    members = set(member_ids)

    def degree(mid: str) -> float:
        return sum(w for n, w in adjacency.get(mid, {}).items() if n in members)

    ranked = sorted(member_ids, key=lambda m: (-degree(m), labels.get(m, m)))
    top = [labels.get(m, m) for m in ranked[:LABEL_MEMBERS]]
    label = " · ".join(top)
    extra = len(member_ids) - len(top)
    if extra > 0:
        label += f" +{extra}"
    return label


def plan_cluster_level(
    detected: list[dict],
    previous: list[dict],
) -> tuple[list[dict], list[dict]]:
    """Turn detected communities + previous clusters into persistence actions.

    Args:
        detected: [{'temp_id', 'member_ids', 'modularity', 'parent_temp_id'}]
        previous: [{'cluster_id', 'member_ids', 'label'}] ACTIVE at this level

    Returns:
        (clusters, archived):
          clusters: [{'temp_id', 'cluster_id', 'is_new', 'member_ids',
                      'modularity', 'parent_temp_id', 'event', 'jaccard',
                      'parent_cluster_ids', 'needs_rename', 'old_label'}]
          archived: [{'cluster_id', 'event' (DISSOLVED|MERGED), 'jaccard'}]
    """
    records = track_lineage(
        [{"cluster_id": d["temp_id"], "member_ids": d["member_ids"]} for d in detected],
        previous,
    )
    prev_by_id = {p["cluster_id"]: p for p in previous}
    det_by_temp = {d["temp_id"]: d for d in detected}

    clusters: list[dict] = []
    retained: set[str] = set()
    merged_parents: set[str] = set()
    dissolved: list[dict] = []

    for rec in records:
        if rec.event == LineageEvent.DISSOLVED:
            dissolved.append({"cluster_id": rec.old_cluster_ids[0], "event": "DISSOLVED", "jaccard": 0.0})
            continue
        d = det_by_temp[rec.new_cluster_id]
        keep_id = rec.event in (LineageEvent.SAME, LineageEvent.EVOLVED)
        cluster_id = rec.old_cluster_ids[0] if keep_id else str(uuid4())
        if keep_id:
            retained.add(cluster_id)
        if rec.event == LineageEvent.MERGED:
            merged_parents.update(rec.old_cluster_ids)
        clusters.append({
            "temp_id": d["temp_id"],
            "cluster_id": cluster_id,
            "is_new": not keep_id,
            "member_ids": d["member_ids"],
            "modularity": d.get("modularity"),
            "parent_temp_id": d.get("parent_temp_id"),
            "event": rec.event.value,
            "jaccard": rec.jaccard,
            "parent_cluster_ids": list(rec.old_cluster_ids),
            "needs_rename": rec.needs_rename,
            "old_label": prev_by_id[cluster_id]["label"] if keep_id else None,
        })

    archived = list(dissolved)
    for pid in merged_parents - retained:
        if not any(a["cluster_id"] == pid for a in archived):
            # Absorbed into a MERGED cluster; the lineage row lives on the child.
            archived.append({"cluster_id": pid, "event": "MERGED", "jaccard": None})
    return clusters, archived


async def recluster_learner(conn: psycopg.AsyncConnection, learner_id: str, settings=None) -> dict:
    """Run cluster detection for one learner and persist the result. Commits."""
    if settings is None:
        from app.config import get_settings
        settings = get_settings()
    learner_id = str(learner_id)

    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT id, canonical_label, status::text AS status FROM concepts WHERE learner_id = %s",
            (learner_id,),
        )
        concept_rows = await cur.fetchall()
        await cur.execute(
            "SELECT source_id, target_id, type::text AS type, weight FROM edges WHERE learner_id = %s",
            (learner_id,),
        )
        edge_rows = await cur.fetchall()
        await cur.execute(
            """SELECT c.id, c.label, c.parent_cluster_id, cm.concept_id
               FROM clusters c
               LEFT JOIN cluster_members cm ON cm.cluster_id = c.id
               WHERE c.learner_id = %s AND c.status = 'ACTIVE'""",
            (learner_id,),
        )
        prev_rows = await cur.fetchall()

    concepts = [
        {"id": str(r["id"]), "status": r["status"], "label": r["canonical_label"]}
        for r in concept_rows
    ]
    labels = {c["id"]: c["label"] for c in concepts}
    edges = [
        {"source_id": str(e["source_id"]), "target_id": str(e["target_id"]),
         "type": e["type"], "weight": e.get("weight")}
        for e in edge_rows
    ]

    # Previous ACTIVE clusters, split by level.
    prev: dict[str, dict] = {}
    for r in prev_rows:
        cid = str(r["id"])
        p = prev.setdefault(cid, {
            "cluster_id": cid, "label": r["label"], "member_ids": [],
            "is_sub": r.get("parent_cluster_id") is not None,
        })
        if r.get("concept_id") is not None:
            p["member_ids"].append(str(r["concept_id"]))
    prev_top = [p for p in prev.values() if not p["is_sub"]]
    prev_sub = [p for p in prev.values() if p["is_sub"]]

    # --- Detection ---
    top = [
        c for c in detect_clusters(concepts, edges, settings.cluster_resolution_top)
        if c["member_count"] >= MIN_CLUSTER_SIZE
    ]
    if not top:
        logger.info("Learner %s: no clear cluster structure; clusters unchanged", learner_id)
        await conn.commit()
        return {"status": "NO_STRUCTURE", "clusters": 0, "subclusters": 0, "archived": 0}

    detected_top = []
    detected_sub = []
    for i, c in enumerate(top):
        temp = f"top:{i}"
        detected_top.append({"temp_id": temp, "member_ids": c["member_ids"],
                             "modularity": c["modularity"], "parent_temp_id": None})
        if c["member_count"] >= settings.cluster_min_for_sub:
            subs = detect_subclusters(c["member_ids"], concepts, edges, settings.cluster_resolution_sub)
            for j, s in enumerate(x for x in subs if x["member_count"] >= MIN_CLUSTER_SIZE):
                detected_sub.append({"temp_id": f"sub:{i}:{j}", "member_ids": s["member_ids"],
                                     "modularity": s["modularity"], "parent_temp_id": temp})

    top_plan, top_archived = plan_cluster_level(detected_top, prev_top)
    sub_plan, sub_archived = plan_cluster_level(detected_sub, prev_sub)
    temp_to_id = {c["temp_id"]: c["cluster_id"] for c in top_plan}

    adjacency = build_weighted_graph(concepts, edges)

    # --- Persist ---
    async with conn.cursor() as cur:
        for c in top_plan + sub_plan:
            parent_id = temp_to_id.get(c["parent_temp_id"]) if c["parent_temp_id"] else None
            rename = c["is_new"] or c["needs_rename"] or not c["old_label"]
            label = name_cluster(c["member_ids"], labels, adjacency) if rename else c["old_label"]
            if c["is_new"]:
                await cur.execute(
                    """INSERT INTO clusters (id, learner_id, parent_cluster_id, label, modularity,
                                             member_count, resolution, status, last_named_at)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, 'ACTIVE', NOW())""",
                    (c["cluster_id"], learner_id, parent_id, label, c["modularity"],
                     len(c["member_ids"]),
                     settings.cluster_resolution_sub if parent_id else settings.cluster_resolution_top),
                )
            else:
                await cur.execute(
                    """UPDATE clusters
                       SET parent_cluster_id = %s, label = %s, modularity = %s,
                           member_count = %s, status = 'ACTIVE',
                           last_named_at = CASE WHEN %s THEN NOW() ELSE last_named_at END
                       WHERE id = %s""",
                    (parent_id, label, c["modularity"], len(c["member_ids"]), rename,
                     c["cluster_id"]),
                )
                await cur.execute(
                    "DELETE FROM cluster_members WHERE cluster_id = %s", (c["cluster_id"],),
                )
            for mid in c["member_ids"]:
                await cur.execute(
                    """INSERT INTO cluster_members (cluster_id, concept_id)
                       VALUES (%s, %s) ON CONFLICT DO NOTHING""",
                    (c["cluster_id"], mid),
                )
            await cur.execute(
                """INSERT INTO cluster_lineage (learner_id, cluster_id, parent_cluster_ids, event, jaccard)
                   VALUES (%s, %s, %s::uuid[], %s::lineage_event, %s)""",
                (learner_id, c["cluster_id"], c["parent_cluster_ids"], c["event"], c["jaccard"]),
            )

        for a in top_archived + sub_archived:
            # Members are kept: archived clusters back historical metrics (§5.22).
            await cur.execute(
                "UPDATE clusters SET status = 'ARCHIVED' WHERE id = %s", (a["cluster_id"],),
            )
            if a["event"] == "DISSOLVED":
                await cur.execute(
                    """INSERT INTO cluster_lineage (learner_id, cluster_id, parent_cluster_ids, event, jaccard)
                       VALUES (%s, %s, '{}'::uuid[], 'DISSOLVED', %s)""",
                    (learner_id, a["cluster_id"], a["jaccard"]),
                )

    await conn.commit()
    events: dict[str, int] = defaultdict(int)
    for c in top_plan + sub_plan:
        events[c["event"]] += 1
    for a in top_archived + sub_archived:
        if a["event"] == "DISSOLVED":
            events["DISSOLVED"] += 1
    return {
        "status": "OK",
        "clusters": len(top_plan),
        "subclusters": len(sub_plan),
        "archived": len(top_archived) + len(sub_archived),
        "events": dict(events),
    }
