from __future__ import annotations

import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


def test_generated_frontend_contracts_have_no_drift() -> None:
    result = subprocess.run(
        [
            sys.executable,
            str(REPO_ROOT / "scripts" / "generate_frontend_api_types.py"),
            "--check",
        ],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stdout + result.stderr

    generated = (
        REPO_ROOT / "frontend" / "src" / "types" / "generatedApi.ts"
    ).read_text(encoding="utf-8")
    assert "export type PipelineStepRequest = DownloadStepRequest |" in generated
    assert "export interface ApiOperations" in generated
    assert "export const API_ENDPOINTS" in generated
    assert "[key: string]: unknown" not in generated
