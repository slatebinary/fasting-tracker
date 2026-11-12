#!/usr/bin/env python3
"""Regression: selected Weight chart callout subtitle uses readable foreground contrast."""
from pathlib import Path
source=Path(__file__).resolve().parents[1]/'src/app/js/32-weight-chart-interaction.js'
text=source.read_text(encoding='utf-8')
expected="ctx.fillStyle=textColor;ctx.font=periodFontSize+'px -apple-system';ctx.fillText(periodLabel"
if expected not in text:
    raise SystemExit("FAIL: selected Weight chart period/count subtitle is still rendered with muted foreground")
print("PASS: selected Weight chart period/count subtitle uses the primary readable foreground")
