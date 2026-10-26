"""Regression checks for kg/lb unit controls on narrow layouts."""
from pathlib import Path
import re

html = Path("index.html").read_text(encoding="utf-8")

def rule(selector):
    match = re.search(r"(?m)^\s*" + re.escape(selector) + r"\s*\{([^}]*)\}", html)
    assert match, f"Missing CSS rule: {selector}"
    return re.sub(r"\s+", " ", match.group(1)).strip()

for selector in (".setupUnitToggle", ".weightUnitToggle"):
    css = rule(selector)
    assert "flex-wrap:nowrap" in css, f"{selector} must not wrap"
    assert "white-space:nowrap" in css, f"{selector} labels must stay horizontal"
    assert "flex:0 0 auto" in css, f"{selector} must not shrink"

for selector in (".setupUnitToggle button", ".weightUnitToggle button"):
    css = rule(selector)
    assert "flex:0 0 auto" in css, f"{selector} buttons must not shrink"
    assert "white-space:nowrap" in css, f"{selector} button text must not wrap"

target = rule(".weightTargetWrap")
assert "flex-wrap:nowrap" in target and "white-space:nowrap" in target
target_input = rule(".weightTargetWrap input")
assert "flex:0 0 112px" in target_input and "box-sizing:border-box" in target_input

print("PASS: kg/lb controls and target-weight input retain horizontal layout")
