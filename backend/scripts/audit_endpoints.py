"""Static audit for FastAPI route dependencies.

This script flags domain routes that do not visibly declare authentication,
permission, internal-signature or public markers near the route decorator.
It is intentionally conservative: every finding must be reviewed by an engineer.
"""
from __future__ import annotations

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
DOMAINS = ROOT / "app" / "domains"
ROUTE_RE = re.compile(r"@router\.(get|post|patch|put|delete)\((?P<args>.*?)\)\s*\ndef\s+(?P<name>\w+)\((?P<body>.*?)\):", re.S)
PROTECTED_MARKERS = (
    "require_permission(",
    "require_any_permission(",
    "get_current_user",
    "validate_internal_request",
)
PUBLIC_MARKERS = (
    '"/public',
    "public_",
    "/health",
)
AUTH_FLOW_NAMES = {"login", "refresh", "logout", "session_status"}


def scan_file(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    findings: list[str] = []
    for match in ROUTE_RE.finditer(text):
        route_args = match.group("args")
        signature = match.group("body")
        route_name = match.group("name")
        joined = route_args + signature
        if any(marker in joined for marker in PROTECTED_MARKERS):
            continue
        if any(marker in joined or marker in route_name for marker in PUBLIC_MARKERS):
            continue
        if path.name == "router.py" and path.parent.name == "auth" and route_name in AUTH_FLOW_NAMES:
            continue
        findings.append(f"{path.relative_to(ROOT)}::{route_name} -> review missing auth dependency")
    return findings


def main() -> int:
    findings: list[str] = []
    for path in sorted(DOMAINS.glob("*/router.py")):
        findings.extend(scan_file(path))
    if findings:
        print("Potentially open routes:")
        for item in findings:
            print(f"- {item}")
        return 1
    print("No obviously open domain routes found.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
