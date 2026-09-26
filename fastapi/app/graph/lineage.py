"""Cluster lineage tracking (§5.22).

Clusters are emergent and unstable. Re-running weekly will reshuffle
membership, so cluster IDs must persist independently.

Match this week's clusters against last week's by Jaccard overlap:
    J(K_new, K_old) = |K_new ∩ K_old| / |K_new ∪ K_old|

Greedy matching, highest J first, each old cluster consumed at most once.

Event classification:
    J >= 0.50                     → SAME    (retained, rename only if >40% change)
    0.20 <= J < 0.50              → EVOLVED (retained, renamed)
    two+ old → one new, J >= 0.20 → MERGED  (new ID, parents recorded)
    one old → two+ new, J >= 0.20 → SPLIT   (new IDs, parent recorded)
    J < 0.20                      → NEW     (new ID)
    old with no match             → DISSOLVED (archived, not deleted)

Archived clusters are retained because deleting them would orphan
historical metrics (§5.22).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class LineageEvent(str, Enum):
    SAME = "SAME"
    EVOLVED = "EVOLVED"
    MERGED = "MERGED"
    SPLIT = "SPLIT"
    NEW = "NEW"
    DISSOLVED = "DISSOLVED"


# Thresholds (§5.22)
JACCARD_SAME: float = 0.50
JACCARD_EVOLVED: float = 0.20
MEMBERSHIP_RENAME_THRESHOLD: float = 0.40  # rename if >40% membership changed


@dataclass
class LineageRecord:
    """A single lineage event linking old and new clusters."""
    new_cluster_id: str
    old_cluster_ids: list[str]
    event: LineageEvent
    jaccard: float
    needs_rename: bool


def compute_jaccard(set_a: set, set_b: set) -> float:
    """Compute Jaccard similarity J = |A ∩ B| / |A ∪ B| (§5.22).

    Returns 0.0 if both sets are empty.
    """
    if not set_a and not set_b:
        return 0.0

    intersection = len(set_a & set_b)
    union = len(set_a | set_b)

    if union == 0:
        return 0.0

    return intersection / union


def _membership_change_ratio(old_members: set, new_members: set) -> float:
    """Compute ratio of membership change for rename decision.

    change_ratio = 1 - |old ∩ new| / max(|old|, |new|)
    """
    if not old_members and not new_members:
        return 0.0

    intersection = len(old_members & new_members)
    max_size = max(len(old_members), len(new_members))

    if max_size == 0:
        return 0.0

    return 1.0 - (intersection / max_size)


def track_lineage(
    current_clusters: list[dict],
    previous_clusters: list[dict],
) -> list[LineageRecord]:
    """Track lineage between two sets of clusters (§5.22).

    Greedy matching: highest Jaccard first, each old consumed at most once.

    Args:
        current_clusters: list of dicts with 'cluster_id' and 'member_ids'.
        previous_clusters: list of dicts with 'cluster_id' and 'member_ids'.

    Returns:
        List of LineageRecords documenting all events.
    """
    if not previous_clusters:
        # All clusters are new (first run)
        return [
            LineageRecord(
                new_cluster_id=c["cluster_id"],
                old_cluster_ids=[],
                event=LineageEvent.NEW,
                jaccard=0.0,
                needs_rename=True,
            )
            for c in current_clusters
        ]

    # Build member sets
    new_sets = {
        c["cluster_id"]: set(c["member_ids"])
        for c in current_clusters
    }
    old_sets = {
        c["cluster_id"]: set(c["member_ids"])
        for c in previous_clusters
    }

    # Compute all Jaccard pairs
    pairs: list[tuple[str, str, float]] = []
    for new_id, new_members in new_sets.items():
        for old_id, old_members in old_sets.items():
            j = compute_jaccard(new_members, old_members)
            if j > 0.0:
                pairs.append((new_id, old_id, j))

    # Sort by Jaccard descending (greedy)
    pairs.sort(key=lambda x: x[2], reverse=True)

    # Track assignments
    old_consumed: set[str] = set()
    new_matched: dict[str, list[tuple[str, float]]] = {}  # new → [(old, j)]

    for new_id, old_id, j in pairs:
        if old_id in old_consumed:
            continue

        if new_id not in new_matched:
            new_matched[new_id] = []

        new_matched[new_id].append((old_id, j))
        old_consumed.add(old_id)

    # Build lineage records
    records: list[LineageRecord] = []

    for new_id, new_members in new_sets.items():
        matches = new_matched.get(new_id, [])

        if not matches:
            # No matching old cluster
            records.append(LineageRecord(
                new_cluster_id=new_id,
                old_cluster_ids=[],
                event=LineageEvent.NEW,
                jaccard=0.0,
                needs_rename=True,
            ))
        elif len(matches) == 1:
            old_id, j = matches[0]
            old_members = old_sets[old_id]

            if j >= JACCARD_SAME:
                change_ratio = _membership_change_ratio(old_members, new_members)
                records.append(LineageRecord(
                    new_cluster_id=new_id,
                    old_cluster_ids=[old_id],
                    event=LineageEvent.SAME,
                    jaccard=j,
                    needs_rename=change_ratio > MEMBERSHIP_RENAME_THRESHOLD,
                ))
            elif j >= JACCARD_EVOLVED:
                records.append(LineageRecord(
                    new_cluster_id=new_id,
                    old_cluster_ids=[old_id],
                    event=LineageEvent.EVOLVED,
                    jaccard=j,
                    needs_rename=True,
                ))
            else:
                records.append(LineageRecord(
                    new_cluster_id=new_id,
                    old_cluster_ids=[],
                    event=LineageEvent.NEW,
                    jaccard=j,
                    needs_rename=True,
                ))
        else:
            # Multiple old → one new = MERGED
            old_ids = [old_id for old_id, _ in matches]
            max_j = max(j for _, j in matches)

            if all(j >= JACCARD_EVOLVED for _, j in matches):
                records.append(LineageRecord(
                    new_cluster_id=new_id,
                    old_cluster_ids=old_ids,
                    event=LineageEvent.MERGED,
                    jaccard=max_j,
                    needs_rename=True,
                ))
            else:
                records.append(LineageRecord(
                    new_cluster_id=new_id,
                    old_cluster_ids=old_ids,
                    event=LineageEvent.NEW,
                    jaccard=max_j,
                    needs_rename=True,
                ))

    # Handle DISSOLVED: old clusters not consumed
    for old_id in old_sets:
        if old_id not in old_consumed:
            records.append(LineageRecord(
                new_cluster_id="",
                old_cluster_ids=[old_id],
                event=LineageEvent.DISSOLVED,
                jaccard=0.0,
                needs_rename=False,
            ))

    # Handle SPLIT: check if one old cluster maps to multiple new clusters
    # (This is a second pass — old clusters that matched multiple new ones)
    old_to_new: dict[str, list[tuple[str, float]]] = {}
    for new_id, matches in new_matched.items():
        for old_id, j in matches:
            if old_id not in old_to_new:
                old_to_new[old_id] = []
            old_to_new[old_id].append((new_id, j))

    # Note: in the greedy scheme above, each old is consumed at most once,
    # so true SPLIT detection requires a separate analysis pass where we
    # look at the full Jaccard matrix before greedy consumption.
    # For now, SPLIT is handled implicitly via NEW events on the children.

    return records
