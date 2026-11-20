from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / "src/app/index.template.html").read_text(encoding="utf-8")
timer = (ROOT / "src/app/js/20-time-fast-history.js").read_text(encoding="utf-8")
cycle_policy = (ROOT / "src/app/js/43n-next-fast-cycle-policy.js").read_text(encoding="utf-8")
backdate = (ROOT / "src/app/js/15-backdated-fast-workflows.js").read_text(encoding="utf-8")
validation = (ROOT / "src/app/js/14-data-validation.js").read_text(encoding="utf-8")
navigation = (ROOT / "src/app/js/46-screen-navigation-and-rendering.js").read_text(encoding="utf-8")
startup = (ROOT / "src/app/js/50-settings-and-startup.js").read_text(encoding="utf-8")

assert 'id="fastTimingModal"' in html
assert 'id="fastTimingMode"' in html and 'id="fastTimingAmount"' in html and 'id="fastTimingUnit"' in html
assert "function openFastTimingModal()" in backdate
assert "if (data.activeStart) { openEditActiveFastModal(); return; }" not in backdate
assert "if (data.activeStart || data.scheduledStart || recoveryMode) return;" in backdate
assert "function confirmFastTiming()" in backdate
assert "data.scheduledStart = {at:at.toISOString()" in backdate
assert "data.scheduledStart && Date.now() >= new Date(data.scheduledStart.at).getTime()" in timer
assert "data.scheduledStart = null;" in timer
assert "t('fasting.cancelScheduled')" in timer
assert "scheduledStart:" in validation and "parsed.scheduledStart.at" in validation
assert "bindResponsiveAction(el('fastTimingBtn'), openFastTimingModal)" in navigation
assert "fastTimingConfirm').addEventListener('click', confirmFastTiming)" in startup
assert "fastTimingMode').addEventListener('change', updateFastTimingHint)" in startup
assert "data.scheduledStart.goalHours" in timer or "scheduled.goalHours" in timer
assert "data.scheduledStart.timeZone" in timer or "scheduled.timeZone" in timer
# Active-fast correction and automatic derived cycle remainder.
assert 'id="editActiveFastBtn"' in html and 'id="editActiveFastModal"' in html
assert 'id="editActiveFastStart"' in html and 'id="editActiveFastGoal"' in html
assert "function openEditActiveFastModal()" in backdate
assert "function saveEditedActiveFast()" in backdate
assert "backdateConflicts(start,new Date())" in backdate
assert "data.activeStart=start.toISOString()" in backdate
assert "data.activeGoalHours=nextGoal" in backdate
assert "el('editActiveFastBtn').hidden = false;" in timer
assert "el('editActiveFastBtn').hidden = true;" in timer
assert "editActiveFastSave').addEventListener('click',saveEditedActiveFast)" in navigation
assert "return resolveNextFastCycleInfo({" in timer
assert "function resolveNextFastCycleInfo" in cycle_policy
assert "const suggestedStartMs = startMs + dayMs;" in cycle_policy
assert "nonFastingMs:dayMs-durationMs" in cycle_policy
assert "const remainingMs = suggestedStartMs - nowMs;" in cycle_policy
assert "return {record,durationMs,nonFastingMs:dayMs-durationMs,suggestedStartMs,remainingMs};" in cycle_policy
for lang in ("en","bg","es"):
    locale = (ROOT / f"i18n/{lang}.json").read_text(encoding="utf-8")
    assert '"fasting.editFast"' in locale and '"fasting.editFastConfirm"' in locale
print("PASS: scheduled start and active-fast edit/remainder recalculation UI, validation and localization")
