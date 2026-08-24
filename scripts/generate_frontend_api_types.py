from __future__ import annotations

import argparse
from pathlib import Path
import json
import sys
from types import SimpleNamespace
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from backend.runtime.backend_bootstrap import _create_fastapi_app
from backend.models.task_contracts import HealthResponse
from backend.models.translation_target_language import (
    DEFAULT_TRANSLATION_TARGET_LANGUAGE,
    TranslationTargetLanguage,
    get_language_suffix,
)

OUTPUT = REPO_ROOT / "frontend" / "src" / "types" / "generatedApi.ts"
TASK_CATALOG_OUTPUT = REPO_ROOT / "frontend" / "src" / "contracts" / "generatedTaskCatalog.ts"
TASK_MESSAGE_CATALOG_OUTPUT = (
    REPO_ROOT
    / "frontend"
    / "src"
    / "contracts"
    / "generatedTaskMessageCatalog.ts"
)
TRANSLATION_LANGUAGE_CATALOG_OUTPUT = (
    REPO_ROOT
    / "frontend"
    / "src"
    / "contracts"
    / "generatedTranslationTargetLanguages.ts"
)

def _openapi_schema() -> dict[str, Any]:
    dependency_stub = object()
    dependencies = SimpleNamespace(
        audio=dependency_stub,
        transcription=dependency_stub,
        translation=dependency_stub,
        task_orchestrator=dependency_stub,
        download=dependency_stub,
        websocket_notifier=dependency_stub,
        task_manager=dependency_stub,
        settings=dependency_stub,
        asr_service=dependency_stub,
        glossary=dependency_stub,
        editor=dependency_stub,
    )
    api_app, _ = _create_fastapi_app(dependencies)
    schema = api_app.openapi()
    # `/health` belongs to the outer Starlette readiness shell rather than the
    # lazily loaded FastAPI app, so bridge that one real route into the same
    # generated contract.
    schema.setdefault("components", {}).setdefault("schemas", {})[
        "HealthResponse"
    ] = HealthResponse.model_json_schema(
        ref_template="#/components/schemas/{model}",
    )
    schema.setdefault("paths", {})["/health"] = {
        "get": {
            "operationId": "health_check",
            "responses": {
                "200": {
                    "description": "Backend readiness state",
                    "content": {
                        "application/json": {
                            "schema": {"$ref": "#/components/schemas/HealthResponse"}
                        }
                    },
                }
            },
        }
    }
    return schema


OPENAPI_SCHEMA = _openapi_schema()


def _optional(schema: dict[str, Any], name: str) -> bool:
    return name not in set(schema.get("required", []))


def _string_literal(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def _typescript_literal(value: Any) -> str:
    if isinstance(value, str):
        return _string_literal(value)
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return json.dumps(value)
    raise TypeError(f"Unsupported JSON Schema literal: {value!r}")


def _schema_type(schema: dict[str, Any]) -> str:
    if "$ref" in schema:
        name = str(schema["$ref"]).split("/")[-1]
        return name

    if "const" in schema:
        return _typescript_literal(schema["const"])

    if "enum" in schema:
        return " | ".join(_typescript_literal(value) for value in schema["enum"])

    if "anyOf" in schema:
        parts = [_schema_type(part) for part in schema["anyOf"]]
        unique_parts = []
        for part in parts:
            if part not in unique_parts:
                unique_parts.append(part)
        return " | ".join(unique_parts)

    if "oneOf" in schema:
        return " | ".join(_schema_type(part) for part in schema["oneOf"])

    if "allOf" in schema:
        return " & ".join(_schema_type(part) for part in schema["allOf"])

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
        properties = schema.get("properties")
        if isinstance(properties, dict):
            required = set(schema.get("required", []))
            fields = []
            for field_name, field_schema in properties.items():
                optional = "" if field_name in required else "?"
                fields.append(
                    f"{json.dumps(field_name, ensure_ascii=False)}{optional}: "
                    f"{_schema_type(field_schema)}"
                )
            return "{ " + "; ".join(fields) + " }"
        additional = schema.get("additionalProperties")
        if isinstance(additional, dict):
            return f"Record<string, {_schema_type(additional)}>"
        if additional is True:
            return "Record<string, JsonValue>"
        return "Record<string, JsonValue>"

    if not schema or set(schema).issubset({"title", "description", "default", "examples"}):
        return "JsonValue"
    raise RuntimeError(
        "Unsupported OpenAPI schema fragment: "
        + json.dumps(schema, ensure_ascii=False, sort_keys=True)
    )


def _field(schema: dict[str, Any], name: str, prop_schema: dict[str, Any]) -> str:
    optional = _optional(schema, name)
    return f"  {name}{'?' if optional else ''}: {_schema_type(prop_schema)};"


def _interface_from_schema(name: str, schema: dict[str, Any]) -> str:
    if any(key in schema for key in ("enum", "const", "oneOf", "anyOf", "allOf")):
        return f"export type {name} = {_schema_type(schema)};"

    lines = [f"export interface {name} {{"]
    for name, prop_schema in schema.get("properties", {}).items():
        lines.append(_field(schema, name, prop_schema))
    lines.append("}")
    return "\n".join(lines)


def _operation_request_type(operation: dict[str, Any]) -> str:
    parameter_properties: dict[str, Any] = {}
    required_parameters: list[str] = []
    for parameter in operation.get("parameters", []):
        name = str(parameter["name"])
        parameter_properties[name] = parameter.get("schema", {})
        if parameter.get("required"):
            required_parameters.append(name)

    parts: list[str] = []
    if parameter_properties:
        parts.append(
            _schema_type(
                {
                    "type": "object",
                    "properties": parameter_properties,
                    "required": required_parameters,
                }
            )
        )

    request_body = operation.get("requestBody", {})
    content = request_body.get("content", {})
    body_schema = None
    for content_type in ("application/json", "multipart/form-data"):
        if content_type in content:
            body_schema = content[content_type].get("schema", {})
            break
    if body_schema is not None:
        parts.append(_schema_type(body_schema))

    return " & ".join(parts) if parts else "void"


def _operation_response_type(operation: dict[str, Any]) -> str:
    responses = operation.get("responses", {})
    success_codes = sorted(
        code for code in responses if str(code).isdigit() and 200 <= int(code) < 300
    )
    if not success_codes:
        return "void"
    response = responses[success_codes[0]]
    content = response.get("content", {})
    json_content = content.get("application/json")
    if not json_content:
        return "void"
    return _schema_type(json_content.get("schema", {}))


def _render_api_operations() -> str:
    lines = [
        "export interface ApiOperation<Request, Response> {",
        "  request: Request;",
        "  response: Response;",
        "}",
        "",
        "export interface ApiOperations {",
    ]
    endpoint_values: list[str] = []
    for path in sorted(OPENAPI_SCHEMA.get("paths", {})):
        path_item = OPENAPI_SCHEMA["paths"][path]
        for method in ("get", "post", "patch", "put", "delete"):
            operation = path_item.get(method)
            if not operation:
                continue
            operation_id = str(operation["operationId"])
            lines.append(
                f"  {_string_literal(operation_id)}: ApiOperation<"
                f"{_operation_request_type(operation)}, "
                f"{_operation_response_type(operation)}>;"
            )
            endpoint_values.append(
                f"  {_string_literal(operation_id)}: {{ method: "
                f"{_string_literal(method.upper())}, path: {_string_literal(path)} }},"
            )
    lines.extend(
        [
            "}",
            "",
            "export const API_ENDPOINTS = {",
            *endpoint_values,
            "} as const satisfies Record<keyof ApiOperations, { method: string; path: string }>;",
        ]
    )
    return "\n".join(lines)


def _render_task_catalog() -> str:
    catalog = json.loads((REPO_ROOT / "contracts" / "task-catalog.json").read_text(encoding="utf-8"))
    task_types = ", ".join(_string_literal(item) for item in catalog["task_types"])
    step_names = ", ".join(_string_literal(item) for item in catalog["pipeline_steps"].keys())
    return "\n".join(
        [
            "// Generated by scripts/generate_frontend_api_types.py from contracts/task-catalog.json.",
            "// Do not edit by hand.",
            "",
            f"export const TASK_TYPES = [{task_types}] as const;",
            "export type TaskType = (typeof TASK_TYPES)[number];",
            "",
            f"export const PIPELINE_STEP_NAMES = [{step_names}] as const;",
            "export type PipelineStepName = (typeof PIPELINE_STEP_NAMES)[number];",
            "",
        ]
    )


def _render_task_message_catalog() -> str:
    contract = json.loads(
        (REPO_ROOT / "contracts" / "runtime-contract.json").read_text(encoding="utf-8")
    )
    message_codes = ", ".join(
        _string_literal(item) for item in contract["task_message_codes"]
    )
    task_statuses = ", ".join(_string_literal(item) for item in contract["task_statuses"])
    task_sources = ", ".join(_string_literal(item) for item in contract["task_sources"])
    persistence_scopes = ", ".join(
        _string_literal(item) for item in contract["task_persistence_scopes"]
    )
    queue_states = ", ".join(
        _string_literal(item) for item in contract["task_queue_states"]
    )
    lifecycles = ", ".join(
        _string_literal(item) for item in dict.fromkeys(contract["task_lifecycle"].values())
    )
    transitions = json.dumps(
        contract["task_status_transitions"], ensure_ascii=False, separators=(",", ":")
    )
    return "\n".join(
        [
            "// Generated by scripts/generate_frontend_api_types.py from contracts/runtime-contract.json.",
            "// Do not edit by hand.",
            "",
            f"export const TASK_MESSAGE_CODES = [{message_codes}] as const;",
            "export type TaskMessageCode = (typeof TASK_MESSAGE_CODES)[number];",
            "",
            f"export const TASK_STATUSES = [{task_statuses}] as const;",
            "export type TaskStatus = (typeof TASK_STATUSES)[number];",
            "",
            f"export const TASK_SOURCES = [{task_sources}] as const;",
            "export type TaskSource = (typeof TASK_SOURCES)[number];",
            "",
            f"export const TASK_PERSISTENCE_SCOPES = [{persistence_scopes}] as const;",
            "export type TaskPersistenceScope = (typeof TASK_PERSISTENCE_SCOPES)[number];",
            "",
            f"export const TASK_QUEUE_STATES = [{queue_states}] as const;",
            "export type TaskQueueState = (typeof TASK_QUEUE_STATES)[number];",
            "",
            f"export const TASK_LIFECYCLES = [{lifecycles}] as const;",
            "export type TaskLifecycle = (typeof TASK_LIFECYCLES)[number];",
            "",
            "export const TASK_STATUS_TRANSITIONS = " + transitions + " as const satisfies Record<TaskStatus, readonly TaskStatus[]>;",
            "",
        ]
    )


def _render_translation_language_catalog() -> str:
    options = []
    for language in TranslationTargetLanguage:
        options.append(
            "  { "
            f"value: {_string_literal(language.value)}, "
            f"labelKey: {_string_literal(f'languages.{language.value}')}, "
            f"suffix: {_string_literal(get_language_suffix(language))} "
            "},"
        )
    return "\n".join(
        [
            "// Generated by scripts/generate_frontend_api_types.py from backend.models.translation_target_language.",
            "// Do not edit by hand.",
            "",
            'import type { TranslationTargetLanguage } from "../types/generatedApi";',
            'export type { TranslationTargetLanguage } from "../types/generatedApi";',
            "",
            "export const TRANSLATION_TARGET_LANGUAGES = [",
            *options,
            "] as const satisfies readonly {",
            "  value: TranslationTargetLanguage;",
            "  labelKey: string;",
            "  suffix: string;",
            "}[];",
            "",
            "export const DEFAULT_TRANSLATION_TARGET_LANGUAGE: TranslationTargetLanguage =",
            f"  {_string_literal(DEFAULT_TRANSLATION_TARGET_LANGUAGE.value)};",
            "",
        ]
    )


def _render_api_types() -> str:
    schemas = OPENAPI_SCHEMA.get("components", {}).get("schemas", {})
    interfaces = [
        _interface_from_schema(name, schemas[name])
        for name in sorted(schemas)
    ]
    return "\n".join(
        [
            "// Generated by scripts/generate_frontend_api_types.py from FastAPI OpenAPI.",
            "// Do not edit by hand.",
            "",
            "export type JsonPrimitive = string | number | boolean | null;",
            "export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };",
            "",
            *interfaces,
            _render_api_operations(),
            "",
        ]
    )


def _write_or_check(path: Path, content: str, *, check: bool) -> bool:
    if check:
        current = path.read_text(encoding="utf-8") if path.exists() else None
        if current != content:
            print(f"Generated contract drift detected: {path.relative_to(REPO_ROOT)}")
            return False
        return True
    path.write_text(content, encoding="utf-8")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate frontend wire contracts.")
    parser.add_argument(
        "--check",
        action="store_true",
        help="Fail when committed generated files differ from backend sources.",
    )
    args = parser.parse_args()

    outputs = {
        OUTPUT: _render_api_types(),
        TASK_CATALOG_OUTPUT: _render_task_catalog(),
        TASK_MESSAGE_CATALOG_OUTPUT: _render_task_message_catalog(),
        TRANSLATION_LANGUAGE_CATALOG_OUTPUT: _render_translation_language_catalog(),
    }
    valid = all(
        _write_or_check(path, content, check=args.check)
        for path, content in outputs.items()
    )
    if not valid:
        print("Run `python scripts/generate_frontend_api_types.py` and commit the results.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
