"""Go-deeper API. Express proxies here with the learner id from the JWT.

    POST /deeper/{concept_id}          {learner_id, regenerate?} -> step (generates if absent)
    GET  /deeper/{concept_id}?learner_id=...                     -> stored step (no AI)
"""
from __future__ import annotations

from uuid import UUID

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.deeper.service import DeeperError, DeeperService
from app.dependencies import get_db

router = APIRouter(prefix="/deeper", tags=["Go Deeper"])


class DeeperRequest(BaseModel):
    learner_id: UUID
    regenerate: bool = False


@router.get("/{concept_id}")
async def get_step(concept_id: UUID, learner_id: UUID = Query(...),
                   db: psycopg.AsyncConnection = Depends(get_db)):
    try:
        return await DeeperService(db).get_step(str(concept_id), str(learner_id))
    except DeeperError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)


@router.post("/{concept_id}")
async def go_deeper(concept_id: UUID, request: DeeperRequest,
                    db: psycopg.AsyncConnection = Depends(get_db)):
    try:
        return await DeeperService(db).go_deeper(
            str(concept_id), str(request.learner_id), regenerate=request.regenerate,
        )
    except DeeperError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)
