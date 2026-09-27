"""Concept identity resolution (§4.6).

The system needs to decide whether a concept mentioned in a new note
is the same as an existing concept or a new one. This is a core decision
that everything downstream depends on.

Decision table (§4.6):
    sim >= τ_identity (0.90)     → SAME concept (merge claims)
    τ (0.82) <= sim < 0.90       → AMBIGUOUS: create new, flag MERGE_CANDIDATE
    sim < τ (0.82)               → NEW concept

Consequences (§4.6):
    - Decay tracked per concept, not per note
    - Claim set = union of claims from attached notes, deduped by sim at τ
    - Edit bumps concept version (D-04), not just note
    - Clustering operates on concepts, never notes

🔒 Exact k-NN only — no HNSW/IVFFlat (D-03).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from app.grading.coverage import cosine_similarity

# Thresholds (§5.26)
IDENTITY_THRESHOLD: float = 0.90   # τ_identity: SAME concept
MATCH_THRESHOLD: float = 0.82      # τ: baseline semantic match


@dataclass
class IdentityResolution:
    """Result of concept identity resolution."""
    concept_id: Optional[str]
    is_new: bool
    is_merge_candidate: bool
    similarity: Optional[float]
    matched_label: Optional[str]
    # Nearest existing concept, set even when is_new (needed to record the
    # MERGE_CANDIDATE edge for the ambiguous band).
    best_match_id: Optional[str] = None


def resolve_concept_identity(
    label_embedding: list[float],
    existing_concepts: list[dict],
    identity_threshold: float = IDENTITY_THRESHOLD,
    match_threshold: float = MATCH_THRESHOLD,
) -> IdentityResolution:
    """Resolve whether a concept is new, existing, or ambiguous (§4.6).

    Compares the new concept's label embedding against all existing
    concepts using exact k-NN (no approximate indexes).

    Args:
        label_embedding: embedding vector for the new concept's label.
        existing_concepts: list of dicts with 'id', 'label', 'embedding'.
        identity_threshold: τ_identity (default 0.90).
        match_threshold: τ (default 0.82).

    Returns:
        IdentityResolution with the decision.

    Decision logic:
        sim >= 0.90:  SAME — merge into existing concept
        0.82 <= sim < 0.90:  AMBIGUOUS — create new, flag MERGE_CANDIDATE
        sim < 0.82:  NEW — create new concept
    """
    if not existing_concepts:
        return IdentityResolution(
            concept_id=None,
            is_new=True,
            is_merge_candidate=False,
            similarity=None,
            matched_label=None,
        )

    best_sim = -1.0
    best_concept_id: Optional[str] = None
    best_label: Optional[str] = None

    for concept in existing_concepts:
        concept_embedding = concept.get("embedding")
        if concept_embedding is None:
            continue

        sim = cosine_similarity(label_embedding, concept_embedding)
        if sim > best_sim:
            best_sim = sim
            best_concept_id = concept["id"]
            best_label = concept.get("label", "")

    if best_sim >= identity_threshold:
        # SAME: merge into existing concept
        return IdentityResolution(
            concept_id=best_concept_id,
            is_new=False,
            is_merge_candidate=False,
            similarity=best_sim,
            matched_label=best_label,
            best_match_id=best_concept_id,
        )
    elif best_sim >= match_threshold:
        # AMBIGUOUS: create new, flag for weekly merge review
        return IdentityResolution(
            concept_id=None,
            is_new=True,
            is_merge_candidate=True,
            similarity=best_sim,
            matched_label=best_label,
            best_match_id=best_concept_id,
        )
    else:
        # NEW: no close match
        return IdentityResolution(
            concept_id=None,
            is_new=True,
            is_merge_candidate=False,
            similarity=best_sim if best_sim > 0 else None,
            matched_label=best_label if best_sim > 0 else None,
            best_match_id=best_concept_id if best_sim > 0 else None,
        )


def deduplicate_claims(
    new_claims: list[dict],
    existing_claims: list[dict],
    threshold: float = MATCH_THRESHOLD,
) -> list[dict]:
    """Deduplicate new claims against existing claims by similarity (§4.6).

    When merging notes into the same concept, the claim set is the union
    deduplicated by similarity at τ. A new claim that matches an existing
    one above τ is considered a duplicate and not added.

    Args:
        new_claims: list of dicts with 'text' and 'embedding'.
        existing_claims: list of dicts with 'text' and 'embedding'.
        threshold: deduplication threshold (default 0.82).

    Returns:
        List of new claims that are NOT duplicates of existing ones.
    """
    if not existing_claims:
        return new_claims

    unique: list[dict] = []

    for new_claim in new_claims:
        new_emb = new_claim.get("embedding")
        if new_emb is None:
            unique.append(new_claim)
            continue

        is_dup = False
        for existing in existing_claims:
            existing_emb = existing.get("embedding")
            if existing_emb is None:
                continue

            sim = cosine_similarity(new_emb, existing_emb)
            if sim >= threshold:
                is_dup = True
                break

        if not is_dup:
            unique.append(new_claim)

    return unique