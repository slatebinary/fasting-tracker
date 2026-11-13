#!/usr/bin/env python3
"""Regression: selected Weight chart callout subtitle uses maximum contrast and stronger weight."""
from pathlib import Path
source=Path(__file__).resolve().parents[1]/'src/app/js/32-weight-chart-interaction.js'
text=source.read_text(encoding='utf-8')
expected="ctx.fillStyle='#fff';ctx.font='600 '+periodFontSize+'px -apple-system';ctx.fillText(periodLabel"
if expected not in text:
    raise SystemExit("FAIL: selected Weight chart period/count subtitle is still rendered with muted foreground")
print("PASS: selected Weight chart period/count subtitle uses white maximum-contrast bold foreground")
