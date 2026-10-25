#!/usr/bin/env python3
"""Regression checks for month orientation on the all-history fasting timeline."""
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
html = (root / "index.html").read_text(encoding="utf-8")
version = json.loads((root / "version.json").read_text(encoding="utf-8"))

assert '"timelineMonthGroups = []"' in html or "timelineMonthGroups = []" in html
assert "timelineMonthGroups.slice(1).forEach(group =>" in html, "month-boundary separators must be drawn"
assert "ctx.lineTo(x, cssH - 27)" in html, "month separators must extend into the axis region"
assert "date.toLocaleDateString(currentLocale(), options)" in html, "month labels must follow the selected locale"
assert "ctx.fillText(label, centerX, cssH - 24)" in html, "month labels must occupy a dedicated axis row"
assert "if (fitsMonth && fitsGap" in html, "labels must avoid collisions when long histories are compressed"
assert tuple(int(part) for part in version["version"].split(".")) >= (1, 13, 2), "release must retain the timeline month-axis fix"
assert "const APP_VERSION = '" + version["version"] + "';" in html, "application version must match the release"
print("PASS: fasting timeline includes localized month labels and month-boundary separators")
