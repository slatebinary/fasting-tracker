# Fasting Tracker changelog

## v1.17.4 — 29 October 2026
- Changed touch interaction to direct point scrubbing: dragging left selects older weight measurements, and dragging right selects newer measurements.
- Automatically keeps the selected measurement visible, so browsing long histories no longer requires separate chart scrolling.
- Retains native chart scrolling, tap selection, mouse interaction, keyboard navigation, vertical page scrolling and VoiceOver-compatible controls.
- No fasting, weight, active-fast or backup records are changed by this update.

## v1.17.3 — 29 October 2026
- Reversed horizontal chart panning so dragging left moves the chart left toward older weight records.
- Made finger movement more responsive by panning continuously instead of stepping through a limited number of values.
- The selected weight and date/period update to the measurement nearest the chart centre; vertical page scrolling, tap selection, mouse and keyboard support remain.
- No fasting, weight, active-fast or backup records are changed by this update.

## v1.17.2 — 29 October 2026
- Enabled native horizontal touch scrolling on the weight chart to navigate the complete history naturally.
- Updated the selected weight value while scrolling, using the measurement nearest the chart centre.
- Removed slow, distance-limited touch scrubbing; retained tap-to-select, mouse interaction, and keyboard navigation.
- No fasting, weight, active-fast or backup records are changed by this update.

## v1.17.1 — 29 October 2026
- Corrected finger-drag direction: moving left selects older weight records and moving right selects newer records.
- Prevented chart text from being selected during touch gestures.
- Fixed chart navigation so the complete history is reachable in Daily, Weekly, Monthly and other periods.
- No fasting, weight, active-fast or backup records are changed by this update.

## v1.17.0 — 29 October 2026
- Enabled finger-drag scrubbing across Daily, Weekly, Monthly and other weight-chart periods; the selected weight and date/time update as you move.
- Dragging can continue through older or newer measurements, with the chart keeping the selected point visible.
- Enabled left/right keyboard navigation for every weight-chart period.
- No fasting, weight, active-fast or backup records are changed by this update.

## v1.16.9 — 29 October 2026
- Fixed touch interaction in Daily weight statistics so horizontal swipes scroll through older measurements instead of being treated as chart-point scrubbing.
- Kept tap-to-select and mouse/pen drag browsing, plus left/right keyboard navigation.
- Corrected the v1.16.8 English changelog entry, which was mistakenly displayed in Bulgarian.
- No fasting, weight, active-fast or backup records are changed by this update.

## v1.16.8 — 29 October 2026
- Replaced the Calendar heatmap’s “Less” and “More” labels with numeric fasting-hour ranges on each colour swatch.
- Added drag-to-browse and left/right keyboard navigation for individual measurements in Daily weight statistics; selected points show the weight and its date/time.
- Preserved full weight history, existing aggregate periods, and all fasting, weight, active-fast, and backup records.

## v1.16.7 — 29 October 2026
- Upgraded the Patient Tortoise surprise from a static, nodding icon to a detailed layered illustration with a segmented shell, expressive face, moving legs and tail, body bounce, and a small ground-motion accent.
- Added a short coordinated walk-in animation and arrival bounce while retaining current-colour contrast, keyboard access, dismissal, and reduced-motion support.
- No fasting, weight, active-fast, or backup data changes.

# Fasting Tracker changelog

## v1.16.6 — 29 October 2026
- Restored normal folding for “App icons & installation”: the section opens by default for discoverability but can now be collapsed and reopened by the user.
- Honour saved Settings disclosure preferences; searching for an icon still opens the matching section temporarily.
- No fasting, weight, active-fast, or backup data changes.

## v1.16.3 — 29 October 2026
- Fixed a saved Settings disclosure-state collision that could keep the app-icon section closed after updating, hiding the accessible icon choices.
- Kept the blue selection border removed; the selected icon remains identified by a check mark and a subtle background.
- Added regression checks for the grayscale, high-contrast and colour-vision-friendly icon choices and their image assets.
- No fasting, weight, active-fast, or backup data changes.

## v1.16.2 — 28 October 2026
- Moved app icon selection out of General Settings into its own top-level, initially expanded section so accessible icon themes are easier to find.
- Removed the blue selection border; the selected icon is indicated by a check mark and a subtle background instead.
- No fasting, weight, active-fast, or backup data changes.


## v1.16.1 — 28 October 2026
- Removed the heavy blue outline from the app-icon section and moved it to the top of General Settings.
- Put grayscale, high-contrast, and colour-vision-friendly icon choices first in Settings and onboarding.
- Fixed favicon and iPhone/iPad Home Screen icon selection for the new accessible icon themes by pointing to their available PNG assets.
- No fasting, weight, active-fast, or backup data changes.


## v1.16.0 — 28 October 2026
- Add selectable grayscale, high-contrast, and colour-vision-friendly Home Screen icon themes.
- Make icon choices available in Settings and onboarding, with English, Bulgarian and Spanish labels.
- Add separate localized PWA manifests and integrity-covered PNG assets for all three accessible icon themes.
- Preserve existing icon choices and all fasting, weight, active-fast and backup data.


## v1.15.9 — 28 October 2026
- Improved the Patient Tortoise Easter egg with visible tap progress and a different humorous response for each of the first six taps.
- Added a more expressive reveal animation while respecting reduced-motion preferences; localized all tap messages in English, Bulgarian, and Spanish.
- No analytics, network requests, or stored tap counts. No fasting, weight, active-fast, or backup data changes.
- Made “App icons & installation” more prominent in Settings; searching for “icon” opens the matching subsection.
- No fasting, weight, active-fast, or backup data changes.


## v1.15.8 — 28 October 2026
- Added a hidden Patient Tortoise surprise after seven activations of the installed version label in Settings → Updates.
- The message is dismissible, keyboard-accessible, and respects reduced-motion preferences; no analytics or network requests are added.
- No fasting, weight, active-fast, or backup data changes.

## v1.15.7 — 28 October 2026
- Diagnostic action feedback banners now disappear automatically after 8 seconds, preventing stale messages from remaining on screen.
- A new action replaces the previous message and restarts the dismissal timer; device-check summaries clear as well.
- No fasting, weight, active-fast, or backup data changes.

## v1.15.6 — 28 October 2026
- Added visible, accessible running/success/warning/failure feedback to integrity checks, recovery snapshots, cache repair, local benchmark, device checks, and statistics/chart recalculation.
- Hardened diagnostic actions so errors restore button availability and do not silently disappear.
- No fasting, weight, active-fast, or backup data changes.


## v1.15.5 — 28 October 2026
- Improved Color-Friendly bottom navigation contrast, icon visibility, active-tab indication, and keyboard focus.
- No fasting, weight, active-fast, or backup data changes.

## v1.15.4 — 28 October 2026
- Distinguish cumulative target-fast milestones from consecutive target-fast streak achievements at 5, 25 and 50.
- Clarify cumulative versus consecutive achievement rules in English, Bulgarian and Spanish.
- Preserve the existing treatment of explicitly excused unavoidable interruptions as neutral for the streak.
- No fasting, weight, active-fast, or backup data is changed.


## v1.15.3 — 28 October 2026
- Force readable button text, backgrounds and borders across both high-contrast themes and grayscale, including widget-specific buttons.
- Keep the gamification rules, level thresholds, and purpose visible without requiring the user to expand a hidden section.
- No fasting, weight, active-fast, or backup data changes.

## v1.15.2 — 28 October 2026
- Fixed button-label contrast in both high-contrast themes, including primary and stop actions.
- Strengthened the distinction between grayscale and colour-vision-friendly palettes.
- Explained consistency XP rules, increasing level thresholds and the motivational-only purpose of gamification.
- Strip YAML front matter from published HTML during deployment.
- No fasting/weight records or backup data are changed.

## v1.15.0 — 27 October 2026
- Added grayscale, high-contrast light/dark, and colour-vision-friendly appearance palettes, with English, Bulgarian, and Spanish labels.
- Rebuild and persist derived daily fasting totals when the selected time zone changes, preventing stale prior-zone derived data from causing a false mismatch warning.
- No fasting or weight record schema changes, migrations, or deletions.

## v1.14.2 — 27 October 2026
- Fixed Changelog return navigation to use the same session-based return URL as the other documentation pages.
- Prefer browser history restoration to avoid forcing a fresh app startup when returning from Changelog.
- No fasting or weight record schema changes, migrations, or deletions.

## v1.14.1 — 27 October 2026
- Expanded the in-app and repository changelog with available historical release notes back to v1.8.0.
- Moved the Changelog link beside the installed app version in Settings → Updates.
- Changelog navigation now returns to the prior same-origin app page when possible, allowing the browser to resume the existing app instance instead of forcing a fresh load.
- No fasting or weight record schema or migration changes.


This file records user-visible changes. In the app, open **Settings → Updates → Changelog**.

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

## v1.13.5 — October 2026
- Added visible daylight-saving/time-zone adjustment indicators to daily Timeline, Trend, and Cumulative views.

## v1.13.4 — October 2026
- Fixed kg/lb controls on narrow screens so the unit selector and target-weight input remain aligned.

## v1.13.3 — October 2026
- Added an accessible searchable time-zone picker and fixed the narrow-screen weight-unit layout.

## v1.13.2 — October 2026
- Expanded time-zone support and daylight-saving handling across the app.

## v1.13.1 — October 2026
- Improved the Timeline month axis.

## v1.12.2 — earlier release
- Reliable Statistics rendering: restore the selected visualization and redraw charts after layout changes.

## v1.12.1 — earlier release
- Improved Stop confirmation and prevented accidental touch-through actions.

## v1.12.0 — earlier release
- Added concise device notifications and in-app notification details.

## v1.11.9 — earlier release
- Simplified Settings with progressive disclosure.

## v1.11.7 — earlier release
- Quality update with reliability and usability refinements.

## v1.11.5 — earlier release
- Improved chart interaction and repository quality checks.

## v1.11.4 — earlier release
- Clarified single-user compatibility and local-data behavior.

## v1.11.3 — earlier release
- Fixed refresh after weight entry.

## v1.11.2 — earlier release
- Improved chart readability and visual quality.

## v1.11.1 — earlier release
- Added analytical controls and stabilization fixes.

## v1.11.0 — earlier release
- Improved reliability and fasting visualizations.

## v1.10.1 — earlier release
- Expanded quality, recovery, and history tools.

## v1.10.0 — earlier release
- Improved reliability, recovery, and data transparency.

## v1.9.2 — earlier release
- Improved notification recovery and newest-first chart data.

## v1.9.1 — earlier release
- Improved corrections to completed fasts.

## v1.9.0 — earlier release
- Introduced a more robust long-term architecture.

## v1.8.19 — earlier release
- Fixed weigh-in reminder cadence.

## v1.8.18 — earlier release
- Improved notification onboarding.

## v1.8.17 — earlier release
- Added optional device notifications.

## v1.8.16 — earlier release
- Used neutral wording for the 24-hour cycle.

## v1.8.15 — earlier release
- Added an audit trail for deleted fasts.

## v1.8.13 — earlier release
- Added continuation context to the Timeline.

## v1.8.12 — earlier release
- Improved the Timeline end-of-day label.

## v1.8.11 — earlier release
- Added fasting-target details to Statistics.

## v1.8.10 — earlier release
- Added progress sharing.

## v1.8.9 — earlier release
- Added an optional first-run setup guide.

## v1.8.8 — earlier release
- Added a daily and labelled weight timeline.

## v1.8.7 — earlier release
- Added an aggregated weight timeline.

## v1.8.6 — earlier release
- Added weight statistics.

## v1.8.5 — earlier release
- Refined stop-fast behavior and the weight chart.

## v1.8.0 — earlier release
- Introduced the performance architecture.
