"""Probe generation via LLM (§8).

Generates probe prompts using structured LLM output.
🔒 The LLM generates the probe text. It never sees scores or rubrics.

Probe type selection logic (§8):
    Prestructural  → CLOZE
    Unistructural  → RECALL
    Multistructural → PROCESS_TRACE or CONCEPT_SORT
    Relational     → PERTURBATION or NEAR_TRANSFER
    Extended_Abstract → FAR_TRANSFER or ANALOGY_*

Payload probe types carry their own answer key, which is validated here
before the probe can be served:
    CLOZE             blanked term + aliases + the claim it blanks
    MISCONCEPTION_MCQ 4 options, exactly one correct, every distractor
                      mapped to a named misconception (§5.14 — an unmapped
                      distractor is a defect and fails validation)
    CONCEPT_SORT      5–6 items with two different partitions: by mechanism
                      (G_m) and by surface (G_s) (§5.13.1)

If generation keeps failing validation or leakage, ``fallback_probe`` builds
a hand-authored probe with no AI call (§6.7 step 5).
"""
from __future__ import annotations

import logging
import random
import re
from dataclasses import dataclass, field
from typing import Any, Optional

from app.probes.style import LEVEL_INSTRUCTIONS, reading_level
from app.providers.generation import GenerationClient, strict_object

logger = logging.getLogger(__name__)

PROBE_SCHEMA = strict_object({"prompt_text": {"type": "string"}})

CLOZE_SCHEMA = strict_object({
    "prompt_text": {"type": "string"},
    "answer": {"type": "string"},
    "aliases": {"type": "array", "items": {"type": "string"}},
    "claim_index": {"type": "integer"},
})

MCQ_SCHEMA = strict_object({
    "prompt_text": {"type": "string"},
    "claim_index": {"type": "integer"},
    "options": {
        "type": "array",
        "items": strict_object({
            "text": {"type": "string"},
            "is_correct": {"type": "boolean"},
            "misconception_tag": {"type": ["string", "null"]},
        }),
    },
})

_GROUPS = {
    "type": "array",
    "items": strict_object({
        "name": {"type": "string"},
        "item_indices": {"type": "array", "items": {"type": "integer"}},
    }),
}
SORT_SCHEMA = strict_object({
    "prompt_text": {"type": "string"},
    "items": {"type": "array", "items": {"type": "string"}},
    "mechanism_groups": _GROUPS,
    "surface_groups": _GROUPS,
})

# §5.12 / §9.5: the model returns the prompt PLUS which listed claims flip and
# which stay invariant when the stated condition changes (0-based indices into
# the provided claims). Used by PERTURBATION and ANALOGY_SIMULATE.
PERTURBATION_SCHEMA = strict_object({
    "prompt_text": {"type": "string"},
    "flipped_indices": {"type": "array", "items": {"type": "integer"}},
    "invariant_indices": {"type": "array", "items": {"type": "integer"}},
})

# §9.5 ANALOGY_BREAKDOWN: the model lists where the analogy stops holding.
BREAKDOWN_SCHEMA = strict_object({
    "prompt_text": {"type": "string"},
    "divergences": {"type": "array", "items": {"type": "string"}},
})

MAX_CONTEXT_CLAIMS = 10
BLANK = "_____"
# How much of the learner's note is shown to the generator as a style guide.
NOTE_EXCERPT_CHARS = 2500

# Probe type → prompt template
PROBE_TEMPLATES = {
    "CLOZE": (
        "Create a fill-in-the-blank question about '{label}'. "
        "Take ONE of the listed claims, rephrase it, and replace one key term "
        f"with '{BLANK}'. The blank must test a specific claim, not a generic "
        "fact. Return the removed term as 'answer', accepted equivalent forms "
        "as 'aliases', and the 0-based index of the claim as 'claim_index'. "
        "The answer must NOT appear anywhere in prompt_text."
    ),
    "RECALL": (
        "Create an open-ended recall question about '{label}'. "
        "Ask the learner to explain the concept in their own words. "
        "The answer should require covering the main claims."
    ),
    "PROCESS_TRACE": (
        "Create a process-trace question about '{label}'. "
        "Ask the learner to walk through the steps of the process/mechanism "
        "in order. The answer should demonstrate sequential understanding."
    ),
    "PROCEDURAL": (
        "Create a procedural question about '{label}'. "
        "Present a concrete input and ask for the expected output. "
        "The answer must be verifiable by execution."
    ),
    "MISCONCEPTION_MCQ": (
        "Create a multiple-choice question about '{label}' testing one of the "
        "listed claims (give its 0-based index as 'claim_index'). Provide "
        "exactly 4 options: exactly one correct (is_correct=true, "
        "misconception_tag=null) and three distractors, each corresponding to "
        "a common, named misconception (misconception_tag = a short snake_case "
        "name for that misconception, e.g. 'confuses_tdz_with_hoisting')."
    ),
    "CONCEPT_SORT": (
        "Create a concept-sort question. Present 5-6 short items that relate "
        "to '{label}' and ask the learner to group them. Provide two valid "
        "groupings over the 0-based item indices: 'mechanism_groups' (by "
        "underlying mechanism) and 'surface_groups' (by surface appearance). "
        "Each grouping must use every item exactly once, have at least 2 "
        "groups, and the two groupings must differ."
    ),
    "PERTURBATION": (
        "Create a perturbation question about '{label}'. Pick ONE condition in "
        "the process and change it. Ask the learner which of the listed claims "
        "change (flip) as a result and which stay the same (invariant). Return "
        "'flipped_indices' (0-based indices of the claims that change) and "
        "'invariant_indices' (0-based indices of the claims that stay the "
        "same). The two lists must not overlap and must reference the provided "
        "claims. Do NOT restate the claims in prompt_text."
    ),
    "NEAR_TRANSFER": (
        "Create a near-transfer question about '{label}'. Present a "
        "novel scenario that requires applying the same principles "
        "in a slightly different context."
    ),
    "FAR_TRANSFER": (
        "Create a far-transfer question about '{label}'. Present a "
        "scenario from a different domain that requires the same "
        "underlying principles."
    ),
    "ANALOGY_FORWARD": (
        "Given the analogy between '{label}' and its target concept, "
        "ask the learner to predict what happens in the target domain "
        "given a change in the source domain."
    ),
    "ANALOGY_SIMULATE": (
        "Ask the learner to simulate the behaviour of '{label}' by reasoning "
        "through the analogy step by step after ONE condition is changed. "
        "Return which of the listed claims change (flip) as a result in "
        "'flipped_indices' and which stay the same in 'invariant_indices' "
        "(0-based indices into the provided claims). The two lists must not "
        "overlap. Do NOT restate the claims in prompt_text."
    ),
    "ANALOGY_BREAKDOWN": (
        "Ask the learner where the analogy for '{label}' breaks down — which "
        "aspects of the source do NOT transfer to the target. Return a list of "
        "'divergences': short statements of where the analogy stops holding. "
        "Do NOT restate the claims verbatim in prompt_text."
    ),
}

# Hand-authored fallbacks (§6.7 step 5) — no AI, no claim text.
FALLBACK_TEMPLATES = {
    "RECALL": "Explain {label} in your own words. Cover what it is, how it works, and why it matters.",
    "PROCESS_TRACE": "Walk through {label} step by step, in order, and say what causes each step to happen.",
    "PROCEDURAL": "Describe the procedure for {label}: what are the inputs, the steps, and the expected output?",
    "PERTURBATION": "Pick one condition in {label} and change it. Which later steps change as a result, and which stay the same? Explain why.",
    "NEAR_TRANSFER": "Describe a new situation, similar to the one in your notes, where {label} applies. Explain how it applies there.",
    "FAR_TRANSFER": "Describe a situation in a completely different field that works on the same principle as {label}. Explain the correspondence.",
    "ANALOGY_FORWARD": "Using your analogy for {label}: if something changes in the analogy, what happens in the real system?",
    "ANALOGY_SIMULATE": "Run your analogy for {label} step by step and describe the real-world outcome at each step.",
    "ANALOGY_BREAKDOWN": "Where does your analogy for {label} stop working? Which parts do not carry over?",
}

# Types whose AI output cannot be replaced by a hand-authored template of the
# same type fall back to RECALL.
FALLBACK_TYPE = {"MISCONCEPTION_MCQ": "RECALL", "CONCEPT_SORT": "RECALL"}

# SOLO level → eligible probe types (§8). Tuples: callers must never be able
# to mutate this shared table.
SOLO_PROBE_MAP: dict[str, tuple[str, ...]] = {
    "Prestructural": ("CLOZE",),
    "Unistructural": ("CLOZE", "RECALL"),
    "Multistructural": ("RECALL", "PROCESS_TRACE", "CONCEPT_SORT"),
    "Relational": (
        "PROCESS_TRACE", "PERTURBATION", "NEAR_TRANSFER",
        "MISCONCEPTION_MCQ",
    ),
    "Extended_Abstract": (
        "FAR_TRANSFER", "ANALOGY_FORWARD", "ANALOGY_SIMULATE",
        "ANALOGY_BREAKDOWN",
    ),
}

ORDER_DEPENDENT_TYPES = frozenset({"PROCESS_TRACE", "PERTURBATION"})
ANALOGY_TYPES = frozenset({"ANALOGY_FORWARD", "ANALOGY_SIMULATE", "ANALOGY_BREAKDOWN"})

_STOPWORDS = frozenset({
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "is", "are", "was",
    "were", "be", "by", "for", "with", "that", "this", "it", "its", "as", "at",
    "from", "which", "when", "then", "than", "into", "their", "there", "these",
})


class ProbeValidationError(ValueError):
    """Structured generator output failed probe validation."""


@dataclass
class GeneratedProbe:
    probe_type: str
    prompt_text: str
    payload: dict = field(default_factory=dict)          # learner-visible extras
    target_claim_index: Optional[int] = None
    cloze: Optional[dict] = None
    mcq: Optional[dict] = None
    sort: Optional[dict] = None
    perturbation: Optional[dict] = None                  # §5.12 expected delta
    divergences: Optional[list[str]] = None              # §9.5 known divergences
    fallback: bool = False


def normalise_tag(tag: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (tag or "").lower()).strip("_")[:64]


def validate_mcq(data: dict, n_claims: int) -> tuple[str, dict, dict, Optional[int]]:
    """Return (prompt, learner payload, snapshot mcq, claim_index) or raise."""
    prompt = (data.get("prompt_text") or "").strip()
    options = data.get("options") or []
    if not prompt:
        raise ProbeValidationError("MCQ has no question text")
    if len(options) != 4:
        raise ProbeValidationError(f"MCQ must have 4 options, got {len(options)}")
    correct = [i for i, o in enumerate(options) if o.get("is_correct")]
    if len(correct) != 1:
        raise ProbeValidationError("MCQ must have exactly one correct option")
    texts = [(o.get("text") or "").strip() for o in options]
    if any(not t for t in texts) or len({t.casefold() for t in texts}) != 4:
        raise ProbeValidationError("MCQ options must be non-empty and distinct")
    for i, o in enumerate(options):
        if i != correct[0] and not normalise_tag(o.get("misconception_tag") or ""):
            raise ProbeValidationError("every MCQ distractor must map to a misconception")

    order = list(range(4))
    random.shuffle(order)  # the generator tends to put the key first
    shuffled = [options[i] for i in order]
    new_correct = order.index(correct[0])
    distractor_map = {
        str(pos): normalise_tag(o["misconception_tag"])
        for pos, o in enumerate(shuffled) if pos != new_correct
    }
    ci = data.get("claim_index")
    claim_index = ci if isinstance(ci, int) and 0 <= ci < n_claims else None
    return (
        prompt,
        {"options": [(o.get("text") or "").strip() for o in shuffled]},
        {"correct_index": new_correct, "n_options": 4, "distractor_map": distractor_map},
        claim_index,
    )


def validate_sort(data: dict) -> tuple[str, dict, dict]:
    """Return (prompt, learner payload, snapshot sort) or raise."""
    from app.grading.concept_sort import partition_labels

    prompt = (data.get("prompt_text") or "").strip()
    items = [(i or "").strip() for i in (data.get("items") or [])]
    if not prompt:
        raise ProbeValidationError("concept sort has no instructions")
    if not 4 <= len(items) <= 8 or any(not i for i in items):
        raise ProbeValidationError(f"concept sort needs 4-8 non-empty items, got {len(items)}")

    def groups_of(key: str) -> list[list[int]]:
        return [list(g.get("item_indices") or []) for g in (data.get(key) or [])]

    g_m, g_s = groups_of("mechanism_groups"), groups_of("surface_groups")
    labels_m = partition_labels(g_m, len(items))
    labels_s = partition_labels(g_s, len(items))
    if labels_m is None or labels_s is None:
        raise ProbeValidationError("each grouping must use every item exactly once")
    if len(g_m) < 2 or len(g_s) < 2:
        raise ProbeValidationError("each grouping needs at least 2 groups")
    if sorted(map(sorted, g_m)) == sorted(map(sorted, g_s)):
        raise ProbeValidationError("mechanism and surface groupings must differ")
    return (
        prompt,
        {"items": items},
        {"n_items": len(items), "mechanism_groups": g_m, "surface_groups": g_s},
    )


def validate_cloze(data: dict, claims: list[dict]) -> tuple[str, dict, Optional[int]]:
    from app.probes.leakage import check_cloze_leakage

    prompt = (data.get("prompt_text") or "").strip()
    answer = (data.get("answer") or "").strip()
    if not prompt or not answer:
        raise ProbeValidationError("cloze needs question text and an answer")
    if "___" not in prompt:
        raise ProbeValidationError("cloze prompt has no blank")
    aliases = [a.strip() for a in (data.get("aliases") or []) if a and a.strip()]
    if check_cloze_leakage(prompt, [answer, *aliases]):
        raise ProbeValidationError("cloze prompt contains its own answer")
    ci = data.get("claim_index")
    claim_index = ci if isinstance(ci, int) and 0 <= ci < min(len(claims), MAX_CONTEXT_CLAIMS) else None
    return prompt, {"answer": answer, "aliases": aliases}, claim_index


def validate_perturbation(data: dict, n_claims: int) -> tuple[str, dict]:
    """Return (prompt, expected_delta) for a PERTURBATION/ANALOGY_SIMULATE probe.

    expected_delta = {"flipped": [idx...], "invariant": [idx...]} referencing
    the provided claims. Both lists must be in range and disjoint (a claim
    cannot both flip and stay). At least one classification is required (an
    all-empty delta carries no signal). Raises ProbeValidationError otherwise.
    """
    prompt = (data.get("prompt_text") or "").strip()
    if not prompt:
        raise ProbeValidationError("perturbation has no question text")

    def _clean(key: str) -> list[int]:
        out: list[int] = []
        for v in data.get(key) or []:
            if isinstance(v, bool):
                continue
            if isinstance(v, int) and 0 <= v < n_claims and v not in out:
                out.append(v)
        return out

    flipped = _clean("flipped_indices")
    invariant = _clean("invariant_indices")
    if set(flipped) & set(invariant):
        raise ProbeValidationError("perturbation flipped/invariant sets overlap")
    if not flipped and not invariant:
        raise ProbeValidationError("perturbation classifies no claims")
    return prompt, {"flipped": flipped, "invariant": invariant}


def validate_breakdown(data: dict) -> tuple[str, list[str]]:
    """Return (prompt, divergences) for an ANALOGY_BREAKDOWN probe (§9.5)."""
    prompt = (data.get("prompt_text") or "").strip()
    if not prompt:
        raise ProbeValidationError("analogy breakdown has no question text")
    divergences = [
        d.strip() for d in (data.get("divergences") or [])
        if isinstance(d, str) and d.strip()
    ]
    if not divergences:
        raise ProbeValidationError("analogy breakdown lists no divergences")
    return prompt, divergences


def fallback_probe(probe_type: str, concept: dict, claims: list[dict]) -> GeneratedProbe:
    """Hand-authored probe, no AI (§6.7 step 5)."""
    label = concept.get("canonical_label") or "this concept"
    if probe_type == "CLOZE":
        cloze = _deterministic_cloze(claims)
        if cloze is not None:
            idx, prompt, answer = cloze
            return GeneratedProbe(
                probe_type="CLOZE", prompt_text=prompt, target_claim_index=idx,
                cloze={"answer": answer, "aliases": []}, fallback=True,
            )
        probe_type = "RECALL"

    # §5.12 / §9.5: a delta-scored probe still needs an expected_delta to grade
    # against. Hand-author a conservative one: for a CONVENTIONAL concept the
    # correct answer is "nothing changes" (all claims invariant); otherwise the
    # first claim flips and the rest stay invariant. This degrades without AI
    # while keeping the delta grader active.
    if probe_type in {"PERTURBATION", "ANALOGY_SIMULATE"} and claims:
        n = len(claims)
        if concept.get("category") == "CONVENTIONAL":
            delta = {"flipped": [], "invariant": list(range(n))}
        else:
            delta = {"flipped": [0], "invariant": list(range(1, n))}
        template = FALLBACK_TEMPLATES.get(probe_type, FALLBACK_TEMPLATES["PERTURBATION"])
        return GeneratedProbe(
            probe_type=probe_type, prompt_text=template.format(label=label),
            perturbation=delta, fallback=True,
        )

    probe_type = FALLBACK_TYPE.get(probe_type, probe_type)
    template = FALLBACK_TEMPLATES.get(probe_type, FALLBACK_TEMPLATES["RECALL"])
    return GeneratedProbe(
        probe_type=probe_type, prompt_text=template.format(label=label), fallback=True,
    )


def _deterministic_cloze(claims: list[dict]) -> Optional[tuple[int, str, str]]:
    """Blank the longest alias (else the longest content word) of a claim."""
    for idx, claim in enumerate(claims):
        text = claim.get("text") or ""
        candidates = sorted(
            (a for a in (claim.get("aliases") or []) if a and a in text),
            key=len, reverse=True,
        )
        if not candidates:
            words = [w.strip(".,;:!?()\"'") for w in text.split()]
            words = [w for w in words if len(w) >= 5 and w.lower() not in _STOPWORDS]
            candidates = sorted(words, key=len, reverse=True)
        if candidates:
            term = candidates[0]
            prompt = "Fill in the blank: " + text.replace(term, BLANK, 1)
            if term.lower() not in prompt.lower():
                return idx, prompt, term
    return None


class ProbeGenerator:
    """Generates probe prompts via LLM structured output."""

    def __init__(self, client: GenerationClient | None = None, *, conn=None):
        if client is None:
            from app.providers.generation import get_guarded_generation_client
            client = get_guarded_generation_client(conn=conn)
        self._client = client

    async def select_probe_type(
        self,
        solo_level: str,
        shape: str,
        attempted_types: list[str] | None = None,
        track: str | None = None,
    ) -> str:
        """Select an appropriate probe type based on SOLO level (§8).

        Round-robin over types not yet used for this concept, so mastery
        condition 3 (>= 2 distinct types, §5.18.1) is reachable. When every
        eligible type has been used, the least recently used one is chosen.
        ``attempted_types`` is ordered most-recent first.
        """
        # Copy — never mutate the shared SOLO_PROBE_MAP.
        eligible = list(SOLO_PROBE_MAP.get(solo_level, ("RECALL",)))

        if shape == "DEFINITION":
            narrowed = [t for t in eligible if t not in ORDER_DEPENDENT_TYPES]
            eligible = narrowed or eligible
        if track != "ANALOGY":
            narrowed = [t for t in eligible if t not in ANALOGY_TYPES]
            eligible = narrowed or ["FAR_TRANSFER"]

        # For PROCEDURAL shape, prefer PROCEDURAL type
        if shape == "PROCEDURAL" and "PROCEDURAL" not in eligible:
            eligible.append("PROCEDURAL")

        attempted = list(attempted_types or [])
        remaining = [t for t in eligible if t not in attempted]
        if remaining:
            return random.choice(remaining)
        # All used: least recently used (largest index in most-recent-first list).
        return max(eligible, key=lambda t: attempted.index(t))

    async def generate_probe(
        self,
        concept: dict,
        claims: list[dict],
        probe_type: str,
        variant: str = "",
        violation: str | None = None,
        focus: str | None = None,
        note_text: str | None = None,
        style_feedback: str | None = None,
    ) -> GeneratedProbe:
        """Generate and validate one probe via the guarded LLM client.

        Args:
            concept: concept dict with 'canonical_label', 'shape', etc.
            claims: list of claim dicts with 'text', 'order_index', etc.
            probe_type: one of the probe type enum values.
            variant: cache variant — each leakage retry is a fresh sample.
            violation: leakage report from the previous attempt, appended so
                the regenerated probe avoids the same leak (§6.7).
            focus: optional extra instruction (e.g. the target branch).

        Raises:
            ProbeValidationError: the structured output is not a valid probe.
            ProviderError: the provider call failed (budget, auth, network).
        """
        label = concept.get("canonical_label", "this concept")
        shape = concept.get("shape", "DEFINITION")
        claim_texts = [c["text"] for c in claims]

        template = PROBE_TEMPLATES.get(probe_type, PROBE_TEMPLATES["RECALL"])
        base_prompt = template.format(label=label)

        context = (
            f"Concept: {label}\n"
            f"Shape: {shape}\n"
            f"Number of claims: {len(claim_texts)}\n\n"
            f"Claims for context (DO NOT reproduce these verbatim in the question):\n"
        )
        for i, ct in enumerate(claim_texts[:MAX_CONTEXT_CLAIMS]):
            context += f"  {i}. {ct}\n"
        # The learner's own note: the question must sound like it was built
        # from these words, at this level.
        style_source = (note_text or "").strip() or "\n".join(claim_texts)
        level = reading_level(style_source)
        context += f"\nReading level: {level}. {LEVEL_INSTRUCTIONS[level]}\n"
        if note_text and note_text.strip():
            context += (
                "\nThe learner's own note (reuse ITS words and phrasing so the "
                "question sounds like the learner wrote it; do not copy whole "
                "sentences):\n\"\"\"\n" + note_text.strip()[:NOTE_EXCERPT_CHARS] + "\n\"\"\"\n"
            )
        if focus:
            context += f"\n{focus}\n"
        if violation:
            context += (
                "\nYour previous question was rejected because it leaked the "
                f"answer ({violation}). Rephrase it so it does not restate the claims.\n"
            )
        if style_feedback:
            context += (
                "\nYour previous question was rejected because it used words the "
                f"learner never wrote: {style_feedback}. Rewrite it using only the "
                "learner's own words from the note, as simply as they wrote it.\n"
            )

        system_prompt = (
            "You are generating a learning assessment probe. "
            "Generate ONLY what the learner will see plus the structured fields "
            "requested. Do NOT include the answer in the question text. Do NOT "
            "reproduce any claim verbatim — the question must test "
            "understanding, not recognition.\n"
            "Faithfulness and tone (these claims come from the learner's own note):\n"
            "- Test ONLY what the learner wrote. Never introduce facts, terms, "
            "numbers, examples or details that are not in their note.\n"
            "- Use the learner's OWN words. If they wrote 'make', say 'make', not "
            "'create' or 'produce'. Never swap their words for synonyms or "
            "fancier terms.\n"
            "- Match their difficulty and sentence style exactly. A simple note "
            "gets a simple question; do not make it harder than the note.\n"
            "- Keep it short: one or two sentences. Answer options (if any) must "
            "also use the learner's words.\n"
            "Return JSON matching the schema."
        )

        schema = {
            "CLOZE": CLOZE_SCHEMA,
            "MISCONCEPTION_MCQ": MCQ_SCHEMA,
            "CONCEPT_SORT": SORT_SCHEMA,
            "PERTURBATION": PERTURBATION_SCHEMA,
            "ANALOGY_SIMULATE": PERTURBATION_SCHEMA,
            "ANALOGY_BREAKDOWN": BREAKDOWN_SCHEMA,
        }.get(probe_type, PROBE_SCHEMA)

        # `variant` gives each leakage retry its own cache entry, so a retry is
        # a fresh sample instead of replaying the probe that just leaked.
        result = await self._client.generate_structured(
            system=system_prompt,
            prompt=f"{base_prompt}\n\n{context}",
            schema=schema,
            variant=variant,
        )
        data = result.data or {}

        if probe_type == "MISCONCEPTION_MCQ":
            prompt, payload, mcq, ci = validate_mcq(data, min(len(claims), MAX_CONTEXT_CLAIMS))
            return GeneratedProbe(probe_type, prompt, payload=payload, mcq=mcq, target_claim_index=ci)
        if probe_type == "CONCEPT_SORT":
            prompt, payload, sort = validate_sort(data)
            return GeneratedProbe(probe_type, prompt, payload=payload, sort=sort)
        if probe_type == "CLOZE":
            prompt, cloze, ci = validate_cloze(data, claims)
            return GeneratedProbe(probe_type, prompt, cloze=cloze, target_claim_index=ci)
        if probe_type in {"PERTURBATION", "ANALOGY_SIMULATE"}:
            prompt, delta = validate_perturbation(data, min(len(claims), MAX_CONTEXT_CLAIMS))
            return GeneratedProbe(probe_type, prompt, perturbation=delta)
        if probe_type == "ANALOGY_BREAKDOWN":
            prompt, divergences = validate_breakdown(data)
            return GeneratedProbe(probe_type, prompt, divergences=divergences)

        prompt = (data.get("prompt_text") or "").strip()
        if not prompt:
            raise ProbeValidationError("generator returned no question text")
        return GeneratedProbe(probe_type, prompt)
