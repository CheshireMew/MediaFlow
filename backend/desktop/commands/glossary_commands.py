from typing import Any

from backend.application.glossary_service import (
    CreateGlossaryTermRequest,
    GlossaryApplicationService,
)
from backend.desktop.command_registry import register_worker_command
from backend.desktop.worker_context import emit, glossary_service


def _glossary_application() -> GlossaryApplicationService:
    return GlossaryApplicationService(glossary_service())


@register_worker_command("glossary_list")
def handle_glossary_list(request_id: str | None, _payload: dict[str, Any]) -> None:
    terms = _glossary_application().list_terms()
    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": [term.model_dump(mode="json") for term in terms],
    })


@register_worker_command("glossary_add")
def handle_glossary_add(request_id: str | None, payload: dict[str, Any]) -> None:
    term = _glossary_application().add_term(CreateGlossaryTermRequest.model_validate(payload))
    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": term.model_dump(mode="json"),
    })


@register_worker_command("glossary_delete")
def handle_glossary_delete(request_id: str | None, payload: dict[str, Any]) -> None:
    result = _glossary_application().delete_term(payload["term_id"])
    emit({
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": result,
    })
