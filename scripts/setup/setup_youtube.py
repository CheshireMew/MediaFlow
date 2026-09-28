"""Install the anonymous YouTube playback provider; safe to rerun, no account needed."""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import os
import re
import shutil
import subprocess
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from backend.services.youtube_runtime import PROVIDER_VERSION, youtube_tools_dir  # noqa: E402
from backend.config import settings  # noqa: E402


def matching_ejs_requirement() -> str:
    runtime = next(
        (
            dist
            for dist in importlib.metadata.distributions(
                path=[str(settings.PYTHON_TOOL_PACKAGES_DIR)]
            )
            if dist.metadata["Name"] == "yt-dlp"
        ),
        None,
    )
    distribution = runtime or importlib.metadata.distribution("yt-dlp")
    for requirement in distribution.requires or []:
        match = re.match(r"yt-dlp-ejs\s*==\s*([\w.]+)", requirement)
        if match:
            return f"yt-dlp-ejs=={match[1]}"
    raise RuntimeError(
        "Update yt-dlp before installing YouTube components; its EJS requirement is missing."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tools-dir", type=Path, default=youtube_tools_dir())
    args = parser.parse_args()
    target = args.tools_dir.resolve()
    target.mkdir(parents=True, exist_ok=True)
    node, npm, git = (shutil.which(name) for name in ("node", "npm", "git"))
    if not all((node, npm, git)):
        raise RuntimeError("YouTube setup requires Node.js 22+, npm and Git in PATH.")
    version = subprocess.check_output([node, "--version"], text=True).strip()
    if int(version.lstrip("v").split(".")[0]) < 22:
        raise RuntimeError("YouTube setup requires Node.js 22 or newer.")
    env = os.environ.copy()
    env["PIP_CACHE_DIR"] = str(target / "cache" / "pip")
    env["npm_config_cache"] = str(target / "cache" / "npm")
    env["XDG_CACHE_HOME"] = str(target / "cache")
    for name in ("TEMP", "TMP"):
        env[name] = str(target / "temp")
    (target / "temp").mkdir(exist_ok=True)

    # Versioned source is kept for inspection/recovery; never alter another checkout.
    provider = target / f"bgutil-{PROVIDER_VERSION}"
    if not provider.exists():
        subprocess.run(
            [
                git,
                "clone",
                "--depth",
                "1",
                "--branch",
                PROVIDER_VERSION,
                "https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git",
                str(provider),
            ],
            check=True,
            env=env,
        )
    server = provider / "server"
    if not (server / "build" / "generate_once.js").is_file():
        subprocess.run(
            [npm, "ci", "--no-audit", "--no-fund"], cwd=server, env=env, check=True
        )
        subprocess.run(
            [node, "node_modules/typescript/bin/tsc"], cwd=server, env=env, check=True
        )
    actual = subprocess.check_output(
        [node, str(server / "build" / "generate_once.js"), "--version"],
        env=env,
        text=True,
    ).strip()
    if actual != PROVIDER_VERSION:
        raise RuntimeError(f"Provider version mismatch: {actual}")

    # Stage Python packages so a failed installation leaves the previous setup usable.
    staged = target / f"python-packages-{uuid.uuid4().hex}"
    subprocess.run(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            "--no-deps",
            "--target",
            str(staged),
            matching_ejs_requirement(),
            f"bgutil-ytdlp-pot-provider=={PROVIDER_VERSION}",
        ],
        env=env,
        check=True,
    )
    packages = target / "python-packages"
    previous = target / f"python-packages-previous-{uuid.uuid4().hex}"
    if packages.exists():
        packages.rename(previous)
    try:
        staged.rename(packages)
    except Exception:
        if previous.exists():
            previous.rename(packages)
        raise
    print(
        json.dumps(
            {
                "status": "ready",
                "tools_dir": str(target),
                "node_version": version,
                "provider_version": actual,
                "account_cookies_required": False,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
