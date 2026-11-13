#!/usr/bin/env python3
"""Regression: selected Weight chart and period-detail subtitles remain high contrast."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
js = (root/'src/app/js/32-weight-chart-interaction.js').read_text(encoding='utf-8')
css = (root/'src/app/styles.css').read_text(encoding='utf-8')

canvas_expected = "ctx.fillStyle='#fff';ctx.font='600 '+periodFontSize+'px -apple-system';ctx.fillText(periodLabel"
if canvas_expected not in js:
    raise SystemExit("FAIL: selected Weight chart canvas subtitle is not white and semibold")

detail_expected = ".weightPointDetailGroup.primary .weightPointDetailMeta { display:inline-block; width:fit-content; max-width:100%; margin-top:3px; padding:4px 8px; border:1px solid rgba(255,255,255,.65); border-radius:7px; background:rgba(0,0,0,.32); color:#fff; font-size:calc(0.7647rem * var(--ft-text-scale)); font-weight:750; line-height:1.4; }"
if detail_expected not in css:
    raise SystemExit("FAIL: selected Weight period/count subtitle lacks its distinct bordered dark label, white text, and bold weight")

primary_padding_expected = ".weightPointDetailGroup.primary { padding:8px 10px; border:1px solid var(--line); border-radius:9px; background:var(--card); }"
if primary_padding_expected not in css:
    raise SystemExit("FAIL: primary Weight rolling/calendar callout lacks internal padding and a defined inset surface")

upper_heading_expected = ".weightPointDetailHeading strong { font-size:calc(0.7647rem * var(--ft-text-scale)); font-weight:650; }"
if upper_heading_expected not in css:
    raise SystemExit("FAIL: upper Weight summary heading typography changed unexpectedly")

if "background:rgba(0,0,0,.32)" not in detail_expected or "border:1px solid rgba(255,255,255,.65)" not in detail_expected:
    raise SystemExit("FAIL: period/count subtitle must be visually separated from the blue summary surface")

print("PASS: chart subtitle remains white; primary callout has padding; period/count detail has a distinct dark badge with white bold text")
