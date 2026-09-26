"""Graph edge creation and linking (§5.21, §4.6).

Manages the four edge types:
    WIKILINK   — extracted from [[wiki-style]] links in markdown
    SEMANTIC   — computed from embedding similarity >= τ_link (0.80)
    REQUIRES   — extracted as prerequisites (with cycle check, D-15)
    ANALOGY_OF — links between analogy concepts and their targets

Semantic edge construction:
    For a new concept, compute cosine similarity against all existing
    concepts for this learner. Create edges where sim >= τ_link.
    Top-k limiting (k=3) to avoid fully-connected graphs.

WIKILINK extraction is deterministic: parse [[target]] from markdown.
"""

from __future__ import annotations

import re
from app.grading.coverage import cosine_similarity

# Constants (§5.26)
SEMANTIC_LINK_THRESHOLD: float = 0.80
SEMANTIC_TOP_K: int = 3

# Pattern for [[wikilinks]] in markdown
WIKILINK_PATTERN = re.compile(r'\[\[([^\]]+)\]\]')


def extract_wikilinks(markdown_text: str) -> list[str]:
    """Extract [[wikilink]] targets from markdown text.

    This is deterministic — no LLM, no embedding, just regex.

    Args:
        markdown_text: raw markdown content.

    Returns:
        List of unique wikilink target strings.
    """
    matches = WIKILINK_PATTERN.findall(markdown_text)

    # Deduplicate while preserving first-seen order
    seen: set[str] = set()
    unique: list[str] = []
    for target in matches:
        normalised = target.strip()
        if normalised.lower() not in seen:
            seen.add(normalised.lower())
            unique.append(normalised)

    return unique


def find_semantic_neighbours(
    concept_embedding: list[float],
    existing_concepts: list[dict],
    threshold: float = SEMANTIC_LINK_THRESHOLD,
    top_k: int = SEMANTIC_TOP_K,
) -> list[dict]:
    """Find semantically similar concepts for edge creation (§5.21).

    Computes cosine similarity against all existing concepts, returns
    those above τ_link, limited to top-k.

    🔒 Exact k-NN only — no approximate indexes.

    Args:
        concept_embedding: embedding of the new concept.
        existing_concepts: list of dicts with 'id', 'label', 'embedding'.
        threshold: τ_link (default 0.80).
        top_k: maximum number of semantic edges (default 3).

    Returns:
        List of dicts: {'concept_id', 'label', 'similarity'} sorted by
        similarity descending, limited to top_k.
    """
    candidates: list[dict] = []

    for concept in existing_concepts:
        emb = concept.get("embedding")
        if emb is None:
            continue

        sim = cosine_similarity(concept_embedding, emb)
        if sim >= threshold:
            candidates.append({
                "concept_id": concept["id"],
                "label": concept.get("label", ""),
                "similarity": sim,
            })

    # Sort by similarity descending, limit to top_k
    candidates.sort(key=lambda c: c["similarity"], reverse=True)
    return candidates[:top_k]


def compute_edge_weight(
    edge_type: str,
    similarity: float | None = None,
) -> float:
    """Compute edge weight for clustering graph construction (§5.21).

    weight(u,v) = 1.00   if WIKILINK
               = sim(u,v) if SEMANTIC
               = 0.60    if REQUIRES
               = sim(u,v) if ANALOGY_OF (or 0.5 default)
    """
    if edge_type == "WIKILINK":
        return 1.00
    elif edge_type == "SEMANTIC":
        return similarity if similarity is not None else 0.80
    elif edge_type == "REQUIRES":
        return 0.60
    elif edge_type == "ANALOGY_OF":
        return similarity if similarity is not None and similarity > 0 else 0.50
    else:
        return 0.0
