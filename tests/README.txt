Fasting Tracker regression tests

Run from the repository root:

  python tests/test_release.py

The suite checks package integrity hashes, JavaScript syntax, localization parity,
DOM references, manifests, storage/privacy hardening, indexing policy, and runs
algorithm tests against functions extracted directly from index.html (localized
numbers, Sofia DST ambiguity/gaps, semantic version comparison, and multi-day
fast allocation).

The tests/ directory is excluded from the GitHub Pages output by _config.yml.
