from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / "src/app/index.template.html").read_text(encoding="utf-8")
timer = (ROOT / "src/app/js/20-time-fast-history.js").read_text(encoding="utf-8")
backdate = (ROOT / "src/app/js/15-backdated-fast-workflows.js").read_text(encoding="utf-8")
navigation = (ROOT / "src/app/js/46-screen-navigation-and-rendering.js").read_text(encoding="utf-8")
assert 'id="editActiveFastBtn"' in html and 'id="fastTimingBtn"' in html
assert "el('editActiveFastBtn').addEventListener('click', openEditActiveFastModal)" in navigation
assert "bindResponsiveAction(el('fastTimingBtn'), openFastTimingModal)" in navigation
assert "function openEditActiveFastModal()" in backdate and "function openFastTimingModal()" in backdate
assert "if (data.activeStart || data.scheduledStart || recoveryMode) return;" in backdate
assert "if (data.activeStart) { openEditActiveFastModal(); return; }" not in backdate
active=timer[timer.index("if (data.activeStart) {"):timer.index("} else if (data.scheduledStart)")]
scheduled=timer[timer.index("} else if (data.scheduledStart)"):timer.index("} else {\n      timer.textContent = '00:00:00'")]
idle=timer[timer.index("} else {\n      timer.textContent = '00:00:00'"):timer.index("    updateScienceCard();")]
assert "el('editActiveFastBtn').hidden = false;" in active and "el('fastTimingBtn').hidden = true;" in active
assert "el('editActiveFastBtn').hidden = true;" in scheduled and "el('fastTimingBtn').hidden = true;" in scheduled
assert "el('editActiveFastBtn').hidden = true;" in idle and "el('fastTimingBtn').hidden = false;" in idle
print("PASS: Timing options and Edit fast are distinct, state-exclusive controls")
