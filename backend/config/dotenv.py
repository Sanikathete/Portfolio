from __future__ import annotations

from pathlib import Path


def load_dotenv() -> None:
    """
    Minimal .env loader (no external deps).

    Loads environment variables from:
    - repo root `.env` (../.. from this file)
    - backend root `.env` (.. from this file)

    Existing environment variables are not overwritten.
    """

    here = Path(__file__).resolve()
    backend_root = here.parent.parent
    repo_root = backend_root.parent

    for env_path in (repo_root / ".env", backend_root / ".env"):
        if not env_path.exists() or not env_path.is_file():
            continue

        try:
            for raw_line in env_path.read_text(encoding="utf-8").splitlines():
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip()
                if not key:
                    continue
                if (value.startswith('"') and value.endswith('"')) or (
                    value.startswith("'") and value.endswith("'")
                ):
                    value = value[1:-1]
                # Do not overwrite values provided by the environment / service manager.
                import os

                os.environ.setdefault(key, value)
        except OSError:
            continue

