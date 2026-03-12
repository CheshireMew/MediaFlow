"""
Path validation utility.

Resolves user-supplied paths to absolute form.
This is a local desktop application (backend listens on 127.0.0.1 only),
so directory-whitelist restrictions are not applied.
"""
from pathlib import Path


def validate_path(user_path: str, label: str = "path") -> Path:
    """Resolve a user-supplied path to an absolute Path."""
    return Path(user_path).resolve()
