# Internationalization guide

Fasting Tracker treats the English dictionary in `index.html` as the canonical source wording.

## Source wording

- `I18N_SOURCE_REVISION` identifies the current canonical English wording set.
- Increment that revision whenever an existing English translation string changes meaning or a key is renamed.
- Add new user-facing text through a translation key rather than embedding it directly in JavaScript.
- Every supported language must contain exactly the same keys as English. The release test enforces this.

## Adding a language

1. Add its metadata to `LANGUAGE_META` (`locale`, `dir`, autonym `label`, manifest suffix and short app title).
2. Add a complete dictionary under `I18N`.
3. Add the localized PWA manifest variants for all selectable icons.
4. Add the public landing page and `hreflang`/sitemap entries.
5. Add localized About/Privacy content.
6. Run `python3 tests/test_release.py`.
7. Test a narrow phone width and, for RTL languages, the entire app with `dir=rtl`.

## Locale and region

Language, country, time zone and weight unit are independent. If the browser locale has the same base language as the selected UI language, its regional number/date conventions are retained. Otherwise the app uses the language-only locale. The app never changes time zone or weight unit merely because the interface language changes.

## Plurals

Use `pluralKey(base, n)`, which is backed by `Intl.PluralRules`. The canonical source includes the CLDR categories `zero`, `one`, `two`, `few`, `many` and `other` for every pluralized concept. Current languages may intentionally reuse the `.other` wording for categories they do not use; future languages can translate those categories distinctly. `.other` remains the runtime fallback. Do not build plurals by appending a letter to a translated word.

## Backups

Backup JSON is language-neutral. Field names, enum values, numbers and ISO timestamps are stable machine values and must never be translated. The `language` field is only a UI preference. An unsupported future language preference falls back to System instead of invalidating otherwise valid history.

## Layout

Controls must be able to accommodate longer translations without splitting words. Prefer CSS logical properties (`margin-inline-*`, `padding-inline-*`, `text-align:start/end`) so future RTL languages do not require a second layout.
