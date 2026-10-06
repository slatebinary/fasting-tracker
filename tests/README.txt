Fasting Tracker regression tests

Run from the repository root:

  python tests/test_release.py

The suite checks package integrity hashes, JavaScript syntax, localization parity,
DOM references, manifests, storage/privacy hardening, indexing policy, and runs
algorithm tests against functions extracted directly from index.html (localized
numbers, Sofia DST ambiguity/gaps, semantic version comparison, and multi-day
fast allocation).

The tests/ directory is excluded from the GitHub Pages output by _config.yml.
- test_v1111_stabilization.py: edit-history restore, per-chart range memory, rolling/cumulative graphics, drill-down, derived-data rebuild and last-known-good state.
- test_datetime_edges_v1111.py: leap day, midnight crossing, Europe/Sofia spring/autumn DST and 72-hour import/integrity regression.
- test_large_text_v1111.py: 200-300% zoom/layout stress for key Settings controls and modals.
- test_v1116_pattern_navigator.py: compact four-category Fasting Patterns navigation, grouped View selector, keyboard navigation and remembered per-category chart selection.
