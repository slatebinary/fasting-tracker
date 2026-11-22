#!/usr/bin/env python3
"""Regression: selected Weight chart and period-detail subtitles remain high contrast."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
js = (root/'src/app/js/32-weight-chart-interaction.js').read_text(encoding='utf-8')
css = (root/'src/app/styles.css').read_text(encoding='utf-8')

# The canvas callout is painted on --card, so its two text lines must both use --text.
canvas_expected = "ctx.fillStyle=textColor;ctx.font='600 '+periodFontSize+'px -apple-system';ctx.fillText(periodLabel"
if canvas_expected not in js:
    raise SystemExit("FAIL: selected Weight chart period subtitle must use the theme's foreground text colour")
if "const good=style.getPropertyValue('--good').trim(), card=style.getPropertyValue('--card').trim(), textColor=style.getPropertyValue('--text').trim();" not in js:
    raise SystemExit("FAIL: selected Weight chart callout must use the active theme's card and text tokens")

def rgb(value):
    value = value.lstrip('#')
    if len(value) == 3:
        value = ''.join(ch * 2 for ch in value)
    return tuple(int(value[i:i+2], 16) / 255 for i in (0, 2, 4))

def luminance(value):
    channels = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb(value)]
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]

def contrast(foreground, background):
    high, low = sorted((luminance(foreground), luminance(background)), reverse=True)
    return (high + 0.05) / (low + 0.05)

# Check the actual foreground/card pairs for every explicitly defined appearance.
themes = []
for chunk in css.split('html[data-theme="')[1:]:
    theme = chunk.split('"', 1)[0]
    declarations = chunk.split("{", 1)[1].split("}", 1)[0]
    tokens = {}
    for declaration in declarations.split(";"):
        if ":" not in declaration:
            continue
        name, value = declaration.split(":", 1)
        name = name.strip()
        if name in ("--text", "--card"):
            tokens[name[2:]] = value.strip()
    assert set(tokens) == {"text", "card"}, f"{theme}: missing text/card token: {tokens}"
    ratio = contrast(tokens["text"], tokens["card"])
    assert ratio >= 4.5, f"{theme}: canvas callout text/card contrast is {ratio:.2f}:1"
    themes.append(theme)
assert len(themes) >= 8, f"Expected all standard and accessibility palettes, found {len(themes)}"

detail_expected = ".weightPointDetailGroup.primary .weightPointDetailMeta { display:inline-block; width:fit-content; max-width:100%; margin-top:3px; padding:4px 8px; border:1px solid rgba(255,255,255,.65); border-radius:7px; background:rgba(0,0,0,.32); color:#fff; font-size:calc(0.7647rem * var(--ft-text-scale)); font-weight:750; line-height:1.4; }"
if detail_expected not in css:
    raise SystemExit("FAIL: selected Weight period/count subtitle lacks its distinct bordered dark label, white text, and bold weight")

primary_padding_expected = ".weightPointDetailGroup.primary { padding:8px 10px; border:1px solid var(--line); border-radius:9px; background:var(--card); }"
if primary_padding_expected not in css:
    raise SystemExit("FAIL: primary Weight rolling/calendar callout lacks internal padding and a defined inset surface")

upper_heading_expected = ".weightPointDetailHeading strong { font-size:calc(0.7647rem * var(--ft-text-scale)); font-weight:650; }"
if upper_heading_expected not in css:
    raise SystemExit("FAIL: upper Weight summary heading typography changed unexpectedly")

print("PASS: canvas callout text meets 4.5:1 against every theme card; period/count detail retains its distinct dark badge")
