#!/usr/bin/env python3
"""Regression checks for iOS Dynamic Type typography scaling."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
css = (ROOT / "src" / "app" / "styles.css").read_text(encoding="utf-8")
html = (ROOT / "index.html").read_text(encoding="utf-8")

assert "@supports (font: -apple-system-body)" in css
assert "html { font: -apple-system-body; --ft-text-scale:0.9411764706; }" in css
assert "body { font-size:calc(1rem * var(--ft-text-scale)); }" in css
assert "--ft-text-scale:1;" in css
assert "-webkit-text-size-adjust:100%" in css
assert "text-size-adjust:100%" in css

# Dynamic Type must not let fixed-mode labels or bottom navigation escape their controls.
assert "#weightChartStyleSwitcher { grid-template-columns:repeat(2,minmax(0,1fr)); }" in css
assert "#weightChartStyleSwitcher button" in css and "white-space:normal" in css
assert ".tabs { max-width: 720px; min-width: 0;" in css
assert "grid-template-columns: repeat(5, minmax(0, 1fr))" in css
assert ".tab > span:not(.ico)" in css and "overflow-wrap: anywhere" in css
assert "max(78px, 3.6rem * var(--ft-text-scale))" in css

# All authored CSS font sizes and pixel-based font shorthands must scale.
declarations = re.findall(r"(?:font-size|font)\s*:\s*([^;}]+)", css)
assert declarations, "No application typography declarations found"
for declaration in declarations:
    assert not re.search(r"\d+(?:\.\d+)?px\b", declaration), (
        f"Fixed-pixel typography remains: {declaration}"
    )

# At the default iOS 17px body text size, preserve existing pixel baselines.
assert "font-size: calc(1.7647rem * var(--ft-text-scale))" in css, "30px heading baseline was not preserved"
assert "clamp(calc(2rem * var(--ft-text-scale)), 10vw, calc(3.1765rem * var(--ft-text-scale)))" in css, "Timer clamp baseline was not preserved"

style = html.split("<style>", 1)[1].split("</style>", 1)[0]
assert style == css, "Generated index stylesheet is out of sync with source"
assert "font: -apple-system-body" in style
print("PASS: iOS Dynamic Type typography scaling and generated shell checks.")
