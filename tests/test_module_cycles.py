import ast
import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


def _cycles(graph: dict[str, set[str]]) -> list[list[str]]:
    index = 0
    stack: list[str] = []
    on_stack: set[str] = set()
    indices: dict[str, int] = {}
    low_links: dict[str, int] = {}
    found: list[list[str]] = []

    def visit(node: str) -> None:
        nonlocal index
        indices[node] = low_links[node] = index
        index += 1
        stack.append(node)
        on_stack.add(node)
        for dependency in graph[node]:
            if dependency not in graph:
                continue
            if dependency not in indices:
                visit(dependency)
                low_links[node] = min(low_links[node], low_links[dependency])
            elif dependency in on_stack:
                low_links[node] = min(low_links[node], indices[dependency])
        if low_links[node] != indices[node]:
            return
        component: list[str] = []
        while True:
            member = stack.pop()
            on_stack.remove(member)
            component.append(member)
            if member == node:
                break
        if len(component) > 1 or node in graph[node]:
            found.append(sorted(component))

    for node in graph:
        if node not in indices:
            visit(node)
    return sorted(found)


def _python_import_graph() -> dict[str, set[str]]:
    files = list((REPO_ROOT / "backend").rglob("*.py"))
    modules = {
        ".".join(path.relative_to(REPO_ROOT).with_suffix("").parts): path
        for path in files
    }
    graph = {module: set() for module in modules}
    for module, path in modules.items():
        package = module.split(".")[:-1]
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom):
                if node.level:
                    base = package[: len(package) - node.level + 1]
                    names = [".".join(base + ([node.module] if node.module else []))]
                else:
                    names = [node.module or ""]
            else:
                continue
            for name in names:
                if name in modules:
                    graph[module].add(name)
                elif f"{name}.__init__" in modules:
                    graph[module].add(f"{name}.__init__")
    return graph


def _typescript_import_graph() -> dict[str, set[str]]:
    source_root = REPO_ROOT / "frontend" / "src"
    files = [
        path
        for path in source_root.rglob("*")
        if path.suffix in {".ts", ".tsx"} and "generated" not in path.parts
    ]
    modules = {
        path.with_suffix("").relative_to(source_root).as_posix(): path
        for path in files
    }
    graph = {module: set() for module in modules}
    import_pattern = re.compile(r"(?:from\s+|import\s*\()(['\"])(.+?)\1")
    for module, path in modules.items():
        for _, specifier in import_pattern.findall(path.read_text(encoding="utf-8")):
            if not specifier.startswith("."):
                continue
            resolved = (path.parent / specifier).resolve()
            try:
                relative = resolved.relative_to(source_root).as_posix()
            except ValueError:
                continue
            target = next(
                (candidate for candidate in (relative, f"{relative}/index") if candidate in modules),
                None,
            )
            if target:
                graph[module].add(target)
    return graph


def test_production_modules_have_no_import_cycles():
    assert _cycles(_python_import_graph()) == []
    assert _cycles(_typescript_import_graph()) == []
