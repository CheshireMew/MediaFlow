from backend.models.glossary_contracts import CreateGlossaryTermRequest, GlossaryTerm, UpdateGlossaryTermRequest


class GlossaryApplicationService:
    def __init__(self, glossary):
        self._glossary = glossary

    def list_terms(self) -> list[GlossaryTerm]:
        return self._glossary.list_terms()

    def add_term(self, request: CreateGlossaryTermRequest) -> GlossaryTerm:
        return self._glossary.add_term(
            request.source,
            request.target,
            request.note,
            request.category,
        )

    def update_term(
        self,
        term_id: str,
        request: UpdateGlossaryTermRequest,
    ) -> GlossaryTerm:
        updated = self._glossary.update_term(
            term_id,
            request.model_dump(exclude_unset=True),
        )
        if not updated:
            raise ValueError("Term not found")
        return updated

    def delete_term(self, term_id: str) -> dict[str, str]:
        deleted = self._glossary.delete_term(term_id)
        if not deleted:
            raise ValueError("Term not found")
        return {"status": "ok"}
