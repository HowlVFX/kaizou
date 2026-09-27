"""Go deeper: one step down the why-ladder (migration 008).

On request (never in the background) for an unlocked concept P:

  1. One enticing "why" question about what the learner wrote.
  2. A short primer at the learner's level: "now that you know this, even
     that has a reason behind it..." plus a first taste of the explanation.
  3. As many explanations as the concept actually needs, each a LOCKED node
     (UNRESOLVED_PREREQUISITE) with a one-line teaser, linked
     P --EXPLAINED_BY--> E. The learner must write a note to unlock each.
  4. Or: P is bedrock (axiom, definition, fundamental law, observed fact),
     so there is nothing deeper and the chain ends here.

Level: explanations stay at the learner's band or at most one band higher,
so a child climbs young_child -> school -> ... only as they choose to.

The step is cached per concept version: reopening costs nothing; rewriting
the note (new version) lets the learner regenerate it. Primer and teasers
are never part of a note, never extracted, never tested.

🔒 LLM generates structured objects. It does not grade or judge.
"""
from __future__ import annotations

import logging
from uuid import uuid4

import psycopg
from psycopg.rows import dict_row

from app.grading.coverage import as_vector
from app.ingestion.extractor import PREREQ_LEVEL_TEXT, PREREQ_LEVELS, note_level_band
from app.ingestion.identity import resolve_concept_identity
from app.providers.generation import strict_object

logger = logging.getLogger(__name__)

UNRESOLVED = "UNRESOLVED_PREREQUISITE"
MAX_EXPLANATIONS = 6          # safety cap; the model decides how many are needed
DEEPER_VARIANT = "deeper-v2"

DEEPER_SCHEMA = strict_object({
    "is_bedrock": {"type": "boolean"},
    "bedrock_reason": {"type": "string"},
    "question": {"type": "string"},
    "primer": {"type": "string"},
    "simplification": {"type": "string"},
    "explanations": {
        "type": "array",
        "items": strict_object({
            "label": {"type": "string"},
            "teaser": {"type": "string"},
            "level": {"type": "string", "enum": list(PREREQ_LEVELS)},
        }),
    },
})

DEEPER_PROMPT = """A learner wrote the note below about "{label}". They want to go ONE small step deeper: what is the very next "why" underneath what they wrote?

Learner level: {level_text}. Write everything for that person, in the plain words they use.
{chain}
The most important rule: take the SMALLEST possible step. Do not explain the whole mechanism, do not skip ahead to the final scientific answer, and do not name the specialist machinery behind it. Go down exactly one layer, the one this learner is ready for right now. There will be more steps later if they want them.

Return:
- is_bedrock: true ONLY if nothing deeper explains this (an axiom or definition in maths, a fundamental law of physics, or a plain observed fact). Then give bedrock_reason (one simple sentence saying why the "why" stops here) and leave question, primer and explanations empty.
- question: ONE short, curious "why"/"how" question (max 15 words) about what THEY wrote, in everyday words (e.g. "But why does sugar give us energy?").
- primer: 2-3 short sentences. Open by saying that even what they just learnt has a reason behind it, then give a simple first taste of just the next layer. No technical names, numbers, formulas or jargon the learner did not use. A teaser, not a lesson.
- simplification: ONLY if a sentence the learner actually wrote is wrong or misleading (e.g. "the Sun moves around the Earth"), say so kindly in one plain sentence. Never comment on facts they did not write. Otherwise "".
- explanations: only the ideas needed for this one step (usually 1-3, never padding):
  - label: a short plain name (2-5 words) this learner would understand
  - teaser: one enticing plain sentence (max 20 words) about what this idea will reveal
  - level: who could understand it (young_child, school, university, expert). Prefer the learner's own level; one level higher only if the next step truly needs it.

Return JSON matching the schema."""

# Reading-level rank the step's question + primer may reach, per band (see
# app.probes.style.reading_level): a child's step must read "very simple" or
# "simple", and so on. One retry with feedback if it reads harder.
_READING_RANK = {"very simple": 0, "simple": 1, "standard": 2, "technical": 3}
MAX_READING_RANK = {"young_child": 1, "school": 1, "university": 2, "expert": 3}


def too_hard_for(band: str, question: str, primer: str) -> bool:
    from app.probes.style import reading_level
    text = f"{question or ''} {primer or ''}".strip()
    if not text:
        return False
    return _READING_RANK[reading_level(text)] > MAX_READING_RANK[band]


def learner_text(note_text: str) -> str:
    """Only the learner's own words: drop '## Source: ...' sections that older
    versions pasted into the note body (sources now live separately)."""
    import re
    return re.split(r"(?m)^## Source:", note_text or "", maxsplit=1)[0].strip() or (note_text or "")


class DeeperError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _vector_literal(vec) -> str | None:
    if vec is None:
        return None
    if isinstance(vec, str):
        return vec
    return "[" + ",".join(repr(float(x)) for x in vec) + "]"


def clamp_explanations(items: list[dict], band: str) -> list[dict]:
    """Keep explanations at the learner's band or one above (dedupe, cap).
    If every suggestion jumps further, keep them but pin them one band up so
    the ladder still continues (a step that climbs, never a leap)."""
    cur = PREREQ_LEVELS.index(band)
    top = min(cur + 1, len(PREREQ_LEVELS) - 1)
    seen: set[str] = set()
    clean: list[dict] = []
    for it in items or []:
        label = " ".join(str(it.get("label") or "").split())[:120]
        if not label or label.lower() in seen:
            continue
        seen.add(label.lower())
        lvl = it.get("level") if it.get("level") in PREREQ_LEVELS else band
        rank = max(PREREQ_LEVELS.index(lvl), cur)
        clean.append({
            "label": label,
            "teaser": " ".join(str(it.get("teaser") or "").split())[:300],
            "rank": rank,
        })
    within = [c for c in clean if c["rank"] <= top]
    chosen = within or clean
    return [
        {"label": c["label"], "teaser": c["teaser"], "level_band": PREREQ_LEVELS[min(c["rank"], top)]}
        for c in chosen
    ][:MAX_EXPLANATIONS]


class DeeperService:
    def __init__(self, conn: psycopg.AsyncConnection, client=None, embedding_service=None):
        self._conn = conn
        self._client = client
        self._embedding = embedding_service

    def _gen(self):
        if self._client is None:
            from app.providers.generation import get_guarded_generation_client
            self._client = get_guarded_generation_client(conn=self._conn)
        return self._client

    def _emb(self):
        if self._embedding is None:
            from app.ingestion.embedding import create_embedding_service
            self._embedding = create_embedding_service(conn=self._conn)
        return self._embedding

    # -- reads ------------------------------------------------------------

    async def _concept(self, concept_id: str, learner_id: str) -> dict:
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                "SELECT id, learner_id, canonical_label, status::text AS status, version, c_bloom, "
                "level_band, deeper_question, deeper_primer, simplification_note, deeper_version, "
                "is_bedrock, bedrock_reason FROM concepts WHERE id = %s",
                (concept_id,),
            )
            row = await cur.fetchone()
        if not row or str(row["learner_id"]) != str(learner_id):
            raise DeeperError(404, "Concept not found")
        return dict(row)

    async def _note_text(self, concept_id: str) -> str:
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                "SELECT n.body_md FROM notes n JOIN note_concepts nc ON nc.note_id = n.id "
                "WHERE nc.concept_id = %s",
                (concept_id,),
            )
            rows = await cur.fetchall()
        return "\n\n".join((r.get("body_md") or "") for r in rows).strip()

    async def _chain(self, concept_id: str) -> list[dict]:
        """Ancestors via EXPLAINED_BY, root first (how the learner got here)."""
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                WITH RECURSIVE up(id, depth) AS (
                    SELECT e.source_id, 1 FROM edges e
                    WHERE e.target_id = %s AND e.type = 'EXPLAINED_BY'
                    UNION
                    SELECT e.source_id, up.depth + 1 FROM edges e
                    JOIN up ON e.target_id = up.id
                    WHERE e.type = 'EXPLAINED_BY' AND up.depth < 25
                )
                SELECT c.id, c.canonical_label, MAX(up.depth) AS depth
                FROM up JOIN concepts c ON c.id = up.id
                GROUP BY c.id, c.canonical_label
                ORDER BY depth DESC
                """,
                (concept_id,),
            )
            rows = await cur.fetchall()
        return [{"concept_id": str(r["id"]), "label": r["canonical_label"]} for r in rows]

    async def _children(self, concept_id: str) -> list[dict]:
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                "SELECT c.id, c.canonical_label, c.teaser, c.level_band, c.status::text AS status, "
                "c.is_bedrock FROM edges e JOIN concepts c ON c.id = e.target_id "
                "WHERE e.source_id = %s AND e.type = 'EXPLAINED_BY' ORDER BY c.created_at",
                (concept_id,),
            )
            rows = await cur.fetchall()
        return [
            {"concept_id": str(r["id"]), "label": r["canonical_label"], "teaser": r.get("teaser"),
             "level_band": r.get("level_band"), "locked": r["status"] == UNRESOLVED,
             "is_bedrock": bool(r.get("is_bedrock"))}
            for r in rows
        ]

    async def get_step(self, concept_id: str, learner_id: str) -> dict:
        """The stored step (no AI). has_step=False when never generated."""
        c = await self._concept(concept_id, learner_id)
        return await self._serialise(c)

    async def _serialise(self, c: dict) -> dict:
        cid = str(c["id"])
        has_step = bool(c.get("is_bedrock") or c.get("deeper_question"))
        return {
            "concept_id": cid,
            "label": c["canonical_label"],
            "level_band": c.get("level_band"),
            "has_step": has_step,
            "stale": has_step and c.get("deeper_version") not in (None, c["version"]),
            "is_bedrock": bool(c.get("is_bedrock")),
            "bedrock_reason": c.get("bedrock_reason"),
            "question": c.get("deeper_question"),
            "primer": c.get("deeper_primer"),
            "simplification": c.get("simplification_note"),
            "chain": await self._chain(cid),
            "explanations": await self._children(cid),
        }

    # -- generation -------------------------------------------------------

    async def go_deeper(self, concept_id: str, learner_id: str, regenerate: bool = False) -> dict:
        c = await self._concept(concept_id, learner_id)
        if c["status"] == UNRESOLVED:
            raise DeeperError(422, "Write a note on this concept first, then you can go deeper.")
        has_step = bool(c.get("is_bedrock") or c.get("deeper_question"))
        current = c.get("deeper_version") == c["version"]
        if has_step and (current or not regenerate):
            return await self._serialise(c)

        note_text = learner_text(await self._note_text(concept_id))
        if not note_text:
            raise DeeperError(422, "This concept has no note to go deeper from.")
        band = c.get("level_band") or note_level_band(note_text, c.get("c_bloom"))
        chain = await self._chain(concept_id)
        chain_text = (
            "\nHow the learner got here (each step explains the one before): "
            + " -> ".join([x["label"] for x in chain] + [c["canonical_label"]]) + "\n"
            if chain else ""
        )
        system = (
            DEEPER_PROMPT
            .replace("{label}", c["canonical_label"])
            .replace("{level_text}", PREREQ_LEVEL_TEXT[band])
            .replace("{chain}", chain_text)
        )
        result = await self._gen().generate_structured(
            system=system,
            prompt=note_text[:4000],
            schema=DEEPER_SCHEMA,
            variant=f"{DEEPER_VARIANT}-v{c['version']}",
        )
        data = result.data or {}
        if not data.get("is_bedrock") and too_hard_for(band, data.get("question"), data.get("primer")):
            # Went too far / too hard in one go: ask once more for a smaller, plainer step.
            logger.info("Deeper step too hard for %s; retrying smaller", band)
            retry = await self._gen().generate_structured(
                system=system + (
                    "\n\nYour previous answer was too advanced for this learner. Take an even smaller "
                    "step, use shorter sentences and only everyday words."
                ),
                prompt=note_text[:4000],
                schema=DEEPER_SCHEMA,
                variant=f"{DEEPER_VARIANT}-v{c['version']}-simpler",
            )
            data = retry.data or data
        explanations = [] if data.get("is_bedrock") else clamp_explanations(data.get("explanations") or [], band)
        is_bedrock = bool(data.get("is_bedrock")) or not explanations
        question = " ".join(str(data.get("question") or "").split())[:300] or None
        primer = " ".join(str(data.get("primer") or "").split())[:1200] or None
        simplification = " ".join(str(data.get("simplification") or "").split())[:400] or None
        bedrock_reason = (
            " ".join(str(data.get("bedrock_reason") or "").split())[:400]
            or ("This is where the 'why' stops: it is a basic truth." if is_bedrock else None)
        )

        ancestor_ids = {x["concept_id"] for x in chain}
        keep_ids = await self._attach_explanations(learner_id, str(c["id"]), explanations, ancestor_ids)
        await self._drop_stale_children(str(c["id"]), keep_ids)

        async with self._conn.cursor() as cur:
            await cur.execute(
                """UPDATE concepts SET level_band = %s, deeper_question = %s, deeper_primer = %s,
                          simplification_note = %s, deeper_version = %s,
                          is_bedrock = %s, bedrock_reason = %s
                   WHERE id = %s AND learner_id = %s""",
                (band, None if is_bedrock else question, None if is_bedrock else primer,
                 simplification, c["version"], is_bedrock,
                 bedrock_reason if is_bedrock else None, str(c["id"]), learner_id),
            )
        await self._conn.commit()
        return await self._serialise(await self._concept(concept_id, learner_id))

    async def _attach_explanations(
        self, learner_id: str, parent_id: str, explanations: list[dict], ancestor_ids: set[str],
    ) -> set[str]:
        """Link each explanation: reuse an existing concept of the learner
        (exact label, else identity match), otherwise create a locked node."""
        if not explanations:
            return set()
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                "SELECT id, canonical_label AS label, label_embedding AS embedding, status::text AS status "
                "FROM concepts WHERE learner_id = %s AND label_embedding IS NOT NULL",
                (learner_id,),
            )
            rows = await cur.fetchall()
        blocked = ancestor_ids | {parent_id}   # never loop back up the ladder
        pool = [
            {"id": str(r["id"]), "label": r["label"], "embedding": as_vector(r["embedding"]),
             "status": r["status"]}
            for r in rows if str(r["id"]) not in blocked
        ]
        embeddings = await self._emb().compute_batch_embeddings([e["label"] for e in explanations])
        keep: set[str] = set()
        for exp, emb in zip(explanations, embeddings):
            emb = as_vector(emb)
            match = next((p for p in pool if p["label"].strip().lower() == exp["label"].lower()), None)
            if match is None:
                res = resolve_concept_identity(emb, pool)
                if not res.is_new and res.concept_id:
                    match = next((p for p in pool if p["id"] == str(res.concept_id)), None)
            async with self._conn.cursor() as cur:
                if match:
                    cid = match["id"]
                    await cur.execute(
                        "UPDATE concepts SET teaser = COALESCE(teaser, %s), level_band = COALESCE(level_band, %s) "
                        "WHERE id = %s",
                        (exp["teaser"] or None, exp["level_band"], cid),
                    )
                else:
                    cid = str(uuid4())
                    await cur.execute(
                        """INSERT INTO concepts (
                               id, learner_id, canonical_label, label_embedding, track, shape, category,
                               status, version, probe_eligible, level_band, teaser
                           ) VALUES (%s, %s, %s, %s::vector, 'SELF_AUTHORED', 'DEFINITION',
                                     'DETERMINISTIC_MECHANISM', 'UNRESOLVED_PREREQUISITE', 1, false, %s, %s)""",
                        (cid, learner_id, exp["label"], _vector_literal(emb),
                         exp["level_band"], exp["teaser"] or None),
                    )
                    pool.append({"id": cid, "label": exp["label"], "embedding": emb, "status": UNRESOLVED})
                await cur.execute(
                    """INSERT INTO edges (id, learner_id, source_id, target_id, type, weight)
                       VALUES (gen_random_uuid(), %s, %s, %s, 'EXPLAINED_BY', 1.0)
                       ON CONFLICT (source_id, target_id, type) DO NOTHING""",
                    (learner_id, parent_id, cid),
                )
            keep.add(cid)
        return keep

    async def _drop_stale_children(self, parent_id: str, keep_ids: set[str]) -> None:
        """On regeneration: unlink old explanations not suggested again; a
        still-locked one with nothing else pointing at it is removed. Learnt
        (unlocked) explanations always stay linked."""
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                "SELECT c.id, c.status::text AS status FROM edges e JOIN concepts c ON c.id = e.target_id "
                "WHERE e.source_id = %s AND e.type = 'EXPLAINED_BY'",
                (parent_id,),
            )
            old = [r for r in await cur.fetchall() if str(r["id"]) not in keep_ids and r["status"] == UNRESOLVED]
            for r in old:
                await cur.execute(
                    "DELETE FROM edges WHERE source_id = %s AND target_id = %s AND type = 'EXPLAINED_BY'",
                    (parent_id, r["id"]),
                )
                await cur.execute(
                    "DELETE FROM concepts c WHERE c.id = %s AND c.status = 'UNRESOLVED_PREREQUISITE' "
                    "AND NOT EXISTS (SELECT 1 FROM edges e WHERE e.source_id = c.id OR e.target_id = c.id) "
                    "AND NOT EXISTS (SELECT 1 FROM notes n WHERE n.target_concept_id = c.id)",
                    (r["id"],),
                )
