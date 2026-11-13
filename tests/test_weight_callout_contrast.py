#!/usr/bin/env python3
"""Regression: selected Weight chart and period-detail subtitles remain high contrast."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
js = (root/'src/app/js/32-weight-chart-interaction.js').read_text(encoding='utf-8')
css = (root/'src/app/styles.css').read_text(encoding='utf-8')

canvas_expected = "ctx.fillStyle='#fff';ctx.font='600 '+periodFontSize+'px -apple-system';ctx.fillText(periodLabel"
if canvas_expected not in js:
    raise SystemExit("FAIL: selected Weight chart canvas subtitle is not white and semibold")

detail_expected = ".weightPointDetailGroup.primary .weightPointDetailMeta { color:#fff; font-size:calc(0.7059rem * var(--ft-text-scale)); font-weight:700; line-height:1.4; }"
if detail_expected not in css:
    raise SystemExit("FAIL: selected Weight period/count detail subtitle is not white, bold, and smaller on its blue surface")

upper_heading_expected = ".weightPointDetailHeading strong { font-size:calc(0.7647rem * var(--ft-text-scale)); font-weight:650; }"
if upper_heading_expected not in css:
    raise SystemExit("FAIL: upper Weight summary heading typography changed unexpectedly")

if "0.7059rem" not in detail_expected or "0.7647rem" not in upper_heading_expected:
    raise SystemExit("FAIL: period/count subtitle must remain smaller than the upper heading")

print("PASS: canvas subtitle remains white; period/count detail is white, bold, and smaller than the upper heading")
