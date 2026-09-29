Fasting Tracker PWA v1.0.0

PUBLIC-LAUNCH PACKAGE

Upload the CONTENTS of this folder to the root of the GitHub repository used for GitHub Pages.

Required public files/folders:
- index.html
- privacy.html
- about.html
- manifest.webmanifest
- sw.js
- version.json
- robots.txt
- sitemap.xml
- _config.yml
- LICENSE
- BRANDING.md
- icons/
- en/
- bg/
- es/

FIRST-DEPLOYMENT-CHECKLIST.txt and RELEASE-GUIDE.txt are for you and are excluded from the generated site by _config.yml.
README.txt is also excluded.

IMPORTANT: Do not create a .nojekyll file. The HTML/robots/sitemap files use GitHub Pages' Jekyll processing and site.github.url metadata to resolve the final canonical URL automatically. This avoids hard-coding your GitHub username or repository name before deployment.

LICENSE AND BRANDING:
- Source code is licensed under the MIT License. See LICENSE.
- The Fasting Tracker name, logo, app icons and distinctive project branding are reserved and are not licensed for reuse under MIT. See BRANDING.md.
- The MIT License grants no trademark or brand rights. Truthful referential attribution is allowed as described in BRANDING.md.
- Health, safety and privacy notices are separate from the software license and remain applicable to the official app.

Core privacy model:
- Fasting and weight records are stored locally in browser/PWA storage.
- The app has no application backend database for user-entered health records.
- Exported JSON backups are user-controlled.
- GitHub Pages and external scientific sites may process ordinary web-request metadata under their own privacy policies.

Version: 1.0.0
Released: 2026-09-28


Pre-deployment localization fit audit:
- Narrow-screen navigation hardened for Bulgarian and Spanish labels.
- Long autophagy evidence labels can wrap without colliding with stage titles.
- Settings/banners/modal actions can wrap safely on very narrow screens.
- About/Privacy headers adapt on narrow screens.
- Corrected two English backup strings that could cause startup initialization failure.

Additional release-hardening in this final v1.0.0 candidate:
- Service-worker cleanup is restricted to Fasting Tracker cache names only.
- Update installation creates and verifies an internal recovery snapshot before activation.
- Backup imports reject duplicate IDs, overlapping fasting intervals, future completed fasts, invalid settings, and oversized files.
- Backup filenames include date and time to prevent same-day name collisions.
- Locale-aware decimal formatting is used for Bulgarian and Spanish displays.
- Privacy/About footers and language selection are synchronized with the main app.
- Progress indicators, charts, and dialogs have improved accessibility/focus handling.
- The weekly gamification metric is named “Target success rate this week” to reflect what is actually measured.
- Selecting a fasting target of 72 hours or more shows a one-time, non-blocking health/safety confirmation.

HOSTING PRIVACY NOTE:
Browser localStorage is scoped to the web origin, not the repository path. For a public deployment, prefer a dedicated custom domain/subdomain (for example fasting.example.com) or a dedicated GitHub Pages origin that does not host unrelated apps.


PUBLIC-RELEASE HARDENING
- Appearance: System / Light / Dark.
- Normal app releases are installed only through the in-app update flow; version.json supplies the cached shell list.
- Keep sw.js stable for ordinary content releases unless the service-worker protocol itself needs a change.
- Exported JSON backups are NOT encrypted.
- Fasts and weights store their creation time zone for stable historical display.
- Support link uses the GitHub repository Issues page.

- Localized SEO landing pages: /en/, /bg/, /es/.


UPDATE ARCHITECTURE (PROTOCOL v1)
- sw.js is intentionally version-agnostic and stable for ordinary releases.
- version.json is the release manifest: it declares protocolVersion, semantic version, entry page and the complete managed shell.
- The active installed release remains cache-first until the user accepts the in-app update.
- See RELEASE-GUIDE.txt before publishing any future version.


Pre-upload hardening:
- Recovery Mode blocks normal writes if stored data cannot be parsed; raw data can be exported or a recovery snapshot restored.
- Cross-window stale-write protection reloads newer saved data instead of overwriting it.
- History and weight lists render 50 entries at a time; imports are capped at 10,000 fasting and 10,000 weight records.
- Localized manifests start the installed app in the selected BG/ES language.
- GitHub Issues are public; users are warned not to post personal health data.

FINAL PRE-UPLOAD HARDENING (2026-09-28)
- One-time iPhone Safari notice explains that Safari and an installed Home Screen web app can have separate local storage; use Export/Import to move existing records.
- Settings shows persistent-storage status and estimated storage usage when the browser exposes those APIs; users can request storage protection explicitly.
- Live app data and recovery snapshots are now strict-validated before use; inconsistent data enters Recovery Mode instead of being silently filtered.
- version.json now contains SHA-256 hashes for every update-managed shell asset. The stable service worker verifies all hashes before activating a release.
- HTML integrity uses github-pages-v1 normalization so Jekyll substitutions for site.github.url and site.github.repository_url remain verifiable.
- Privacy text documents Home Screen/Safari storage separation and persistent-storage limitations.
- All public HTML pages use referrer policy no-referrer.
- Automated regression tests are included under tests/ and excluded from the published GitHub Pages site.
- tools/build_release.py regenerates version.json integrity hashes for future releases and is excluded from the published site.
