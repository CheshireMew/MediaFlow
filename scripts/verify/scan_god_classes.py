
import argparse
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
TARGET_DIRS = ("backend", "frontend/src", "frontend/electron")
SOURCE_SUFFIXES = {".py", ".ts", ".tsx", ".js", ".jsx"}
EXCLUDED_DIRS = {
    ".git",
    "__pycache__",
    "__tests__",
    "archive",
    "build",
    "dist",
    "generated",
    "node_modules",
    "tests",
}
REPORT_THRESHOLD = 300

# These limits protect responsibility splits that have already been reviewed.
ARCHITECTURE_FILE_LIMITS = {
    "backend/config.py": 120,
    "backend/core/database.py": 150,
    "backend/services/task_manager.py": 400,
    "backend/application/settings_service.py": 150,
    "backend/services/asr/model_manager.py": 150,
    "backend/api/v1/editor.py": 160,
    "frontend/src/hooks/useDownloaderController.ts": 180,
    "frontend/src/components/dialogs/SynthesisDialog.tsx": 220,
    "frontend/electron/backend/backendProcess.ts": 360,
}


def count_lines(path: Path) -> int:
    return len(path.read_text(encoding="utf-8", errors="ignore").splitlines())


def collect_source_files(repository_root: Path) -> list[Path]:
    source_files: list[Path] = []
    for target in TARGET_DIRS:
        target_path = repository_root / target
        if not target_path.exists():
            continue
        source_files.extend(
            path
            for path in target_path.rglob("*")
            if path.is_file()
            and path.suffix in SOURCE_SUFFIXES
            and not any(part in EXCLUDED_DIRS for part in path.relative_to(repository_root).parts)
            and not path.name.endswith((".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx"))
        )
    return sorted(source_files)


def find_budget_violations(
    repository_root: Path,
    limits: dict[str, int] = ARCHITECTURE_FILE_LIMITS,
) -> list[tuple[str, int, int]]:
    violations: list[tuple[str, int, int]] = []
    for relative_path, limit in limits.items():
        path = repository_root / relative_path
        if not path.is_file():
            violations.append((relative_path, -1, limit))
            continue
        line_count = count_lines(path)
        if line_count > limit:
            violations.append((relative_path, line_count, limit))
    return violations


def scan_files(repository_root: Path) -> list[tuple[str, int]]:
    candidates = [
        (path.relative_to(repository_root).as_posix(), count_lines(path))
        for path in collect_source_files(repository_root)
        if count_lines(path) >= REPORT_THRESHOLD
    ]
    return sorted(candidates, key=lambda item: (-item[1], item[0]))


def main() -> int:
    parser = argparse.ArgumentParser(description="Report large production modules and enforce reviewed limits.")
    parser.add_argument("--check", action="store_true", help="Return a failure status for limit violations.")
    parser.add_argument("--root", type=Path, default=REPOSITORY_ROOT)
    args = parser.parse_args()

    print(f"Production modules with at least {REPORT_THRESHOLD} lines:")
    candidates = scan_files(args.root)
    if candidates:
        for path, line_count in candidates:
            print(f"{line_count:<6} {path}")
    else:
        print("None")

    violations = find_budget_violations(args.root)
    if violations:
        print("\nArchitecture file-limit violations:")
        for path, line_count, limit in violations:
            actual = "missing" if line_count < 0 else str(line_count)
            print(f"{path}: {actual} lines (limit {limit})")
        return 1 if args.check else 0

    print("\nAll reviewed architecture file limits pass.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
