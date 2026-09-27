"""Concept-sort and misconception-MCQ scoring (§5.13, §5.14).

Both probe types are graded from the answer payload alone — no free text,
no embeddings, no NLI, no LLM. Pure set arithmetic.

Concept sort (§5.13):
    ARI(X, G) = (index − expected) / (max − expected)
    A_m = max(0, ARI(X, G_m)),  A_s = max(0, ARI(X, G_s))
    principle_ratio = A_m / (A_m + A_s)   if A_m + A_s > 0, else undefined

Misconception MCQ (§5.14):
    correct = 𝟙(selected == key)
    if not correct: misconception_tag = distractor_map[selected]
"""
from __future__ import annotations

from math import comb
from typing import Any, Optional


def partition_labels(groups: list[list[int]], n_items: int) -> Optional[list[int]]:
    """Convert a list of item-index groups into one label per item.

    Returns None if the groups are not a partition of range(n_items)
    (an index missing, repeated, or out of range).
    """
    labels = [-1] * n_items
    for g, members in enumerate(groups):
        for idx in members:
            if not isinstance(idx, int) or idx < 0 or idx >= n_items:
                return None
            if labels[idx] != -1:
                return None
            labels[idx] = g
    if any(label == -1 for label in labels):
        return None
    return labels


def adjusted_rand_index(labels_x: list[int], labels_g: list[int]) -> float:
    """Adjusted Rand Index between two labelings of the same N items (§5.13).

    Returns 1.0 for identical partitions, ~0 for chance. When the expected
    and max indices coincide (e.g. both partitions trivial) the partitions
    are compared directly: identical → 1.0, otherwise 0.0.
    """
    if len(labels_x) != len(labels_g):
        raise ValueError("labelings must cover the same items")
    n = len(labels_x)
    if n < 2:
        return 1.0 if labels_x == labels_g else 0.0

    contingency: dict[tuple[int, int], int] = {}
    row_sums: dict[int, int] = {}
    col_sums: dict[int, int] = {}
    for a, b in zip(labels_x, labels_g):
        contingency[(a, b)] = contingency.get((a, b), 0) + 1
        row_sums[a] = row_sums.get(a, 0) + 1
        col_sums[b] = col_sums.get(b, 0) + 1

    index = sum(comb(v, 2) for v in contingency.values())
    sum_a = sum(comb(v, 2) for v in row_sums.values())
    sum_b = sum(comb(v, 2) for v in col_sums.values())
    expected = (sum_a * sum_b) / comb(n, 2)
    max_index = 0.5 * (sum_a + sum_b)

    if max_index == expected:
        same = _canonical(labels_x) == _canonical(labels_g)
        return 1.0 if same else 0.0
    return (index - expected) / (max_index - expected)


def _canonical(labels: list[int]) -> list[int]:
    mapping: dict[int, int] = {}
    return [mapping.setdefault(label, len(mapping)) for label in labels]


def principle_ratio(ari_mechanism: float, ari_surface: float) -> Optional[float]:
    """§5.13.1 — None means "no signal" (both clipped ARIs are zero)."""
    a_m = max(0.0, ari_mechanism)
    a_s = max(0.0, ari_surface)
    if a_m + a_s <= 0.0:
        return None
    return a_m / (a_m + a_s)


def learner_groups_from_payload(payload: dict[str, Any], n_items: int) -> Optional[list[list[int]]]:
    """Accept either {"groups": [[idx,...],...]} or {"assignment": [label per item]}."""
    if not isinstance(payload, dict):
        return None
    groups = payload.get("groups")
    if isinstance(groups, list) and all(isinstance(g, list) for g in groups):
        try:
            return [[int(i) for i in g] for g in groups]
        except (TypeError, ValueError):
            return None
    assignment = payload.get("assignment")
    if isinstance(assignment, list) and len(assignment) == n_items:
        by_label: dict[str, list[int]] = {}
        for idx, label in enumerate(assignment):
            by_label.setdefault(str(label), []).append(idx)
        return list(by_label.values())
    return None


def selected_option_from_answer(
    payload: Optional[dict[str, Any]], answer_text: Optional[str], n_options: int,
) -> Optional[int]:
    """Resolve the learner's MCQ selection to a 0-based option index.

    Payload keys accepted: selected_index | selected_option | selected.
    Values may be an int index or a letter ("A".."D"). Falls back to parsing
    a bare letter/number in answer_text. Returns None if nothing usable.
    """
    candidates: list[Any] = []
    if isinstance(payload, dict):
        for key in ("selected_index", "selected_option", "selected"):
            if key in payload and payload[key] is not None:
                candidates.append(payload[key])
    if answer_text and answer_text.strip():
        candidates.append(answer_text.strip())

    for value in candidates:
        idx = _option_index(value, n_options)
        if idx is not None:
            return idx
    return None


def _option_index(value: Any, n_options: int) -> Optional[int]:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if 0 <= value < n_options else None
    if isinstance(value, str):
        text = value.strip().rstrip(").:").strip()
        if text.isdigit():
            idx = int(text)
            return idx if 0 <= idx < n_options else None
        if len(text) == 1 and text.isalpha():
            idx = ord(text.upper()) - ord("A")
            return idx if 0 <= idx < n_options else None
    return None
