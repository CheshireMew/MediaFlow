
from fastapi import APIRouter, HTTPException
from typing import List
from src.models.schemas import GlossaryTerm
from src.core.container import container, Services

def _get_glossary_service():
    return container.get(Services.GLOSSARY)
from pydantic import BaseModel

router = APIRouter(prefix="/glossary", tags=["Glossary"])

class CreateTermRequest(BaseModel):
    source: str
    target: str
    note: str | None = None
    category: str = "general"

class UpdateTermRequest(BaseModel):
    source: str | None = None
    target: str | None = None
    note: str | None = None
    category: str | None = None

@router.get("/", response_model=List[GlossaryTerm])
def list_terms():
    return _get_glossary_service().list_terms()

@router.post("/", response_model=GlossaryTerm)
def add_term(req: CreateTermRequest):
    return _get_glossary_service().add_term(req.source, req.target, req.note, req.category)

@router.patch("/{term_id}", response_model=GlossaryTerm)
def update_term(term_id: str, req: UpdateTermRequest):
    updated = _get_glossary_service().update_term(term_id, req.dict(exclude_unset=True))
    if not updated:
        raise HTTPException(status_code=404, detail="Term not found")
    return updated

@router.delete("/{term_id}")
def delete_term(term_id: str):
    success = _get_glossary_service().delete_term(term_id)
    if not success:
        raise HTTPException(status_code=404, detail="Term not found")
    return {"status": "ok"}
