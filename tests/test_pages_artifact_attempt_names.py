#!/usr/bin/env python3
"""Regression: Pages artifact names are unique per workflow attempt."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
workflow = (ROOT / ".github" / "workflows" / "pages.yml").read_text(encoding="utf-8")
artifact_name = "github-pages-${{ github.run_attempt }}"
assert f"name: {artifact_name}" in workflow, "Pages upload artifact must include the workflow attempt"
assert f"artifact_name: {artifact_name}" in workflow, "Pages deploy must select the matching attempt-specific artifact"
print("PASS: Pages artifact upload/deploy names are unique per workflow attempt")
