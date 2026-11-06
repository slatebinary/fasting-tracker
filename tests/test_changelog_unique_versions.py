"""Guard the public Markdown release history against duplicate versions."""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
text = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
versions = re.findall(r"^## (v\d+\.\d+\.\d+) — ", text, re.M)
assert versions, "CHANGELOG.md must contain release entries"
assert len(versions) == len(set(versions)), "CHANGELOG.md contains duplicate release-version headings"
current = json.loads((ROOT / "version.json").read_text(encoding="utf-8"))["version"]
assert versions[0] == f"v{current}", "CHANGELOG.md must start with the current application version"
assert text.count("Added a 2,000-record browser performance regression to the required CI workflow.") == 1, "Performance regression note must appear only under its release entry"
assert text.count("Added regression coverage for leap day, midnight crossing, spring/autumn DST, travel time zones and 72-hour fasting through backup import and integrity verification.") == 1, "DST/backup regression note must appear only under its release entry"
print(f"PASS: {len(versions)} unique release entries; newest is v{current}.")
