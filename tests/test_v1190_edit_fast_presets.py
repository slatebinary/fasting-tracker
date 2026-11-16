from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / "src/app/index.template.html").read_text(encoding="utf-8")
workflow = (ROOT / "src/app/js/15-backdated-fast-workflows.js").read_text(encoding="utf-8")
bindings = (ROOT / "src/app/js/50-settings-and-startup.js").read_text(encoding="utf-8")
timer = (ROOT / "src/app/js/20-time-fast-history.js").read_text(encoding="utf-8")
locales = [(ROOT / f"i18n/{lang}.js").read_text(encoding="utf-8") for lang in ("en", "bg", "es")]

assert 'id="editActiveFastBtn"' in html
assert 'id="editActiveTargetBtn"' not in html and 'id="activeTargetModal"' not in html
assert 'id="editActiveFastStart"' in html and 'id="editActiveFastGoal"' in html
assert 'data-edit-start-hours="0.5"' in html and 'data-edit-start-hours="12"' in html
assert all(f'data-edit-goal="{n}"' in html for n in (12,16,20,24,36,48,72,120))
assert "function setEditFastStartAgo(hours)" in workflow
assert "toLocalInputValue(start, data.activeTimeZone || currentTimeZone())" in workflow
assert "function commitEditedActiveFast(start, goal)" in workflow
assert "backdateConflicts(start,new Date()).length" in workflow
assert "pendingLongFastScope='editFast'" in workflow
assert "commitEditedActiveFast(new Date(pendingEditFastStart),next)" in bindings
assert "data-edit-start-hours" in bindings and "data-edit-goal" in bindings
assert "editActiveTargetBtn" not in timer and "activeGoalCycleHelp" not in timer
assert all("fasting.editFastStartQuick" in locale and "fasting.editFastGoalQuick" in locale for locale in locales)
print("PASS: Edit fast owns target/start changes, quick presets, safety and overlap validation")
