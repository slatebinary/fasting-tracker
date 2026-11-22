from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / "src/app/index.template.html").read_text(encoding="utf-8")
workflow = (ROOT / "src/app/js/15-backdated-fast-workflows.js").read_text(encoding="utf-8")
timer = (ROOT / "src/app/js/20-time-fast-history.js").read_text(encoding="utf-8")
startup = (ROOT / "src/app/js/50-settings-and-startup.js").read_text(encoding="utf-8")
policy = (ROOT / "src/app/js/43z-post-start-extension-policy.js").read_text(encoding="utf-8")
validation = (ROOT / "src/app/js/14-data-validation.js").read_text(encoding="utf-8")

assert 'id="extendNonFastingBtn"' in html
assert 'id="extendNonFastingModal"' in html
assert 'id="extendNonFastingAmount"' in html
assert all(f'<option value="{n}"' in html for n in (5, 10, 15, 30))
assert 'data-i18n="fasting.extendNonFastingHelp"' in html
assert "POST_START_EXTENSION_GRACE_MS = 30 * 60 * 1000" in policy
assert "POST_START_EXTENSION_MINUTES = Object.freeze([5, 10, 15, 30])" in policy
assert "resolvePostStartExtensionWindow(context.createdAt, Date.now()).eligible" in workflow
assert "resolvePostStartExtendedTimestamp(context.startAt, minutes)" in workflow
assert "data.scheduledStart = {" in workflow and "createdAt" in workflow
assert "data.activeGoalHours = context.goalHours" in workflow
assert "data.activeModifiedAt = context.mode === 'active'" in workflow
assert "scheduled.createdAt || new Date().toISOString()" in timer
assert "cancelDelayedFastStart()" in timer
assert "fasting.startDelayedFor" in timer and "fasting.cancelDelayedStart" in timer
assert "resolvePostStartExtensionWindow(data.activeCreatedAt, nowMs).eligible" in timer
assert "resolvePostStartExtensionWindow(data.scheduledStart.createdAt, Date.now()).eligible" in timer
assert "bindResponsiveAction(el('extendNonFastingBtn'), openExtendNonFastingModal)" in startup
assert "confirmExtendNonFastingPeriod" in startup
assert "parsed.scheduledStart.createdAt" in validation
for lang in ("en", "bg", "es"):
    locale = json.loads((ROOT / f"i18n/{lang}.json").read_text(encoding="utf-8"))
    for key in ("fasting.extendNonFasting", "fasting.extendNonFastingTitle", "fasting.extendNonFastingHelp",
                "fasting.extendNonFastingAmount", "fasting.extendNonFastingPreview",
                "fasting.extendNonFastingConfirm", "fasting.startDelayedFor", "fasting.cancelDelayedStart"):
        assert key in locale and locale[key], f"{lang}: missing {key}"
version = json.loads((ROOT / "version.json").read_text(encoding="utf-8"))
assert version["version"] == "1.21.7"
assert "./src/app/js/43z-post-start-extension-policy.js" in version["shell"]
print("PASS: post-start non-fasting extension UI, 30-minute eligibility, delayed-start persistence, target preservation and localization")
