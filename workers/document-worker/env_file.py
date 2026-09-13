"""Minimal `.env` file parser -- avoids adding python-dotenv as a dependency
for what run_local.py needs (KEY=VALUE lines, `#` comments, blank lines).
Dev-only tooling, not used by the production/CI worker code."""

from __future__ import annotations

from pathlib import Path


def parse_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    result: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, _, value = stripped.partition("=")
        result[key.strip()] = value.strip()
    return result
