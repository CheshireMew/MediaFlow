from fastapi import APIRouter, HTTPException
from typing import List

from backend.models.glossary_contracts import CreateGlossaryTermRequest, GlossaryTerm, GlossaryDeleteResponse, UpdateGlossaryTermRequest


def create_router(glossary_application) -> APIRouter:
    router = APIRouter(prefix="/glossary", tags=["Glossary"])

    @router.get("/", response_model=List[GlossaryTerm])
    def list_terms():
        return glossary_application.list_terms()

    @router.post("/", response_model=GlossaryTerm)
    def add_term(req: CreateGlossaryTermRequest):
        return glossary_application.add_term(req)

    @router.patch("/{term_id}", response_model=GlossaryTerm)
    def update_term(term_id: str, req: UpdateGlossaryTermRequest):
        try:
            return glossary_application.update_term(term_id, req)
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))

    @router.delete("/{term_id}", response_model=GlossaryDeleteResponse)
    def delete_term(term_id: str):
        try:
            return glossary_application.delete_term(term_id)
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))

    return router
