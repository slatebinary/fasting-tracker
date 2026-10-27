# Fasting Tracker changelog

This file records user-visible changes. The in-app version is available from **Settings → About & help → Changelog**.

## v1.14.0 — 27 October 2026
- Added a read-only, in-app changelog in English, Bulgarian, and Spanish.
- Added a repository changelog for release history.
- No fasting or weight data schema changes are intended by this feature.

## v1.13.11 — 27 October 2026
- Rebuilt stale daily fasting-total caches using an explicit cache algorithm version.
- Replaced incremental cache updates with a full rebuild from authoritative fasting records when records change.

## v1.13.10 — 27 October 2026
- Preserved all affected dates in copied daily-total integrity reports.

## v1.13.9 — 27 October 2026
- Added a Copy report action and more precise cached-versus-record mismatch details.

## v1.13.8 — 27 October 2026
- Added affected-date details to daily-total integrity diagnostics and diagnostic exports.

## v1.13.7 — 27 October 2026
- Record sanitized update-stage errors in diagnostics to distinguish release download, integrity, and staging failures.

## v1.13.6 — October 2026
- Duration formatting preserves minutes for durations of one day or longer.
- Daily Timeline, Trend, and Cumulative chart views show localized daylight-saving/time-zone change notes.
