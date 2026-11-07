#!/usr/bin/env python3
"""Ensure the selected palette hint is initialized after saved appearance is applied."""
from pathlib import Path
import json
import re

ROOT=Path(__file__).resolve().parents[1]
bootstrap=(ROOT/'src/app/js/00-bootstrap-and-preferences.js').read_text(encoding='utf-8')
template=(ROOT/'src/app/index.template.html').read_text(encoding='utf-8')
apply=re.search(r'function applyAppearance\(\)\s*\{(.*?)\n  \}',bootstrap,re.S)
language=re.search(r'function applyLanguage\(\)\s*\{(.*?)\n  \}',bootstrap,re.S)
assert apply and 'updateAppearancePaletteHint();' in apply.group(1), 'saved appearance must refresh its palette hint after select.value is restored'
assert language and 'updateAppearancePaletteHint();' in language.group(1), 'changing interface language must refresh the visible palette hint'
assert 'id="appearancePaletteHint"' in template and 'aria-live="polite"' in template, 'palette hint must be present and announced accessibly'
for lang in ('en','bg','es'):
    messages=json.loads((ROOT/f'i18n/{lang}.json').read_text(encoding='utf-8'))
    for palette in ('colorblind','protanopia','deuteranopia','tritanopia'):
        key=f'settings.paletteHint.{palette}'
        assert messages.get(key), f'{lang} is missing {key}'
print('PASS: palette hints initialize for saved appearance and remain localized.')
