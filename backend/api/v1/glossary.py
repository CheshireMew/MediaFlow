from fastapi import APIRouter, HTTPException
from typing import List

from backend.models.schemas import (
    CreateGlossaryTermRequest,
    GlossaryTerm,
    UpdateGlossaryTermRequest,
)
from backend.core.container import Services
from backend.core.runtime_access import runtime_service

def _glossary_application():
    from backend.application.glossary_service import GlossaryApplicationService

    return GlossaryApplicationService(runtime_service(Services.GLOSSARY))

router = APIRouter(prefix="/glossary", tags=["Glossary"])

@router.get("/", response_model=List[GlossaryTerm])
def list_terms():
    return _glossary_application().list_terms()

@router.post("/", response_model=GlossaryTerm)
def add_term(req: CreateGlossaryTermRequest):
    return _glossary_application().add_term(req)

@router.patch("/{term_id}", response_model=GlossaryTerm)
def update_term(term_id: str, req: UpdateGlossaryTermRequest):
    try:
        return _glossary_application().update_term(term_id, req)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.delete("/{term_id}")
def delete_term(term_id: str):
    try:
        return _glossary_application().delete_term(term_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
