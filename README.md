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
- Weight tracking with kg/lb support and target weight
- Weight trend chart and history
- Optional consistency-focused gamification and achievements
- Evidence-aware intermittent-fasting basics, potential benefits, limitations and safety guidance, plus fasting/autophagy information with reputable references
- English, Bulgarian, and Spanish interface
- System, light, and dark appearance modes
- Offline PWA support
- Local JSON export/import backups
- Automatic rolling internal JSON recovery snapshots (5 recent, 7 daily, 4 weekly, 6 monthly) and update safeguards
- Snapshot-storage pressure detection: main records stay the priority, recovery retention is reduced gracefully if local storage is tight, and the app prompts for an external backup
- Privacy-focused local storage model
- Accessibility improvements for keyboard and assistive technologies

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
- validated import/restore
- internal recovery snapshots
- recovery mode for damaged local data
- persistent-storage status where the browser exposes the relevant API

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


## v1.7.11 performance architecture

The app uses screen-level lazy rendering, Pointer Events for touch/mouse activation, deferred recovery-snapshot work, derived-statistics caches, and external JSON/JavaScript localization sources under `i18n/`. A Playwright large-history smoke test is included in `tests/test_performance.py`.
