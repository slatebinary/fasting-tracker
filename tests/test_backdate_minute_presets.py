from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / "src/app/index.template.html").read_text(encoding="utf-8")
workflow = (ROOT / ".github/workflows/v1123-regression.yml").read_text(encoding="utf-8")
backdate = (ROOT / "src/app/js/15-backdated-fast-workflows.js").read_text(encoding="utf-8")
startup = (ROOT / "src/app/js/50-settings-and-startup.js").read_text(encoding="utf-8")
expected = [1, 2, 5, 10, 15, 30, 45]

minute_section = html.split('data-i18n="backdate.minutesAgo"', 1)[1].split("</div>", 2)[1]
for minutes in expected:
    assert f'data-minutes="{minutes}"' in minute_section, f"missing {minutes}-minute preset"
    for lang in ("en", "bg", "es"):
        import json
        locale = json.loads((ROOT / f"i18n/{lang}.json").read_text(encoding="utf-8"))
        assert locale.get(f"backdate.{minutes}m"), f"{lang} is missing the {minutes}-minute label"
assert "function setBackdatePreset(value, unit = 'hours')" in backdate
assert "unit === 'minutes' ? 60000 : 3600000" in backdate
assert "minutes !== undefined ? minutes : btn.dataset.hours" in startup
assert "minutes !== undefined ? 'minutes' : 'hours'" in startup
assert "python3 tests/test_backdate_minute_presets.py" in workflow
print("PASS: seven localized backdated-fast minute presets use minute-accurate offsets and preserve hour presets")
