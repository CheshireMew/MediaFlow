from __future__ import annotations

from pathlib import Path
import json
import sys
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from pydantic import BaseModel

from backend.api.v1.settings import (
    ActiveProviderRequest,
    FasterWhisperCliInstallResponse,
    ProviderConnectionRequest,
    ToolUpdateResponse,
)
from backend.application.glossary_service import (
    CreateGlossaryTermRequest,
    UpdateGlossaryTermRequest,
)
from backend.models.schemas import (
    AnalyzeResult,
    CleanRequest,
    DownloadParams,
    EnhanceRequest,
    FileRef,
    GlossaryTerm,
    MediaReference,
    OCRExtractRequest,
    OCRExtractResponse,
    PipelineRequest,
    PlaylistItem,
    PreprocessingResponse,
    SynthesisRequest,
    SynthesizeParams,
    TaskResponse,
    TaskResult,
    TextEvent,
    TranscribeParams,
    TranscribeRequest,
    TranscribeSegmentRequest,
    TranslateParams,
    TranslateResponse,
)
from backend.services.settings_manager import LLMProvider, UserSettings

OUTPUT = REPO_ROOT / "frontend" / "src" / "types" / "generatedApi.ts"
TASK_CATALOG_OUTPUT = REPO_ROOT / "frontend" / "src" / "contracts" / "generatedTaskCatalog.ts"


MODELS: list[type[BaseModel]] = [
    MediaReference,
    FileRef,
    TaskResult,
    TaskResponse,
    TranslateResponse,
    DownloadParams,
    TranscribeParams,
    TranslateParams,
    SynthesizeParams,
    TranscribeRequest,
    TranscribeSegmentRequest,
    SynthesisRequest,
    OCRExtractRequest,
    OCRExtractResponse,
    EnhanceRequest,
    CleanRequest,
    PreprocessingResponse,
    TextEvent,
    PlaylistItem,
    AnalyzeResult,
    GlossaryTerm,
    LLMProvider,
    UserSettings,
    ActiveProviderRequest,
    ProviderConnectionRequest,
    ToolUpdateResponse,
    FasterWhisperCliInstallResponse,
    CreateGlossaryTermRequest,
    UpdateGlossaryTermRequest,
    PipelineRequest,
]


TYPE_OVERRIDES = {
    "SubtitleSegment": 'import("./task").SubtitleSegment',
}


def _optional(schema: dict[str, Any], name: str) -> bool:
    return name not in set(schema.get("required", []))


def _string_literal(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def _schema_type(schema: dict[str, Any]) -> str:
    if "$ref" in schema:
        name = str(schema["$ref"]).split("/")[-1]
        return TYPE_OVERRIDES.get(name, name)

    if "const" in schema:
        return _string_literal(str(schema["const"]))

    if "enum" in schema:
        return " | ".join(_string_literal(str(value)) for value in schema["enum"] if value is not None) or "null"

    if "anyOf" in schema:
        parts = [_schema_type(part) for part in schema["anyOf"]]
        unique_parts = []
        for part in parts:
            if part not in unique_parts:
                unique_parts.append(part)
        return " | ".join(unique_parts)

    if "oneOf" in schema:
        return " | ".join(_schema_type(part) for part in schema["oneOf"])

    schema_type = schema.get("type")
    if isinstance(schema_type, list):
        return " | ".join(_schema_type({**schema, "type": item}) for item in schema_type)

    if schema_type == "string":
        return "string"
    if schema_type in {"integer", "number"}:
        return "number"
    if schema_type == "boolean":
        return "boolean"
    if schema_type == "null":
        return "null"
    if schema_type == "array":
        item_type = _schema_type(schema.get("items", {}))
        if " | " in item_type:
            item_type = f"({item_type})"
        return f"{item_type}[]"
    if schema_type == "object":
        additional = schema.get("additionalProperties")
        if isinstance(additional, dict):
            return f"Record<string, {_schema_type(additional)}>"
        return "Record<string, unknown>"

    return "unknown"


def _field(schema: dict[str, Any], name: str, prop_schema: dict[str, Any]) -> str:
    optional = _optional(schema, name)
    return f"  {name}{'?' if optional else ''}: {_schema_type(prop_schema)};"


def _interface_from_schema(name: str, schema: dict[str, Any]) -> str:
    lines = [f"export interface {name} {{"]
    for name, prop_schema in schema.get("properties", {}).items():
        lines.append(_field(schema, name, prop_schema))
    lines.append("}")
    return "\n".join(lines)


def _interface_for_model(model: type[BaseModel]) -> str:
    return _interface_from_schema(model.__name__, model.model_json_schema())


def _definition_interfaces() -> list[str]:
    definitions: dict[str, dict[str, Any]] = {}
    for model in MODELS:
        definitions.update(model.model_json_schema().get("$defs", {}))

    output: list[str] = []
    model_names = {model.__name__ for model in MODELS}
    for name in sorted(definitions):
        if name in model_names or name in TYPE_OVERRIDES:
            continue
        output.append(_interface_from_schema(name, definitions[name]))
    return output


def _write_task_catalog() -> None:
    catalog = json.loads((REPO_ROOT / "contracts" / "task-catalog.json").read_text(encoding="utf-8"))
    task_types = ", ".join(_string_literal(item) for item in catalog["task_types"])
    desktop_commands = ", ".join(_string_literal(item) for item in catalog["desktop_task_commands"].keys())
    step_names = ", ".join(_string_literal(item) for item in catalog["pipeline_steps"].keys())
    TASK_CATALOG_OUTPUT.write_text(
        "\n".join(
            [
                "// Generated by scripts/generate_frontend_api_types.py from contracts/task-catalog.json.",
                "// Do not edit by hand.",
                "",
                f"export const TASK_TYPES = [{task_types}] as const;",
                "export type TaskType = (typeof TASK_TYPES)[number];",
                "",
                f"export const DESKTOP_TASK_COMMANDS = [{desktop_commands}] as const;",
                "export type DesktopTaskCommand = (typeof DESKTOP_TASK_COMMANDS)[number];",
                "",
                f"export const PIPELINE_STEP_NAMES = [{step_names}] as const;",
                "export type PipelineStepName = (typeof PIPELINE_STEP_NAMES)[number];",
                "",
                "export const DESKTOP_TASK_COMMAND_TO_TYPE = " + json.dumps(
                    {key: value["task_type"] for key, value in catalog["desktop_task_commands"].items()},
                    ensure_ascii=False,
                    indent=2,
                ) + " as const;",
                "",
            ]
        ),
        encoding="utf-8",
    )


def main() -> None:
    interfaces = [*_definition_interfaces(), *[_interface_for_model(model) for model in MODELS]]
    content = "\n".join(
        [
            "// Generated by scripts/generate_frontend_api_types.py from backend.models.schemas.",
            "// Do not edit by hand.",
            "",
            *interfaces,
            "",
        ]
    )
    OUTPUT.write_text(content, encoding="utf-8")
    _write_task_catalog()


if __name__ == "__main__":
    main()
