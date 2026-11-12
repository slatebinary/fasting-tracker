## v1.17.84 — 2026-11-11

- Clarify Rolling weight-chart data rows by showing the trailing-window average and exact measurement count without empty calendar comparisons.
- Show the calendar-period average only when that calendar period contains measurements.
- Remove empty-calendar messages from selected Rolling point details and clarify daily rolling chart guidance in English, Bulgarian and Spanish.

## v1.17.83 — 2026-11-11

- Sample Rolling weight charts once per calendar day between the first and latest measurement, filling gaps between weigh-ins.
- Calculate each daily average only from real measurements inside its trailing window; omit days with no measurements in-window.
- Preserve Daily and Fixed chart semantics.

## v1.17.82 — 2026-11-11

- Separate Rolling and Fixed weight-chart point details so each mode describes the calculation actually shown.
- Present the average as a clear heading and value, followed by the ending date/period and exact measurement count.
- In Rolling mode, show the trailing-window average and the matching calendar-period average as distinct summaries; in Fixed mode, show only the calendar-period average.
- Remove the misleading “0-day rolling average” and empty calendar-summary output from Fixed mode; clarify chart guidance in English, Bulgarian and Spanish.
- Extend browser regression coverage for both Rolling and Fixed point details.

## v1.17.81 — 2026-11-11

- Unify Fasting and Weight history navigation: show the seven newest entries by default and provide matching 1-month, 6-month, 1-year and all-history ranges.
- Add a live “Last N fasts” / “Last N measurements” count that reflects the exact number of entries currently displayed.
- Keep the compact More / Last 7 controls, existing filters and visible-record bulk selection aligned across both histories.
- Add English, Bulgarian and Spanish translations and browser regression coverage for both lists.

## v1.17.80 — 2026-11-11

- Add clearly visible Rolling / Fixed periods controls to the Weight trend card. Rolling uses trailing averages; Fixed uses calendar-aligned weekly, monthly, quarterly, half-year and yearly buckets.
- Persist the selected chart mode across app launches.
- Change the default weigh-in reminder snooze from 1 day to 1 hour; the fasting reminder default remains 1 hour.
- Add English, Bulgarian and Spanish labels and regression coverage for mode selection and the reminder default.
- Limit the Weight history list to the seven newest measurements by default; add a compact Older/More control with 1-month, 6-month, 1-year and all-history ranges, preserving existing filters and bulk-selection behaviour.

## v1.17.79 — 2026-11-11

- Make the Weight period date range, measurement count and summary metrics follow the selected chart date, including older/newer navigation and chart scrolling, rather than remaining anchored to the current date.
- Keep each chart mode's summary window aligned with its plotted rolling window: 30, 7, 30, 90, 180 or 365 calendar days.
- Add reminder snoozing for weigh-in and fasting target/safety/cycle notices, with selectable delays from 15 minutes to 7 days and a scheduled return to the in-app notification stack.
- Add independent Settings defaults for weight and fasting reminders. Defaults: 1 day for weigh-in reminders and 1 hour for fasting reminders.
- Restore due snoozed reminders while the app is active or when it is reopened; send a device notification too when notification permission is available.
- Add English, Bulgarian and Spanish strings and regression coverage for selected-date summaries and reminder snooze persistence/reappearance.

## v1.17.78 — 2026-11-11

- Prevent duplicate weigh-in notifications when startup, foreground-resume and periodic maintenance checks overlap.
- Coordinate weigh-in delivery across same-origin app contexts with the Web Locks API where available; reserve the reminder token before asynchronous delivery and use an expiring persisted reservation as a fallback.
- Release the reservation after failed delivery so the reminder can be retried; retain the existing stable notification tag and successful-delivery token.
- Extend browser regression coverage to fire repeated foreground checks and verify that only one device reminder is emitted.

## v1.17.77 — 2026-11-11

- Keep the green current external JSON backup indicator visible instead of hiding it after the seven-second confirmation period.
- Show the explicit no-changes-since-last-external-JSON-backup message alongside the backup timestamp.
- Render the visible indicator and Settings backup timestamps in the device timezone, even when the app uses a separately selected timezone.
- Keep the indicator hidden when there is no fasting or weight data; retain stale, never-backed-up and aged states.
- Extend browser regression coverage for persistent visibility, status wording and UTC-versus-Europe/Sofia device-time rendering.

## v1.17.76 — 2026-11-11

- Moved the Daily/Week/Month/Quarter/6 months/Year selector into the Weight trend card, directly above the chart it controls; period summary metrics continue to follow the same selection.
- Replaced the horizontally scrolling selector with a responsive grid: six options across on wider screens and three columns across two rows on narrow screens, keeping every period visible without horizontal scrolling.
- Clarified the accessibility label in English, Bulgarian and Spanish and added a browser regression for selector placement, responsive layout, visibility and selection state.

## v1.17.75 — 2026-11-11

- Increased the visual separation between the general colour-vision palette and the Protanopia palette: cool-blue surfaces/navy accents versus warm-golden surfaces/violet accents, with distinct status colours and maintained WCAG text contrast.
- Clarified the palette-purpose hints in English, Bulgarian and Spanish.
- Added a browser regression that switches palettes live in Settings and verifies the applied theme, surface/accent/status tokens and localized hint.

## v1.17.74 — 2026-11-11

- Replaced sparse weekly-through-yearly calendar-bucket chart points with trailing rolling averages over 7, 30, 90, 180 and 365 days, sampled only on dates with actual weight measurements.
- Kept calendar-period averages and measurement counts visible alongside each rolling value in point details and chart data; explicitly label the rolling window and never estimate missing-day measurements.
- Preserved raw daily measurements, target-weight reference, selectable points, horizontal history navigation and Older/Newer endpoint behaviour; added regression coverage for rolling-window calculations and calendar summaries.

## v1.17.73 — 2026-11-11

- Restored the selected Timeline chart detail whenever Statistics is revisited after another screen, without forcing a full chart redraw.
- Added a browser regression that selects a real Timeline segment and verifies its selection and exact detail survive Statistics → Weight → Statistics.

## v1.17.72 — 2026-11-10

- Fixed Timing chart click-fallback deduplication by tracking recent pointer activation per canvas, preventing one chart's pointer event from suppressing a click on another chart and allowing the first click after load.
- Added browser-level regression coverage for Duration Bars pointer selection and Start-time Bars click-only fallback, including detail-panel updates.

## v1.17.71 — 2026-11-10

- Extracted screen activation, render scheduling, preference refresh, document return navigation, keyboard navigation, and goal-change orchestration into a dedicated ordered JavaScript fragment.
- Preserved the existing shared application scope and event wiring; added source-ownership regression assertions.

## v1.17.70 — 2026-11-10

- Extracted import date-range calculation, stable record comparison, ID/fingerprint duplicate detection, and conflict-safe import merge validation into a dedicated ordered JavaScript fragment.
- Preserved import preview and replace/merge behavior; added source-ownership regression assertions.

## v1.17.69 — 2026-11-10

- Extracted storage-protection status formatting, capability querying, persistence refresh, emergency-boot repair, and final service-worker registration/update orchestration into a dedicated ordered JavaScript fragment.
- Preserved the original startup execution order and shared lexical scope; added source-ownership regression assertions.

## v1.17.68 — 2026-11-10

- Extracted app-update availability checks, version comparison, update-status persistence, service-worker refresh, and installation workflows into a dedicated ordered JavaScript fragment.
- Kept backup and recovery responsibilities in their existing module; expanded source-ownership tests to prevent update workflow functions from drifting back into it.

## v1.17.67 — 2026-11-10

- Restored reliable click selection for Timing duration and start-time bars with a deduplicated completed-click fallback alongside pointer selection.
- Added regression assertions for generic chart selection and the event bindings used by Duration Bars.

## v1.17.66 — 2026-11-10

- Extracted notification delivery, scheduling, permission handling, maintenance reminders, and notification settings into a dedicated ordered JavaScript fragment.
- Preserved notification deduplication, runtime-state persistence, permission safeguards, localized notification details, and existing settings interactions; expanded source-ownership regression checks.

## v1.17.65 — 2026-11-10

- Extracted duration formatting, timezone-aware calendar keys, interval aggregation, daily fasting totals, and week-boundary helpers into a dedicated ordered JavaScript fragment.
- Preserved DST-aware date boundaries, stored calendar-day totals, active-fast interval aggregation, and existing week grouping; expanded source-ownership regression checks.
- Made GitHub Pages artifact names unique per workflow attempt and added a regression test to prevent duplicate-artifact failures during deployment retries.

## v1.17.64 — 2026-11-10

- Extracted active-fast target editing, preset synchronization, validation, and long-fast notice routing into a dedicated ordered JavaScript fragment.
- Preserved target persistence, long-fast safety confirmation, active-target bounds, and existing timer behavior; expanded source-ownership regression checks.

## v1.17.63 — 2026-11-10

- Extracted backdated-fast creation, overlap detection, conflict resolution, and modal handling into a dedicated ordered JavaScript fragment.
- Preserved the existing validation, overlap safeguards, conflict edit/delete confirmation, rollback-on-save-failure, and fast-start behavior; expanded source-ownership regression checks.

## v1.17.62 — 2026-11-10

- Extracted legacy data normalization, compatibility migration, and imported-data validation into a dedicated ordered JavaScript fragment.
- Preserved existing data-version handling, record/weight validation, duplicate and overlap checks, recovery compatibility, and import safeguards; expanded source-ownership regression checks.

## v1.17.61 — 2026-11-10

- Extracted notification preference normalization, runtime-state persistence, notification-detail history, and detail rendering into a dedicated ordered JavaScript fragment.
- Preserved notification settings, TTL/duplicate filtering, localized detail content, and add-weight/dismiss actions; expanded source-ownership regression checks.

## v1.17.60 — 2026-11-10

- Extracted backup freshness/status, integrity-envelope creation and verification, JSON/CSV export, and share/download workflows into a dedicated ordered JavaScript fragment.
- Kept update/deployment checks, service-worker repair, diagnostics, recovery, and restore workflows in the update/recovery fragment; expanded source-ownership regression checks.

## v1.17.59 — 2026-11-10

- Extracted app-version transition, migration outcome, last-known-good release, and deployment-history metadata helpers into a dedicated ordered JavaScript fragment.
- Preserved migration metadata keys, update success/failure handling, deployment-history limits, and timestamps; expanded source-atomization regression assertions.

## v1.17.58 — 2026-11-10

- Extracted fasting-history filtering, CSV export, bulk actions, deletion audit, restore/purge operations, and history rendering into a dedicated ordered JavaScript fragment.
- Preserved history filtering, reversible deletion, audit records, and rendering behavior; expanded source-atomization assertions.

## v1.17.57 — 2026-11-10

- Extracted recovery snapshot retention, coverage, tiering, and rolling-snapshot lifecycle into a dedicated ordered JavaScript fragment.
- Preserved snapshot retention tiers, atomic IndexedDB persistence, quota handling, and recovery behavior; expanded source-ownership regression checks.

## v1.17.56 — 2026-11-09

- Extracted Settings group expansion persistence, localized search filtering, and disclosure/search event wiring into a dedicated ordered JavaScript fragment.
- Release asset manifest retained in version metadata.
- Preserved default-open groups, user disclosure preferences, search result behavior, and storage-health refresh triggers; expanded source-ownership regression checks.

## v1.17.55 — 2026-11-09

- Extracted the first-run installation/setup guide, install-target detection, setup-state persistence, step rendering, notification choices, backup status and setup completion flow into a dedicated ordered JavaScript fragment.
- Preserved setup progression, standalone-install resumption, backup/notification choices and existing settings interactions; expanded app-shell atomization checks.

## v1.17.54 — 2026-11-08

- Moved cached fasting-statistics summary calculation into the statistics data-model fragment and deferred gamification-detail scheduling/state into the gamification module.
- Kept the main statistics fragment as the view orchestrator; preserved summary caching, render-token cancellation, active-screen checks, and deferred detail rendering.

## v1.17.53 — 2026-11-08

- Extracted fasting-interval normalization, timezone-aware day summaries, and accessible statistics chart data into a dedicated ordered JavaScript fragment.
- Preserved interval boundaries, local-day grouping, DST handling, and screen-reader chart details; expanded app-shell atomization regression.

## v1.17.52 — 2026-11-08

- Moved backup-data eligibility, backup clock-skew normalization, initial backup tracking, and dataset-signature cache state into the dedicated backup/update source fragment.
- Preserved external-backup timestamps, future-clock correction, and the distinction between local change detection and proof of an external backup; expanded atomization regression.

## v1.17.51 — 2026-11-08

- Extracted weight-history management, rendering, accessible chart data, period selection, and unit/target controls into a dedicated ordered JavaScript fragment.
- Preserved soft-delete/restore/permanent-delete safeguards, filters, history rendering, unit conversion, and target validation; expanded app-shell atomization regression.

## v1.17.50 — 2026-11-08

- Extracted manual fasting-record creation and editing, audit validation, and weight-entry modal workflows into a dedicated ordered JavaScript fragment.
- Preserved validation, record identity, audit metadata, timezone-local inputs, responsive modal actions, and save/render scheduling; expanded app-shell atomization regression.

## v1.17.49 — 2026-11-08

- Extracted trend, weekly, monthly, distribution, target-success, start-pattern, and cumulative chart models, drawing routines, and pointer interactions into a dedicated ordered JavaScript fragment.
- Expanded app-shell atomization regression to verify the sixteen-fragment assembly and specialized-chart function ownership.

## v1.17.48 — 2026-11-08

- Extracted interactive fasting-chart day modeling, continuation-segment construction, and primary canvas rendering into a dedicated ordered JavaScript fragment.
- Preserved the existing chart selection, cross-midnight continuation, month boundaries, DST annotations, and scrolling behavior; expanded app-shell atomization regression.

## v1.17.47 — 2026-11-08

- Extracted calendar date modeling, daylight-saving clock-change annotations, calendar rendering, and keyboard navigation into a dedicated ordered JavaScript fragment.
- Restored the v1.17.43–v1.17.46 release-history entries in English, Bulgarian and Spanish, and added a regression check that preserves the five latest releases in every locale.
- Expanded app-shell atomization regression to verify the fourteen-fragment assembly and calendar/DST function ownership.

## v1.17.46 — 2026-11-08

- Extracted statistics visualization preferences, group navigation, mode switching, and render scheduling/orchestration into a dedicated ordered JavaScript fragment.
- Expanded app-shell atomization regression to verify the thirteen-fragment assembly and visualization-control ownership.

## v1.17.45 — 2026-11-08

- Extracted statistics range controls, history navigation, chart selection details, and record drilldown helpers into a dedicated ordered JavaScript fragment.
- Expanded app-shell atomization regression to verify the twelve-fragment assembly and statistics history/drilldown ownership.

## v1.17.44 — 2026-11-08

- Extracted weight-streak calculations, achievement definitions, and gamification summary/detail rendering into a dedicated ordered JavaScript fragment while preserving existing state, localization, and behavior.
- Expanded app-shell atomization regression to verify the eleven-fragment assembly and gamification ownership.

## v1.17.43 — 2026-11-08

- Extracted weight period date bucketing, aggregation, and analytics into a dedicated ordered JavaScript fragment while preserving existing functions and behavior.
- Expanded app-shell atomization regression to verify the ten-fragment assembly and weight analytics ownership.

## v1.17.42 — 2026-11-08

- Extracted generic statistics bar-chart rendering and selection handling into a dedicated ordered JavaScript fragment, preserving existing chart behavior and shared state.
- Expanded app-shell atomization regression to verify the generic-chart fragment.

## v1.17.41 — 2026-11-08

- Extracted weight chart drawing, point hit-testing, viewport navigation, and pointer/scroll interaction into a dedicated ordered JavaScript fragment; preserved the existing shared state and runtime behavior.
- Expanded app-shell atomization regression to verify the new weight-chart fragment.

## v1.17.40 — 2026-11-08

- Extracted Timeline hit-testing, selection details, pointer interaction and scroll-to-latest behavior into a dedicated ordered source fragment without changing the public UI or selection state.
- Expanded app-shell atomization regression checks for the new fragment and its moved interaction functions.

## v1.17.39 — 2026-11-08

- Added `js/fasting-storage-db.js` to the SHA-256-protected release shell so service updates are integrity-checked and precached with the app.
- Corrected release asset coverage for the IndexedDB extraction introduced in v1.17.38.

## v1.17.38 — 2026-11-08

- Extracted IndexedDB connection management, request wrappers, CRUD operations and atomic multi-store clearing into a dedicated storage service.
- Kept persistence policy, migration decisions, record validation, history-loss safeguards and recovery orchestration in the application layer.
- Preserved existing IndexedDB store names, schema version, transaction boundaries and stored data formats.
- Updated the browser regression harness to load the extracted service and enabled CI for this refactoring branch.

## v1.17.37 — 7 November 2026
- Extracted time-zone-aware calendar-day keys, fast UTC day keys, ISO-week start calculation, exact next-day boundaries and interval-to-day allocation into a dedicated time utility service.
- Moved localized date, date-time and time labels behind the same service while preserving the existing application interfaces.
- Added isolated regression coverage for leap-safe ISO week boundaries, UTC keys, Europe/Sofia 23-hour spring and 25-hour autumn days, multi-day allocation and localized labels.
- No IndexedDB schema, fasting/weight record format, backup format or stored user data changes.

## v1.17.36 — 7 November 2026
- Reduced the runtime of the exhaustive weight-chart regression by replacing fixed delays with state-based waits and batching Older/Newer navigation checks within the browser.
- Retained full per-step monotonic-index, selected-detail, oldest/newest endpoint, range-navigator and raw-measurement assertions; no coverage thresholds or assertions were weakened.
- No application runtime, IndexedDB schema, backup format, fasting/weight record format or stored user data changes.

## v1.17.35 — 7 November 2026
- Fixed the palette-purpose hint initialization order: the saved appearance is now applied before the selected palette's localized hint is refreshed. Language changes continue to refresh the hint.
- Extracted deterministic JSON serialization, FNV-1a-64 fallback hashing and SHA-256 checksum handling into a dedicated integrity service used by backup creation, verification and comparison.
- Separated the Statistics summary data model and monthly period aggregation from DOM rendering; added isolated tests for summary calculations, period cutoffs, serialization, Unicode, key ordering and checksum fallback.
- No IndexedDB schema, fasting/weight record format, backup format or stored user data changes.

## v1.17.34 — 7 November 2026
- Moved the browser storage-persistence capability query into the dedicated platform diagnostics module, keeping the Settings interface as a thin caller.
- Added isolated tests for unsupported storage APIs, persistence requests, already-persistent storage, quota estimates and error handling.
- No fasting, weight, backup, IndexedDB schema or stored-data changes.

## v1.17.33 — 7 November 2026
- Atomized the app-shell source into six ordered JavaScript domain fragments and a separate stylesheet, with a reproducible build step that preserves the existing single-script runtime and lexical scope.
- Added CI verification to detect generated app-shell drift before release.
- No fasting, weight, backup, storage-schema or runtime interaction behaviour was changed.

## v1.17.32 — 7 November 2026
- Redesigned all four colour-vision-friendly palettes as distinct systems: Okabe–Ito-inspired blue/green/vermilion, protanopia-focused ivory/violet/cyan/ochre, deuteranopia-focused sea-glass/teal/blue/berry, and tritanopia-focused rose/peach/burgundy/green/rust.
- Added six pairwise CIEDE2000 (Delta E 00) comparisons across all four palettes, alongside WCAG contrast and simulated colour-vision status-separation checks.
- Added a live, localized purpose hint for each of the four palettes in Settings (English, Bulgarian and Spanish), explaining the colour-vision need each palette is intended to support.
- Retained redundant text, icon and shape cues so status is never communicated by colour alone.

## v1.17.31 — 7 November 2026
- Added the last external JSON export date and time directly to the “Backup current” status message, formatted in the device's current timezone.
- Added browser regression coverage for the status message itself and timezone changes.
- Made weekly, monthly, quarterly, half-year and yearly weight charts display every period containing measurements in a single viewport, removing empty time buckets and horizontal scrolling while preserving the actual period averages.

## v1.17.30 — 7 November 2026
- Restored the selected Timeline section's timestamp and duration details when returning to Statistics after visiting another screen; stale selections are cleared if their underlying day is no longer available.
- Disabled accidental text selection on the Weight and Statistics Older/Newer navigation buttons while preserving native button and keyboard operation.
- Added browser regression coverage for Timeline detail restoration and navigation-button text selection.
- Displayed the recorded local date and time of the last external JSON export in the backup status and Settings summary.

## v1.17.29 — 7 November 2026
- Kept keyboard focus inside a modal when every control is disabled or unavailable by moving focus to the dialog container; added a programmatically focusable fallback for initial focus and Tab/Shift+Tab handling.
- Added browser regression coverage for empty-focusable modal states.

## v1.17.28 — 7 November 2026
- Corrected nested modal keyboard handling so Escape and Tab apply to the topmost dialog, not an underlying dialog.
- Added stacked focus restoration when closing nested dialogs, improved focus containment when focus is moved outside a dialog, and included textarea/contenteditable controls in the focus cycle.
- Added regression coverage for nested-dialog Escape/Tab behaviour and focus restoration to the parent and original page control.

## v1.17.27 — 7 November 2026
- Corrected completed Calendar day totals that fall within one second of a full local day, so a full day displays 24h (or the actual 23h/25h on DST transition days) instead of 23h 59m.
- Kept the current day unrounded while a fast is ongoing; the Calendar continues to show elapsed fasting time only. Added browser regression coverage for near-midnight boundaries, consecutive full days, DST days and active current-day totals.

## v1.17.26 — 6 November 2026
- Added arrow-key navigation to the fasting calendar, including left/right day movement, up/down week movement and Home/End row navigation with one keyboard tab stop.
- Added a visible focus indicator, a labelled calendar group and polite screen-reader announcements for month changes and selected-day details.

## v1.17.25 — 6 November 2026
- Redesigned the Protanopia, Deuteranopia and Tritanopia palettes with visibly distinct background, accent and status-colour systems instead of near-identical shade variations.
- Added colour-vision-deficiency simulation checks and retained WCAG contrast requirements; success and danger states continue to use non-colour cues as well.

## v1.17.24 — 6 November 2026
- Extended full-strength keyboard-focus indicators to buttons, inputs, selectors, textareas, links, disclosure headings and keyboard-focusable chart controls across grayscale, high-contrast and colour-vision palettes.
- Added regression checks to ensure every accessibility palette applies the same visible focus treatment to all interactive control types.

## v1.17.23 — 6 November 2026
- Added separate Protanopia, Deuteranopia and Tritanopia appearance palettes, with English, Bulgarian and Spanish labels.
- Kept keyboard focus and bottom-navigation selection distinguishable through outlines, neutral labels and persistent underlines rather than colour alone.
- Added contrast, selection, import-validation and localization regression coverage. Palette choices are visual aids, not a guarantee of suitability for every individual.

## v1.17.22 — 5 November 2026
- Improved grayscale and high-contrast bottom navigation with explicit selected-tab surfaces, underlines and monochrome symbols.
- Improved app-icon selection cards and the collapsible installation heading with stronger borders, text contrast and visible keyboard focus.
- Added WCAG contrast-ratio regression checks for grayscale, high-contrast light/dark and colour-vision-friendly palettes.

## v1.17.21 — 5 November 2026
- Improved Statistics first-paint responsiveness by displaying the summary and controls before expensive chart aggregation and detailed gamification calculations begin.
- Chart rendering remains cancellable and runs after the browser has had an opportunity to paint; the full 70-year history, chart content and accessibility details remain available.

## v1.17.20 — 5 November 2026
- Completed the offline in-app release history by adding the verified v1.17.18 and v1.17.19 notes in English, Bulgarian and Spanish.
- Added a regression check that keeps the newest in-app changelog entry aligned with the release metadata in all three languages.

## v1.17.19 — 5 November 2026
- Reduced Statistics timeline rendering cost by caching ordinary local-day boundaries and reusing consecutive day boundaries; exact-search fallback remains for DST and unusual midnight transitions.
- Added a 2,000-record browser performance regression to the required CI workflow.

## v1.17.18 — 5 November 2026
- Fixed data-integrity verification to read the authoritative IndexedDB record-store snapshot instead of an obsolete storage-loader function.
- Added regression coverage for leap day, midnight crossing, spring/autumn DST, travel time zones and 72-hour fasting through backup import and integrity verification.

## v1.17.17 — 4 November 2026
- Stage each replacement release in an isolated cache and verify every shell asset with SHA-256 before changing the active release pointer.
- Retain the previous complete release until the new app completes startup and passes its startup integrity check; automatically restore the previous release on a later navigation if the new release never confirms.
- Make regression CI read-only, move generated-asset synchronization into a separate narrowly write-scoped job, and keep test sources immutable.
- Expand mandatory data-safety regression coverage. No IndexedDB schema, backup format, fasting records, weight records, or user data are changed.

## v1.17.16 — 4 November 2026
- Read settings, fasting records, deleted records, weight records and revisioned daily totals from one IndexedDB readonly transaction, preventing mixed-revision snapshots during cross-tab writes.
- Made failed IndexedDB opens retryable, allowed blocked upgrades to complete after older tabs close, and closed stale connections when a newer tab requests a database version change.
- Updated the local preference mirror only after an imported/restored dataset commits successfully to IndexedDB.
- Added a regression guard for atomic reads, connection lifecycle and restore ordering. No database schema, backup format or existing user data is changed.

## v1.17.15 — 3 November 2026
- Made external-backup freshness signatures independent of record-array order by canonicalizing fasting, deleted-fasting, weight and deleted-weight entries by ID before hashing.
- Prevents a harmless IndexedDB reload/reordering from incorrectly displaying “Backup needed”; actual additions, edits and deletions still invalidate the backup.
- Added regression assertions for order-independent signatures. No saved user data is rewritten or removed.

# Fasting Tracker changelog

## v1.17.14 — 3 November 2026
- Swapped the positions of the **Reached target** and **Longest fast** tiles in Statistics.
- Only the tile order changes; calculations, saved fasting records and all other statistics remain unchanged.


## v1.17.13 — 31 October 2026
- Restored the missing v1.17.12 release notes in the in-app changelog in English, Bulgarian and Spanish.
- Added regression checks to keep the three in-app language sections aligned with the repository release history.
- No application behavior or saved fasting, weight or backup data is changed.

## v1.17.12 — 30 October 2026
- Show the half-remaining-time continuation offer on every attempt to stop an active fast for personal reasons, including after choosing the shorter checkpoint or continuing to the original target.
- Keep health/safety and unavoidable stop reasons exempt from the continuation offer; preserve the existing active fast, target and checkpoint behavior.
- Add browser regression coverage for repeated attempts. No existing fasting, weight or backup records are changed.

## v1.17.11 — 30 October 2026
- Added a third choice to the early-stop encouragement: continue the current fast to its original target, continue for half the remaining time, or end the fast.
- Choosing the original target keeps the active fast and its original target unchanged, without creating a shorter checkpoint; the offer is not repeated for that same fast.
- Added accessible English, Bulgarian and Spanish labels and browser regression coverage. No existing fasting, weight or backup records are changed.

## v1.17.10 — 30 October 2026
- Added an **Add** action to weigh-in reminder details. It opens the weight-entry form directly and dismisses that reminder; other notification types retain their existing Dismiss-only action.
- Added accessible English, Bulgarian and Spanish labels and browser regression coverage.
- No existing fasting, weight, active-fast or backup records are changed.

## v1.17.9 — 30 October 2026
- Added concise, non-coercive fasting encouragement that shows the actual time remaining to the user's chosen target, with wording that makes continuing conditional on feeling well.
- When a user chooses to stop before the target, offers one optional shorter step equal to half the remaining time, calculated at the moment of the decision; accepting it creates a visible checkpoint without changing the original target.
- Health/safety and other unavoidable stop reasons bypass the shorter-step offer. Ending the fast remains available, and reaching the original target explicitly makes further fasting optional.
- Added English, Bulgarian and Spanish translations and regression coverage. No existing fasting, weight or backup records are changed.


## v1.17.8 — 30 October 2026
- Added Older/Newer navigation buttons and a full-history position slider to Timeline, Trend, Weeks, Months, Target Success and Cumulative Statistics views.
- Navigation follows the same oldest-to-newest direction as the Weight chart, keeps the selected value and detail panel synchronized, and disables at both history boundaries; direct chart selection remains available.
- Preserved the Calendar's existing month navigation. Category-based Duration Distribution and Start Times views remain unchanged.
- No fasting, weight, active-fast or backup records are changed.

## v1.17.7 — 30 October 2026
- Fixed initial weight-chart selection so Older starts from the newest available measurement and can step through the complete history to the oldest record; Newer returns to the newest.
- Added boundary-to-boundary regression coverage for Daily, Week, Month, Quarter, 6 months and Year views.
- No fasting, weight, active-fast or backup records are changed.

## v1.17.6 — 29 October 2026
- Older and Newer now move the selected weight pointer one measurement at a time, updating the displayed value and date.
- Manual horizontal scrolling and the full-history range slider remain available; the buttons disable at the oldest and newest measurements.
- Works across Daily, Week, Month, Quarter, 6 months and Year views without changing saved records.

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
