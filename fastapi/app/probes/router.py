"""Probe generation and grading router (§8, §12).

Endpoints:
    POST /probes/generate       — Generate a probe for a concept
    POST /probes/check-leakage  — Check probe for answer leakage
    POST /probes/grade-attempt  — Grade a probe attempt (delegates to grading)

Probe types (§8):
    CLOZE, RECALL, PROCESS_TRACE, PROCEDURAL, MISCONCEPTION_MCQ,
    CONCEPT_SORT, PERTURBATION, NEAR_TRANSFER, FAR_TRANSFER,
    ANALOGY_FORWARD, ANALOGY_SIMULATE, ANALOGY_BREAKDOWN
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
import psycopg
from psycopg.rows import dict_row

from app.dependencies import get_db
from app.probes.schemas import (
    GenerateProbeRequest,
    GenerateProbeResponse,
    CheckLeakageRequest,
    CheckLeakageResponse,
    GradeAttemptRequest,
)
from app.probes.leakage import validate_probe

router = APIRouter(prefix="/probes", tags=["Probes"])


@router.post("/generate", response_model=GenerateProbeResponse)
async def generate_probe(
    request: GenerateProbeRequest,
    db: psycopg.AsyncConnection = Depends(get_db),
):
    """Generate a probe for a concept.

    Pipeline:
        1. Fetch concept claims from DB
        2. Select probe type (or use requested type)
        3. Generate prompt via LLM
        4. Check for leakage (semantic + lexical)
        5. Retry up to 3 times if leaked
        6. Persist probe and return
    """
    # 1. Fetch concept and claims
    async with db.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT * FROM concepts WHERE id = %s",
            (str(request.concept_id),),
        )
        concept = await cur.fetchone()

    if not concept:
        raise HTTPException(status_code=404, detail="Concept not found")

    async with db.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            """SELECT text, embedding, order_index, is_transition,
                      is_load_bearing, branch_id, aliases
               FROM claims
               WHERE concept_id = %s AND concept_version = %s
               ORDER BY order_index ASC NULLS LAST""",
            (str(request.concept_id), request.concept_version),
        )
        claims = await cur.fetchall()

    if not claims:
        raise HTTPException(
            status_code=422,
            detail="No claims found for this concept version",
        )

    # 2. Generate probe via LLM
    from app.probes.generation import ProbeGenerator
    from app.config import get_settings

    settings = get_settings()
    generator = ProbeGenerator()

    probe_type = request.probe_type
    prompt_text, answer_key = await generator.generate_probe(
        concept=dict(concept),
        claims=[dict(c) for c in claims],
        probe_type=probe_type,
    )

    # 3. Check leakage
    from app.ingestion.embedding import create_embedding_service

    emb_service = create_embedding_service(settings)

    probe_embedding = await emb_service.compute_embedding(prompt_text)
    claim_embeddings = [c["embedding"] for c in claims if c.get("embedding")]
    claim_texts = [c["text"] for c in claims]
    claim_token_lists = [t.split() for t in claim_texts]

    is_valid, sem_score, lex_score = validate_probe(
        probe_embedding, prompt_text.split(),
        claim_embeddings, claim_token_lists,
    )

    # 4. Persist probe
    async with db.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            """INSERT INTO probes (
                id, concept_id, concept_version, type,
                prompt_text, answer_key_snapshot, leaked, retries
            ) VALUES (
                gen_random_uuid(), %s, %s, %s,
                %s, %s::jsonb, %s, 0
            ) RETURNING id""",
            (
                str(request.concept_id), request.concept_version,
                probe_type, prompt_text,
                psycopg.types.json.Jsonb(answer_key),
                not is_valid,
            ),
        )
        row = await cur.fetchone()
        probe_id = row["id"]

    await db.commit()

    return GenerateProbeResponse(
        probe_id=probe_id,
        prompt_text=prompt_text,
        probe_type=probe_type,
        leaked=not is_valid,
    )


@router.post("/check-leakage", response_model=CheckLeakageResponse)
async def check_leakage(request: CheckLeakageRequest):
    """Check a probe text for answer leakage (§5.15)."""
    from app.ingestion.embedding import create_embedding_service
    from app.config import get_settings

    settings = get_settings()
    emb_service = create_embedding_service(settings)

    probe_embedding = await emb_service.compute_embedding(request.probe_text)
    claim_embeddings = await emb_service.compute_batch_embeddings(
        request.required_claims,
    )
    claim_token_lists = [c.split() for c in request.required_claims]

    is_valid, sem_score, lex_score = validate_probe(
        probe_embedding, request.probe_text.split(),
        claim_embeddings, claim_token_lists,
    )

    return CheckLeakageResponse(
        is_valid=is_valid,
        semantic_score=sem_score,
        lexical_score=lex_score,
    )


@router.post("/grade-attempt")
async def grade_probe_attempt(
    request: GradeAttemptRequest,
    db: psycopg.AsyncConnection = Depends(get_db),
):
    """Grade a probe attempt — delegates to the grading router."""
    from app.grading.schemas import GradeRequest as GradingGradeRequest
    from app.grading.router import grade_attempt

    # Look up probe to get concept info
    async with db.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT concept_id, concept_version FROM probes WHERE id = %s",
            (str(request.probe_id),),
        )
        probe = await cur.fetchone()

    if not probe:
        raise HTTPException(status_code=404, detail="Probe not found")

    grading_request = GradingGradeRequest(
        probe_id=request.probe_id,
        learner_id=request.learner_id,
        concept_id=probe["concept_id"],
        concept_version=probe["concept_version"],
        answer_text=request.answer_text,
        answer_payload=request.answer_payload,
        confidence_pre=request.confidence_pre,
    )

    return await grade_attempt(grading_request, db)
