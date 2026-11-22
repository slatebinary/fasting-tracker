#!/usr/bin/env python3
"""Regression: release validation must not race the repository's Pages deployment workflow."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
workflow = (ROOT / ".github" / "workflows" / "pages.yml").read_text(encoding="utf-8")
assert 'workflow_run:' in workflow and '"Fasting Tracker regression checks"' in workflow
assert 'github.event.workflow_run.conclusion == \'success\'' in workflow
assert 'actions/upload-artifact@v4' in workflow
assert 'fasting-tracker-pages-validation-${{ github.run_attempt }}' in workflow
assert 'actions/upload-pages-artifact' not in workflow, "Validation workflow must not create a competing Pages deployment"
assert 'actions/deploy-pages' not in workflow, "GitHub's configured Pages workflow is the sole deployment owner"
assert 'pages: write' not in workflow and 'id-token: write' not in workflow
print("PASS: release validation is gated by regression checks and cannot race or duplicate GitHub Pages deployment")
