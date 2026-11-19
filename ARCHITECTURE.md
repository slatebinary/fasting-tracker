# Application architecture

## Current build model

The deployed `index.html` is generated from `src/app/index.template.html`, `src/app/styles.css`, and 38 ordered JavaScript source fragments under `src/app/js/`. `tools/build_app_shell.py` concatenates the fragments in filename order into one classic script. This preserves offline operation and the existing shared lexical scope, but it does **not** create independent ECMAScript modules: declarations and mutable state remain shared, and fragment order is a runtime dependency.

The source is substantially better organized than one monolithic file. The fragments generally have responsibility-oriented boundaries, and `tests/test_app_shell_atomization.py` guards the generated shell and several function-ownership boundaries. The current architecture should therefore be described as **atomized source with shared runtime scope**, not as a fully modular application.

## Subsystem map

| Concern | Principal source fragments | Responsibility |
|---|---|---|
| Bootstrap and preferences | `00-bootstrap-and-preferences.js` | Shared application state, preferences and initialization primitives |
| Persistence and recovery | `10-storage-and-recovery.js`, `11-recovery-snapshots.js`, `12-app-migration-state.js`, `14-data-validation.js` | IndexedDB access, schema/data migration, snapshots and validation |
| Notifications | `13-notification-state.js`, `19-notification-runtime-and-settings.js` | Notification state, scheduling and user settings |
| Time and fasting lifecycle | `15-backdated-fast-workflows.js`, `16-active-target-workflows.js`, `17-time-calendar-primitives.js`, `20-time-fast-history.js`, `21-fast-history-management.js` | Time-zone/DST primitives, active fasts, edits and history |
| Weight | `32-weight-chart-interaction.js`, `33a-weight-calendar-primitives.js`, `33b-weight-period-filter.js`, `33c-weight-calendar-aggregation.js`, `33d-weight-rolling-series.js`, `33e-weight-period-summary.js`, `33f-weight-selected-period-bounds.js`, `34-weight-period-analytics.js`, `42-weight-history-management.js` | Pure calendar calculations, rolling-series construction, selected-period bounds, chart interaction, aggregation/period analytics and weight-record management |
| Statistics and visualizations | `30-statistics-and-charts.js`, `33-statistics-generic-chart.js`, `36-statistics-history-drilldown.js`, `37-statistics-visualization-controls.js`, `38-calendar-dst-rendering.js`, `39-primary-chart-renderer.js`, `40-specialized-statistics-charts.js`, `43-statistics-data-models.js` | Aggregation, chart rendering, drill-down and calendar presentation |
| Other feature workflows | `35-gamification-achievements.js`, `41-record-entry-workflows.js`, `45-import-merge-workflows.js` | Achievements, record entry and import/merge |
| Backup and update | `40-backup-and-update.js`, `40-backup-export.js`, `44-app-update-workflows.js` | External backups, recovery protection and app update workflows |
| Navigation and setup | `46-screen-navigation-and-rendering.js`, `49-installation-setup-guide.js`, `49-settings-disclosure.js`, `50-settings-and-startup.js`, `51-startup-storage-protection.js` | Screen rendering/navigation, setup, settings and startup protection |
| Timeline | `31-timeline-interaction.js` | Timeline interaction and selection |

The build sorts filenames lexicographically. Duplicate numeric prefixes are therefore intentional ordering labels, not unique module identifiers. Avoid renaming fragments without checking build order and the ownership assertions in the architecture tests.

## Assessment

- **Good:** responsibilities are split across focused source files; the build is deterministic; the app remains dependency-free and offline-capable; storage, backup, time and visualization concerns have identifiable homes; regression tests protect a number of boundaries.
- **Constrained:** fragments share one lexical scope; feature code can read or mutate common state directly; dependencies are implicit; initialization order matters; a file boundary alone does not prevent cross-feature coupling.
- **Not established:** full encapsulation, dependency inversion, independently testable feature modules, or safe arbitrary reordering.

## Incremental modularization plan

1. **Stabilize contracts first.** Keep storage schema and persisted data unchanged. Add tests around pure time, weight aggregation, fasting calculations and backup normalization before moving code.
2. **Extract pure domain functions.** Start with deterministic calculations that accept inputs and return outputs. Keep DOM, IndexedDB, local storage and notification side effects outside these functions.
3. **Introduce narrow feature interfaces.** Let Weight, Statistics, Timeline and Fasting call explicit functions rather than reaching into each other's implementation details. Avoid a broad global service locator.
4. **Isolate persistence behind a small repository API.** Preserve IndexedDB stores, migration paths, backup compatibility and recovery semantics. Do not change the storage model as part of a code-organization change.
5. **Only then consider native ES modules.** A module conversion is a separate architectural change. It must preserve GitHub Pages deployment, service-worker precaching, startup ordering, offline operation and the existing browser/iOS PWA lifecycle.

Do not combine these stages into a rewrite. Each extraction should be small, have explicit ownership tests, and pass the relevant browser regressions before the next boundary is changed.
