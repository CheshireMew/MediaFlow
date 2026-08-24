import ast
from pathlib import Path

from scripts.verify.scan_god_classes import (
    ARCHITECTURE_FILE_LIMITS,
    collect_source_files,
    find_budget_violations,
)

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]


def _python_imports(path: Path) -> list[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    imports: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            imports.append(node.module)
        elif isinstance(node, ast.Import):
            imports.extend(alias.name for alias in node.names)
    return imports


def test_api_layer_does_not_import_core_service_or_utility_implementations():
    violations: list[str] = []
    for path in (REPOSITORY_ROOT / "backend" / "api").rglob("*.py"):
        for imported in _python_imports(path):
            if imported.startswith(("backend.core", "backend.services", "backend.utils")):
                violations.append(f"{path.relative_to(REPOSITORY_ROOT)} -> {imported}")

    assert violations == []


def test_runtime_facades_stay_bounded_after_responsibility_split():
    assert find_budget_violations(REPOSITORY_ROOT) == []


def test_architecture_scan_covers_all_production_roots_and_excludes_tests(tmp_path: Path):
    included = [
        tmp_path / "backend" / "module.py",
        tmp_path / "frontend" / "src" / "module.ts",
        tmp_path / "frontend" / "electron" / "module.ts",
    ]
    excluded = [
        tmp_path / "backend" / "tests" / "test_module.py",
        tmp_path / "frontend" / "src" / "__tests__" / "module.test.ts",
    ]
    for path in [*included, *excluded]:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("source\n", encoding="utf-8")

    assert collect_source_files(tmp_path) == sorted(included)


def test_architecture_limits_reject_a_violation_and_accept_a_legal_fixture(tmp_path: Path):
    relative_path, limit = next(iter(ARCHITECTURE_FILE_LIMITS.items()))
    target = tmp_path / relative_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("line\n" * limit, encoding="utf-8")
    limits = {relative_path: limit}
    assert find_budget_violations(tmp_path, limits) == []

    target.write_text("line\n" * (limit + 1), encoding="utf-8")
    assert find_budget_violations(tmp_path, limits) == [(relative_path, limit + 1, limit)]
