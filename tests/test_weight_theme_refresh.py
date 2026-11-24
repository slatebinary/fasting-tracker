#!/usr/bin/env python3
"""Regression: changing appearance invalidates cached canvas chart colours."""
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
source = (root / "src/app/js/46-screen-navigation-and-rendering.js").read_text(encoding="utf-8")

match = re.search(
    r"el\('appearanceSelect'\)\.addEventListener\('change',\s*\(\)\s*=>\s*\{(?P<body>.*?)\n\s*\}\);",
    source,
    re.S,
)
assert match, "appearance selector change handler is missing"
body = match.group("body")

dirty = re.search(r"dirtyViews:\s*\[([^]]*)\]", body)
assert dirty, "appearance changes must explicitly invalidate dependent views"
invalidated = set(re.findall(r"'([^']+)'", dirty.group(1)))
assert {"settings", "stats", "weight"} <= invalidated, (
    "appearance changes must invalidate Settings, Statistics and Weight "
    f"so cached canvas charts are repainted; found {sorted(invalidated)}"
)

assert "applyAppearance();" in body, "appearance change must apply the new CSS theme"
assert "if (el('stats').classList.contains('active')) renderScreen('stats');" in body, (
    "an already-open Statistics view must repaint immediately"
)
assert "if (el('weight').classList.contains('active')) renderScreen('weight');" in body, (
    "an already-open Weight view must repaint immediately"
)

# The renderer reads the current theme tokens on every draw; invalidation above
# ensures it is called when a previously hidden canvas becomes visible again.
chart = (root / "src/app/js/32-weight-chart-interaction.js").read_text(encoding="utf-8")
for token in ("--line", "--accent", "--muted", "--good", "--card", "--text"):
    assert f"getPropertyValue('{token}')" in chart, (
        f"Weight canvas must obtain {token} from the currently active theme"
    )

print("PASS: theme changes invalidate and repaint both chart screens using current theme tokens")
