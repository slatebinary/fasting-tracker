#!/usr/bin/env python3
"""Release staging, rollback, startup confirmation and CI permission regression guards."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
sw = (ROOT / "sw.js").read_text(encoding="utf-8")
health = (ROOT / "js/release-health.js").read_text(encoding="utf-8")
workflow = (ROOT / ".github/workflows/v1123-regression.yml").read_text(encoding="utf-8")
pages = (ROOT / ".github/workflows/pages.yml").read_text(encoding="utf-8")

def require(condition, message):
    if not condition:
        raise AssertionError(message)

require("PREVIOUS_KEY" in sw, "previous-release metadata key is missing")
require("staging-" in sw and "async function stageRelease(info)" in sw, "isolated staging cache is missing")
require("releaseCacheComplete(info, cacheName)" in sw, "staged cache completeness verification is missing")
require("staged cache integrity check failed" in sw, "cached assets are not re-hashed after staging")
require("async function setActiveRelease(info, cacheName)" in sw, "active pointer switch is not separated from staging")
require("async function confirmActiveRelease(version)" in sw, "explicit release confirmation is missing")
require("async function checkPendingReleaseOnNavigation()" in sw, "unconfirmed release rollback check is missing")
require("ROLLBACK_GRACE_MS = 300000" in sw, "rollback grace period is missing")
activate = sw[sw.index("async function activateRelease(info)"):sw.index("async function ensureInitialRelease()")]
require("stageRelease(info)" in activate and "setActiveRelease(info, stagedCacheName)" in activate,
        "activation must stage first and switch the pointer second")
require("cleanupOldReleases" not in activate, "old release is deleted before startup confirmation")
require("CONFIRM_RELEASE" in sw and "confirmActiveRelease(String(event.data.version || ''))" in sw,
        "service worker confirmation message handler is missing")
require("lastKnownGood" in health and "startup-integrity" in health and "CONFIRM_RELEASE" in health,
        "page must confirm only after startup integrity succeeds")
require("permissions:\n  contents: read" in workflow, "regression workflow must have read-only contents permission")
require("sync-generated-assets:" in workflow and "permissions:\n      contents: write" in workflow,
        "generated asset sync must use a separate write-scoped job")
require("Align earlier browser-test version assertions" not in workflow,
        "CI must not rewrite regression test source")
require("git diff --exit-code -- tests" in workflow, "CI must assert regression test sources remain unchanged")
require(not re.search(r"git add[^\n]*tests/", workflow), "generated asset sync must not stage test files")
require("git push origin main" in workflow, "generated asset sync must publish only from its isolated job")
require("contents: read" in pages and "pages: write" in pages and "id-token: write" in pages,
        "Pages deployment must retain its own scoped permissions")
print("PASS: staged release integrity, rollback retention, startup confirmation and CI permission isolation")
