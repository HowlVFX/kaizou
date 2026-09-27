"""Answer-key snapshot format (probes.answer_key_snapshot).

A probe freezes the claim set it grades against at generation time (D-04:
historical grades point at the version they were graded against). The
grader reads this snapshot, never the concept's live claims, so a later
re-ingest cannot change what an outstanding probe is graded on.

Snapshot v2 (written by app.probes.service):
    {
      "version": 2,
      "probe_type": "RECALL",
      "concept_id": "...", "concept_version": 3,
      "concept_label": "...", "shape": "ORDERED_PROCESS",
      "claims": [{"id", "text", "order_index", "is_transition",
                  "is_load_bearing", "branch_id", "weight", "aliases"}],
      "target_claim_index": int | null,          # CLOZE / MCQ focus claim
      "category": str | null,                     # concept category (§5.12 gating)
      "cloze":   {"answer": str, "aliases": [str]} | null,
      "mcq":     {"correct_index": int, "distractor_map": {"<idx>": tag}} | null,
      "sort":    {"mechanism_groups": [[int]], "surface_groups": [[int]]} | null,
      "template": {"trunk": [int], "branches": {name: [int]}, "confidence": str} | null,
      "target_branch": str | null,
      # §5.12 perturbation delta scoring — which claims flip vs stay invariant
      # when the probe's stated condition changes. Indices reference claims[].
      "perturbation": {"flipped": [int], "invariant": [int]} | null,
      # §9.5 ANALOGY_BREAKDOWN — authored statements of where the analogy stops
      # holding; graded by claim coverage of the learner's answer against them.
      "divergences": [str] | null
    }

Legacy v1 snapshots ({"claims": [text, ...], "probe_type", ...}) are still
parsed; their claim metadata is re-hydrated from the claims table by text.

🔒 The snapshot is server-side only. It must never be returned to Express.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Optional

SNAPSHOT_VERSION = 2

PROBE_TYPES: frozenset[str] = frozenset({
    "CLOZE", "RECALL", "PROCESS_TRACE", "PROCEDURAL", "MISCONCEPTION_MCQ",
    "CONCEPT_SORT", "PERTURBATION", "NEAR_TRANSFER", "FAR_TRANSFER",
    "ANALOGY_FORWARD", "ANALOGY_SIMULATE", "ANALOGY_BREAKDOWN",
})

# Graded from the answer payload alone (no free text, no AI).
PAYLOAD_PROBE_TYPES: frozenset[str] = frozenset({"MISCONCEPTION_MCQ", "CONCEPT_SORT"})


@dataclass
class KeyClaim:
    text: str
    id: Optional[str] = None
    order_index: Optional[int] = None
    is_transition: bool = False
    is_load_bearing: bool = False
    branch_id: Optional[str] = None
    weight: float = 1.0
    aliases: list[str] = field(default_factory=list)
    embedding: Any = None           # hydrated at grade time, never stored


@dataclass
class AnswerKey:
    probe_type: str
    claims: list[KeyClaim]
    shape: str = "DEFINITION"
    concept_label: str = ""
    version: int = 1
    target_claim_index: Optional[int] = None
    category: Optional[str] = None
    cloze: Optional[dict] = None
    mcq: Optional[dict] = None
    sort: Optional[dict] = None
    template: Optional[dict] = None
    target_branch: Optional[str] = None
    perturbation: Optional[dict] = None
    divergences: Optional[list[str]] = None

    @property
    def is_legacy(self) -> bool:
        return self.version < SNAPSHOT_VERSION


def normalise_answer(text: Optional[str]) -> str:
    """Case/accent/punctuation-insensitive form for exact and alias matching."""
    if not text:
        return ""
    text = unicodedata.normalize("NFKC", text).casefold()
    text = re.sub(r"[^\w\s]", " ", text)
    return " ".join(text.split())


def claim_row_to_snapshot(row: dict) -> dict:
    """Serialise a claims-table row into the snapshot's claim shape."""
    return {
        "id": str(row["id"]) if row.get("id") is not None else None,
        "text": row["text"],
        "order_index": row.get("order_index"),
        "is_transition": bool(row.get("is_transition")),
        "is_load_bearing": bool(row.get("is_load_bearing")),
        "branch_id": row.get("branch_id"),
        "weight": float(row["weight"]) if row.get("weight") is not None else 1.0,
        "aliases": list(row.get("aliases") or []),
    }


def sanitise_perturbation(perturbation: Any, n_claims: int) -> Optional[dict]:
    """Coerce a perturbation delta into the stored shape, or None if invalid.

    Both sets must reference claim indices in range and be disjoint (a claim
    cannot both flip and stay invariant). The empty-flipped case is valid —
    it is exactly the CONVENTIONAL "nothing changes" answer key (§5.12).
    """
    if not isinstance(perturbation, dict):
        return None

    def _clean(key: str) -> list[int]:
        seen: list[int] = []
        for v in perturbation.get(key) or []:
            if isinstance(v, bool):  # bool is an int subclass — reject
                continue
            if isinstance(v, int) and 0 <= v < n_claims and v not in seen:
                seen.append(v)
        return seen

    flipped = _clean("flipped")
    invariant = _clean("invariant")
    if set(flipped) & set(invariant):
        return None
    if not flipped and not invariant:
        return None
    return {"flipped": flipped, "invariant": invariant}


def build_snapshot(
    *,
    concept: dict,
    claims: list[dict],
    probe_type: str,
    target_claim_index: Optional[int] = None,
    cloze: Optional[dict] = None,
    mcq: Optional[dict] = None,
    sort: Optional[dict] = None,
    template: Optional[dict] = None,
    target_branch: Optional[str] = None,
    perturbation: Optional[dict] = None,
    divergences: Optional[list[str]] = None,
) -> dict:
    n = len(claims)
    clean_divergences = None
    if divergences:
        clean_divergences = [d.strip() for d in divergences if isinstance(d, str) and d.strip()] or None
    return {
        "version": SNAPSHOT_VERSION,
        "probe_type": probe_type,
        "concept_id": str(concept["id"]) if concept.get("id") is not None else None,
        "concept_version": concept.get("version"),
        "concept_label": concept.get("canonical_label", ""),
        "shape": concept.get("shape", "DEFINITION"),
        "category": concept.get("category"),
        "claims": [claim_row_to_snapshot(c) for c in claims],
        "target_claim_index": target_claim_index,
        "cloze": cloze,
        "mcq": mcq,
        "sort": sort,
        "template": template,
        "target_branch": target_branch,
        "perturbation": sanitise_perturbation(perturbation, n) if perturbation else None,
        "divergences": clean_divergences,
    }


def parse_answer_key(snapshot: Any, probe_type: str) -> AnswerKey:
    """Parse a v1 or v2 snapshot into an AnswerKey."""
    snap = snapshot if isinstance(snapshot, dict) else {}
    raw_claims = snap.get("claims") or []
    claims: list[KeyClaim] = []
    for c in raw_claims:
        if isinstance(c, str):
            claims.append(KeyClaim(text=c))
        elif isinstance(c, dict) and c.get("text"):
            claims.append(KeyClaim(
                text=c["text"],
                id=c.get("id"),
                order_index=c.get("order_index"),
                is_transition=bool(c.get("is_transition")),
                is_load_bearing=bool(c.get("is_load_bearing")),
                branch_id=c.get("branch_id"),
                weight=float(c.get("weight") if c.get("weight") is not None else 1.0),
                aliases=list(c.get("aliases") or []),
            ))
    tci = snap.get("target_claim_index")
    if not isinstance(tci, int) or not (0 <= tci < len(claims)):
        tci = None
    divergences = snap.get("divergences")
    if isinstance(divergences, list):
        divergences = [d for d in divergences if isinstance(d, str) and d.strip()] or None
    else:
        divergences = None
    return AnswerKey(
        probe_type=probe_type or snap.get("probe_type") or "RECALL",
        claims=claims,
        shape=snap.get("shape") or "DEFINITION",
        concept_label=snap.get("concept_label") or "",
        version=int(snap.get("version") or 1),
        target_claim_index=tci,
        category=snap.get("category") or None,
        cloze=snap.get("cloze") if isinstance(snap.get("cloze"), dict) else None,
        mcq=snap.get("mcq") if isinstance(snap.get("mcq"), dict) else None,
        sort=snap.get("sort") if isinstance(snap.get("sort"), dict) else None,
        template=snap.get("template") if isinstance(snap.get("template"), dict) else None,
        target_branch=snap.get("target_branch") or None,
        perturbation=sanitise_perturbation(snap.get("perturbation"), len(claims)),
        divergences=divergences,
    )
