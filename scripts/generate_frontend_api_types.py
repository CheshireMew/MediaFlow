from __future__ import annotations

import argparse
from pathlib import Path
import json
import sys
from types import ModuleType
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from pydantic import BaseModel

from backend.api.v1 import analyze, audio, cookies, settings as settings_api
from backend.models import schemas
from backend.models.translation_target_language import (
    DEFAULT_TRANSLATION_TARGET_LANGUAGE,
    TranslationTargetLanguage,
    get_language_suffix,
)
from backend.services import runtime_diagnostics, settings_manager

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

WIRE_MODEL_MODULES: tuple[ModuleType, ...] = (
    schemas,
    analyze,
    audio,
    cookies,
    settings_api,
    runtime_diagnostics,
    settings_manager,
)


def _discover_wire_models() -> list[type[BaseModel]]:
    discovered: dict[str, type[BaseModel]] = {}
    for module in WIRE_MODEL_MODULES:
        for value in vars(module).values():
            if (
                not isinstance(value, type)
                or not issubclass(value, BaseModel)
                or value is BaseModel
                or value.__module__ != module.__name__
            ):
                continue
            existing = discovered.get(value.__name__)
            if existing is not None and existing is not value:
                raise RuntimeError(
                    f"Duplicate wire model name {value.__name__}: "
                    f"{existing.__module__} and {value.__module__}"
                )
            discovered[value.__name__] = value
    return list(discovered.values())


MODELS = _discover_wire_models()


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
    if "enum" in schema or "const" in schema:
        return f"export type {name} = {_schema_type(schema)};"

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
        if name in model_names:
            continue
        output.append(_interface_from_schema(name, definitions[name]))
    return output


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
    return "\n".join(
        [
            "// Generated by scripts/generate_frontend_api_types.py from contracts/runtime-contract.json.",
            "// Do not edit by hand.",
            "",
            f"export const TASK_MESSAGE_CODES = [{message_codes}] as const;",
            "export type TaskMessageCode = (typeof TASK_MESSAGE_CODES)[number];",
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
    interfaces = [*_definition_interfaces(), *[_interface_for_model(model) for model in MODELS]]
    return "\n".join(
        [
            "// Generated by scripts/generate_frontend_api_types.py from backend wire models.",
            "// Do not edit by hand.",
            "",
            *interfaces,
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
