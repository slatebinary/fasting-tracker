# Fasting Tracker

A privacy-focused Progressive Web App (PWA) for tracking intermittent and extended fasting, weight, progress, and personal goals.

Fasting Tracker is designed to work locally on your device, including offline after installation. It does not require an account and does not use an application backend to store your fasting or weight records.

- **Selectable app icons** — choose from Plate & clock, Moon & utensils, Hourglass & leaf, or F timer before installation on iPhone/iPad or Android. Android manifests include dedicated maskable icon variants for launcher compatibility.

## Features

- Start and stop fasting with a live timer
- Start an ongoing fast retroactively if you forgot to press Start, with quick 1–12 hour presets or an exact start time
- Unlimited custom fasting targets, including multi-day fasts
- Fasting history with manual add/edit/delete support
- Daily fasting visualization and statistics
- Compact grouped Fasting Patterns navigator (Overview, Timing, Goals and Long-term) with remembered per-category views
- Weight tracking with kg/lb support and target weight
- Weight trend chart and history
- Optional consistency-focused gamification and achievements, including neutral “excused stop” handling for unavoidable early interruptions
- Evidence-aware intermittent-fasting basics, potential benefits, limitations and safety guidance, plus fasting/autophagy information with reputable references
- English, Bulgarian, and Spanish interface
- System, light, and dark appearance modes
- Offline PWA support
- Local JSON export/import backups
- Automatic rolling internal recovery snapshots (5 recent, 7 daily, 4 weekly, 6 monthly), compressed when supported, plus update safeguards
- Snapshot-storage pressure detection: main records stay the priority, recovery retention is reduced gracefully if local storage is tight, and the app prompts for an external backup
- Privacy-focused record-level IndexedDB storage model
- Accessibility improvements for keyboard and assistive technologies, including textual chart-data views

## Install on iPhone / iPad

1. Open the public Fasting Tracker URL in **Safari**.
2. Tap **Share**.
3. Choose **Add to Home Screen**.
4. Keep **Open as Web App** enabled if iOS shows it, then tap **Add**.

The Home Screen app can work offline after its files have been cached. Safari and an installed Home Screen web app may use separate local storage. If you already entered data in Safari, use **Export** in Safari and **Import** in the installed app to transfer it.

## Install on Android

1. Open the public Fasting Tracker URL in **Chrome** or another browser that supports PWA installation.
2. Open the browser menu.
3. Choose **Install app** or **Add to Home screen**.
4. Confirm the installation.

Fasting Tracker then appears on the Home screen/app launcher and can work offline after its files have been cached.


### Changing the installed app icon safely

On iPhone/iPad, and on some Android setups, changing an already-installed launcher icon requires removing/reinstalling the PWA. **Removing/uninstalling the Home Screen app can delete its local data, persistent-storage status, and internal recovery snapshots.** Before doing so, export an external JSON backup. Reinstall with the desired icon, then import the backup.

## Privacy

Fasting and weight records are stored locally in browser/PWA storage on the user's device. Fasting Tracker has no application backend database for user-entered health records.

Exported JSON backups are user-controlled and **are not encrypted**. Store them somewhere you consider secure.

The hosting provider and external websites opened from the app may process ordinary web-request metadata under their own privacy policies.

See the in-app **Privacy** page for details.

## Health information

Fasting Tracker is a tracking and educational tool. It does **not** provide medical advice, diagnose conditions, determine whether a fasting duration is safe, or recommend prolonged fasting.

The app includes an evidence-aware overview of what intermittent fasting is, common patterns, possible benefits, important uncertainties and safety considerations. It also keeps the autophagy information intentionally cautious: there is no validated universal human clock time at which autophagy suddenly “starts.” The app links to scientific literature so users can review the evidence directly.

People with medical conditions, people taking medications, pregnant or breastfeeding people, and anyone considering prolonged fasting should seek appropriate professional medical guidance.

## Languages

The interface currently supports:

- English
- Български (Bulgarian)
- Español (Spanish)

The app can follow the device language automatically or use a manually selected language.

## Data and backups

The app supports:

- external JSON backup/export
- validated import/restore with a metadata/count/date-range preview
- optional safe merge import with duplicate and conflict detection
- compressed internal recovery snapshots where the browser supports gzip compression
- recovery mode for damaged local data
- soft-delete/restore audit trails for fasting and weight records
- persistent-storage status and a Data & storage health panel
- privacy-preserving diagnostic export that contains technical metadata/counts, not fasting timestamps or weight values

Regular external backups are recommended because browser storage is not an absolute guarantee of permanent retention.

## Open source license

The source code is licensed under the **MIT License**. See [LICENSE](LICENSE).

## Branding

The **Fasting Tracker** name, logo, app icons, and distinctive project branding are reserved and are not licensed for reuse under the MIT License. The MIT License grants no trademark or branding rights.

See [BRANDING.md](BRANDING.md) for details.

## Development

Fasting Tracker is a static web application/PWA built with HTML, CSS, and JavaScript. The repository also contains release-integrity tooling and regression tests used to verify the application before publishing updates.

For bugs or feature requests, use the repository's **Issues** section. GitHub Issues are public, so do not include fasting history, weight data, medical information, or other personal data in a report.

## Disclaimer

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, as described in the MIT License. Health and safety notices in the application are separate from the software license and remain applicable to the official Fasting Tracker application.


## Internationalization

The interface currently supports English, Bulgarian and Spanish. Language, region, time zone and weight unit are kept independent. Locale-sensitive numbers/dates use `Intl`, plurals use `Intl.PluralRules`, and the layout is prepared for future right-to-left languages. See `I18N-GUIDE.md` before adding another translation. Backup JSON remains language-neutral.





## v1.10.1 quality, recovery & history tools

- Adds backup-freshness status so Settings distinguishes a current external backup from data changed since the last backup.
- Adds Export everything for the canonical JSON backup plus fasting and weight CSV data exports.
- Manual recovery snapshots may carry optional labels, and restore previews compare the snapshot with current data before confirmation.
- Adds immediate Undo after deleting individual fasting or weight entries.
- Adds collapsible history filters and bulk selection/export/delete/restore/permanent-delete tools.
- Adds storage-pressure warnings, install-state diagnostics, service-worker cache health/repair, and a local-only performance benchmark.
- Improves keyboard navigation, focus visibility, reduced-motion handling, touch targets and locale-aware CSV display fields.
- Expands regression coverage for backup schema restoration, storage-loss recovery, bulk/history quality tools and accessibility/keyboard behavior.

## v1.10.0 reliability, recovery & data transparency

- Adds detailed recovery-snapshot age/tier/storage visibility and a manual recovery-point action.
- Adds on-device data-integrity checks for IDs, overlaps, cached totals, IndexedDB state and snapshot pairs.
- JSON backups now include a record manifest plus checksum verification; v1 legacy backups remain importable.
- Snapshot restores now show a preview with version, reason and record counts before data changes.
- Completed-fast edit history can be opened directly from History and Recently deleted.
- Snapshot writes and full import/restore commits use atomic IndexedDB transactions.
- Adds CSV exports for fasting and weight history (for analysis, not restoration).
- Adds update-migration rollback tracking, richer privacy-safe diagnostics and clearer notification-permission state.
- Extends large-history caching and adds migration/fault regression coverage.
- Clarifies Current data vs Recovery snapshots vs External JSON backups in Settings.

## v1.9.2 notification recovery & newest-first chart data

When notification permission is blocked, Settings now gives iPhone/iPad-specific recovery guidance: use Settings → Notifications → Fasting Tracker, and if the Home Screen web app is absent there too, export a JSON backup before any reinstall. The textual **Show chart data** views now list the most recent visible data first for weight, fasting Timeline, Trend and Weeks.

## v1.9.1 completed-fast corrections

Completed fasts can be corrected without deleting/recreating them. Edits preserve the record ID, reject overlaps, recalculate history/statistics/XP automatically, retain up to 100 prior values in a per-record audit trail, visibly mark edited records, and ask for confirmation only when a correction materially changes times, duration, target, calendar day, or target-completion status.

## v1.9.0 long-term robustness architecture

v1.9.0 moves fasting records, deleted-fast audit entries, weight records and deleted-weight audit entries into separate record-level IndexedDB stores. Small settings remain separate, so ordinary edits no longer rewrite one lifetime-sized database object. Existing v1.8.x IndexedDB data and older local-storage data migrate automatically.

Recovery snapshot payloads are gzip-compressed when the browser supports `CompressionStream`, with backward-compatible JSON fallback and support for older snapshot formats. Weight records now use the same soft-delete/restore/permanent-delete audit model as fasting records. Settings includes a **Data & storage health** panel with persistent-storage status, storage usage/quota where available, record/audit counts, recovery snapshot count, last database save and last external backup, plus a privacy-preserving diagnostic export.

External JSON import now shows a preview with backup version, timestamp, record counts and covered date range. Users may replace the current dataset or use a safe merge mode that deduplicates identical records and rejects ID, live/deleted, active-fast or fasting-overlap conflicts. Weight and fasting charts provide optional textual data views for precise values and assistive technology. Regression coverage includes DST spring gaps, repeated autumn hours, multi-day elapsed durations across clock changes, 2,000-record responsiveness and the 70-year 25,567+25,567 lifetime dataset.

## v1.8.17 optional device notifications

- Adds an opt-in Settings → Notifications section. The app does not request browser/device permission until the user enables notifications.
- Recommended notification types default on inside the notification settings: fasting target reached, 7-day external-backup due, and one neutral prolonged-fast safety reminder at 24 hours.
- Optional weigh-in reminders (daily or weekly) and the neutral 24-hour-cycle remainder completion notice default off.
- Includes a test-notification button, lock-screen privacy warning, notification tap routing, and duplicate suppression across reloads.
- Remains local-first with no push server. Exact delivery while the PWA is fully closed or suspended is therefore not guaranteed; due conditions are checked while running and again when the app is reopened.
- Caches the latest completed fast so the one-second 24-hour-cycle display no longer rescans lifetime history on every tick.

## v1.8.16 neutral 24-hour-cycle wording

The sub-24-hour countdown is now described as the **remaining time in a 24-hour cycle**, not as a recommended non-fasting/eating interval or a prescribed time to start the next fast. For example, a completed 23h 40m fast displays a 20m cycle remainder. The card explicitly states that this is an optional arithmetic/timing reference, not a recommendation for how long to eat or when to begin another fast.


## v1.8.15 deleted-fast audit trail

Deleting a completed fast now moves it to **Recently deleted** instead of erasing it immediately. The active fasting record is removed from normal History, Statistics, streaks and XP, while an audit entry preserves the original start/end/target/time zone plus `deleted: true`, `deletedAt`, the deletion time zone and deletion reason. External JSON backups include these deleted audit entries, and restoring such a backup keeps them deleted. Recently deleted records can be restored when they do not overlap current history, or permanently deleted; **Delete all data** removes both live and deleted history.


## v1.8.13 Timeline continuation context

Selecting a Timeline segment now softly highlights any continuation of the same fast or non-fasting gap across adjacent day columns while keeping the selected piece strongly outlined. Midnight-spanning detail text uses “end of day” rather than pairing `23:59` with a full 24-hour duration, and full-fast comparisons use total hours (for example `28h 0m of 16h 0m target — 12h 0m beyond target`).

## v1.8.12 Timeline end-of-day label

The fasting Statistics Timeline now displays the end-of-day marker as `23:59` instead of `24:00` on both axes and in selected segment/gap time ranges. This is a presentation change only; internal day boundaries and duration calculations still use the exact midnight boundary.

## v1.8.11 fasting target details in Statistics

Selecting a fasting segment in Statistics → Timeline now shows the segment/full-fast duration together with the target saved for that specific fast, for example `13h 05m of 23h 0m`. If a fast crosses midnight, the detail distinguishes the portion shown on the selected day from the full fast so the target comparison remains accurate.

## v1.8.10 progress sharing

Fasting and Statistics now expose a privacy-aware Share progress action. The user can include the current/latest fast, overall fasting summary, consistency/XP, and optionally weight progress. Weight is off by default. Native Web Share is used when available, with a copy fallback, and the current installation link is always included.

## v1.8.9 optional first-run setup guide

New installations can use an optional guided setup. On mobile it first explains how to add Fasting Tracker to the Home Screen (including choosing the install-time icon and safeguarding any browser-only records), then resumes in the installed app, requests persistent storage when the browser supports it, walks through the first manual external JSON backup, offers basic fasting/weight/gamification defaults, and finishes with a storage/backup readiness summary. The guide can be dismissed and reopened at any time from Settings.

## v1.8.8 daily and labeled weight timeline

The Weight chart restores a Daily mode that plots every individual measurement (including multiple measurements on the same day) while keeping the full history horizontally scrollable and opening at the newest values. Daily is the default and fits roughly the latest 30 measurements in the visible chart on a phone. Week, Month, Quarter, 6 months and Year continue to show one average point per calendar period. Selecting any point shows the weight plus its exact date/time or explicit calendar period, both beside the point and in the detail line below the graph.

## v1.8.7 aggregated weight timeline

The Weight chart now behaves as a long-term period timeline. Week, Month, Quarter, 6 months and Year modes show one aggregate point per calendar period (the average of every measurement in that period), keep all individual weight entries available in the editable history, and allow horizontal scrolling back through older periods. The chart opens on the newest data and uses a virtualized viewport so decades of weekly points do not require a giant canvas.

## v1.8.6 weight statistics

The Weight screen added selectable rolling Week, Month, Quarter, 6 months and Year statistics. Each view shows its exact date range plus start/latest weight, change, average, lowest and highest measurements.

## v1.8.5 stop-fast and weight-chart refinements

Stopping an active fast uses one explicit in-app confirmation showing the elapsed duration, with Keep fasting and Stop & save actions. After saving, a 10-second Undo restores the exact active fast (start, target, time zone and audit timestamps) and removes the just-created History record. The Undo countdown is visible, Keep fasting returns to the Fasting home screen, and Weight-chart points can be tapped for exact values.

## v1.8.0 performance architecture

Primary fasting/weight history and recovery snapshot payloads use IndexedDB instead of large `localStorage` JSON blobs. Small preferences/version metadata remain in `localStorage` so public information pages can follow language/theme immediately. Daily fasting totals are persisted and updated incrementally, expensive statistics are range-limited/lazy, and the supported history ceiling is 100,000 fasting records plus 100,000 weight records. The portable external backup remains JSON. Regression coverage includes both the 2,000+2,000 smoke test and a 70-year test with 25,567 fasting plus 25,567 weight records.

## v1.8.19 weigh-in reminder cadence fix

The weigh-in reminder interval is now selected with explicit **Daily** and **Weekly** buttons in both Settings and the optional onboarding flow. The cadence can be chosen even while the reminder itself is off, so users can configure the interval first and then enable the reminder. The selected cadence is persisted and its active state is clearly visible, improving reliability on touch devices and iOS PWAs.


## v1.8.18 notification onboarding

The optional first-run setup now includes a dedicated Notifications step after the basic preferences and before the Ready summary. Recommended alerts (target reached, backup reminder and prolonged-fast safety) remain preselected; weigh-in and 24-hour-cycle remainder alerts remain off by default. The app does not request browser/device notification permission merely by showing the step. Permission is requested only after the user explicitly presses **Enable notifications**. **Not now** continues setup without changing the existing notification preferences. Unsupported and blocked notification environments are explained without blocking onboarding, and the final Ready summary shows notification status.


## v1.11.3 weight-entry refresh fix

- Fixed a stale weight cache that could make a newly added or edited weight appear not to save until the app was reloaded.
- Add/Edit weight now invalidates weight-derived caches immediately, refreshing Latest weight, history, period statistics, chart data and dependent gamification views in the same session.
- Added a dedicated iPhone-size regression that enters a weight for today, verifies immediate display, edits it, and verifies the corrected value without reloading.
- **No data-schema change.** Existing fasting/weight records and v1.11.x backups remain compatible.

## v1.11.2 chart readability & quality fixes

- Fasting Statistics bar-chart x-axis labels are now overlap-aware: the renderer measures real label widths and reduces or shortens ticks when necessary instead of drawing text on top of adjacent labels.
- Start-time pattern keeps all eight 3-hour buckets but uses compact clock ticks such as `00:00`, `03:00`, … on narrow screens; the full interval remains available in chart details and **Show chart data**.
- Weeks and long localized month labels use the same adaptive tick planner, improving narrow-screen rendering.
- Count-based charts use integer y-axis labels rather than fractional counts.
- Resize/orientation redraws are throttled to one animation frame to reduce chart jank.
- Added narrow-iPhone chart-axis regression coverage. No data-schema change.

## v1.11.1 stabilization & analytical controls

- Completed-fast Edit history can restore an earlier version while preserving the current state as a new audit entry.
- Trend, Months, Durations, Target success, Start times and Cumulative views have independent remembered ranges: 7 days, 30 days, 90 days, 6 months, 1 year or all history.
- Trend includes 7-day and 30-day rolling averages. Monthly totals include month-over-month and year-over-year comparisons.
- Added a cumulative-fasting-hours view and chart drill-down to the exact fasting records behind a selected chart value.
- Settings can rebuild derived daily totals/statistics/charts from the authoritative fasting records without changing those records.
- The app records the last-known-good release only after local integrity checks pass and keeps a short local update/deployment history for troubleshooting.
- Chart selections are announced through an ARIA live region. Large-text and real-iPhone release checklists are included.
- Fasting range/statistical calculations were extracted to `js/fasting-analytics.js`, continuing the gradual modularization of the main page.
- **No data-schema change:** the 1.11.x line remains on the existing data/IndexedDB schema. Storage-schema changes are frozen unless a concrete bug or requirement makes one necessary.
- `REAL-IPHONE-CHECKLIST.txt` documents the required real-device verification for offline launch, update, notifications, restore, cache repair, iOS suspension and accessibility.

## v1.11.0 reliability & fasting visualizations

- GitHub Pages deployment can now be gated by `.github/workflows/pages.yml`: the release metadata/hashes and release regression gate must pass before the Pages artifact is deployed.
- `version.json` is the canonical release-version source used by `tools/build_release.py` to stamp the runtime/public pages and rebuild release hashes.
- Update checks compare live `version.json` with the live entry page. Mixed deployments are reported as incomplete and are not installed.
- Settings shows deployment status: installed version, live metadata version, live entry version, service-worker version and last update check.
- Export Everything retains multi-file Web Share where available; its download fallback is now one restorable JSON bundle containing the canonical backup plus both CSV exports.
- Cache repair distinguishes a damaged same-version cache from a server that already contains a newer release.
- Device checks test IndexedDB, storage persistence, offline service worker, file export/share support, notifications support and installed-app mode locally.
- Recently Deleted reports approximate storage size and can be emptied deliberately with an external-backup prompt when the current backup is stale.
- Browser storage wording now makes clear that reported quota/usage is origin-wide and can include cache/other site data.
- Privacy-safe diagnostics capture broader sanitized failure categories and deployment state without including fasting times or weight values.
- Main-page support logic is beginning to move into versioned helper modules under `js/` to reduce the maintenance risk of one monolithic script.
- Added four fasting graphic views: 12-month totals, duration distribution, monthly target-success rate and start-time pattern. All expose text equivalents through Show chart data.
- `ACCESSIBILITY-CHECKLIST.txt` adds a real-device VoiceOver/Dynamic Type/orientation release pass.


## v1.11.5 chart interaction and repository quality

- Cumulative and Trend now show adaptive horizontal date ticks that reduce automatically before labels overlap.
- Tapping a Cumulative/Trend point shows an edge-aware in-chart callout; selected points also get a crosshair and remain visible even when ordinary markers are thinned.
- Dense Cumulative data keeps every underlying day selectable while drawing only a readable subset of markers. Horizontal drag scrubbing selects the nearest actual day.
- Fasting bar charts show a compact selected-value callout, and Weight now uses density-aware markers plus adaptive x-axis labels.
- Trend is keyboard-focusable again.
- Release packages include `.gitignore` and exclude `__pycache__`, `.pyc`, `.pyo` and obsolete root JavaScript leftovers.
- No fasting/weight data-schema change.

## v1.11.4 single-user compatibility policy

Because this installation is maintained for one known user who upgrades sequentially, compatibility is deliberately bounded instead of retaining every historical path indefinitely. The current storage layout is generation 3 (record-level IndexedDB). Direct startup migration supports generation 2 (legacy single-object IndexedDB) and generation 1 (legacy localStorage), then immediately rewrites them into generation 3 and removes the obsolete payload. External JSON backup import supports backup versions 1 and 2.

Old internal localStorage recovery snapshots are no longer migrated. Internal snapshots are local rollback aids, not a long-term interchange format; external JSON backups remain the supported long-term recovery path. Current record-store installations created before v1.11.4 are stamped with the generation marker without rewriting fasting or weight history. The dataVersion and IndexedDB schema remain unchanged in v1.11.4.


## v1.11.7 quality update

- Adds optional early-stop reasons for missed-target fasts.
- Business/social obligations, health/safety, travel/unexpected circumstances and other unavoidable reasons are treated as **excused** for consistency gamification: they do not break the target streak, but they also do not earn target-completion XP.
- Actual durations and target-success statistics remain factual.
- Stop reasons can be edited later, are retained in edit history and Recently Deleted, and are included in JSON/CSV exports.
- History can filter excused stops separately.
