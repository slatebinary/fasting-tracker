#!/usr/bin/env python3
"""Verify the generated app shell is reproducible from its atomized sources."""
from pathlib import Path
import json
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / "src" / "app"
index = (ROOT / "index.html").read_text(encoding="utf-8")
css = (source / "styles.css").read_text(encoding="utf-8")
parts = sorted((source / "js").glob("*.js"))
assert len(parts) == 19, f"Expected nineteen ordered app fragments, found {len(parts)}"
assert (source / "js" / "31-timeline-interaction.js").is_file()
assert "function chartSelectionDetail" in (source / "js" / "31-timeline-interaction.js").read_text(encoding="utf-8")
assert "function selectTimelineAt" in (source / "js" / "31-timeline-interaction.js").read_text(encoding="utf-8")
assert (source / "js" / "32-weight-chart-interaction.js").is_file()
weight_chart = (source / "js" / "32-weight-chart-interaction.js").read_text(encoding="utf-8")
assert "function drawWeightChart" in weight_chart and "function handleWeightChartScroll" in weight_chart
assert "function drawWeightChart" not in (source / "js" / "30-statistics-and-charts.js").read_text(encoding="utf-8")
assert (source / "js" / "33-statistics-generic-chart.js").is_file()
generic_chart = (source / "js" / "33-statistics-generic-chart.js").read_text(encoding="utf-8")
assert "function drawGenericBarChart" in generic_chart and "function handleGenericChartPointer" in generic_chart
assert "function drawGenericBarChart" not in (source / "js" / "30-statistics-and-charts.js").read_text(encoding="utf-8")
assert (source / "js" / "34-weight-period-analytics.js").is_file()
weight_analytics = (source / "js" / "34-weight-period-analytics.js").read_text(encoding="utf-8")
assert "function buildWeightAggregateBuckets" in weight_analytics and "function renderWeightPeriodAnalytics" in weight_analytics
assert "function buildWeightAggregateBuckets" not in (source / "js" / "30-statistics-and-charts.js").read_text(encoding="utf-8")
assert (source / "js" / "35-gamification-achievements.js").is_file()
gamification = (source / "js" / "35-gamification-achievements.js").read_text(encoding="utf-8")
assert "function achievementDefinitions" in gamification and "function renderGamificationDetail" in gamification
assert "function achievementDefinitions" not in (source / "js" / "30-statistics-and-charts.js").read_text(encoding="utf-8")
assert "function renderGamificationDetail" not in (source / "js" / "30-statistics-and-charts.js").read_text(encoding="utf-8")
assert (source / "js" / "36-statistics-history-drilldown.js").is_file()
history_drilldown = (source / "js" / "36-statistics-history-drilldown.js").read_text(encoding="utf-8")
assert "function statsHistoryNavigationItems" in history_drilldown and "function selectStatsHistoryIndex" in history_drilldown
assert "function openStatsDrilldown" in history_drilldown and "function renderChartDetailForMode" in history_drilldown
main_stats = (source / "js" / "30-statistics-and-charts.js").read_text(encoding="utf-8")
assert "function statsHistoryNavigationItems" not in main_stats and "function openStatsDrilldown" not in main_stats
assert (source / "js" / "37-statistics-visualization-controls.js").is_file()
viz_controls = (source / "js" / "37-statistics-visualization-controls.js").read_text(encoding="utf-8")
assert "function setStatsVizGroup" in viz_controls and "function renderStatsVisualizations" in viz_controls
assert "function verifyStatsVisualizationAfterLayout" in viz_controls
assert "function setStatsVizGroup" not in main_stats and "function renderStatsVisualizations" not in main_stats
assert (source / "js" / "38-calendar-dst-rendering.js").is_file()
calendar_dst = (source / "js" / "38-calendar-dst-rendering.js").read_text(encoding="utf-8")
assert "function dayClockChangeInfo" in calendar_dst and "function renderFastCalendar" in calendar_dst
assert "function handleCalendarGridKeydown" in calendar_dst
assert "function dayClockChangeInfo" not in main_stats and "function renderFastCalendar" not in main_stats
assert (source / "js" / "39-primary-chart-renderer.js").is_file()
primary_chart = (source / "js" / "39-primary-chart-renderer.js").read_text(encoding="utf-8")
assert "function buildInteractiveChartDays" in primary_chart and "function drawChart" in primary_chart
assert "function buildInteractiveChartDays(" not in main_stats and "function drawChart(" not in main_stats
assert (source / "js" / "40-specialized-statistics-charts.js").is_file()
specialized_charts = (source / "js" / "40-specialized-statistics-charts.js").read_text(encoding="utf-8")
assert "function buildSummaryChartDays" in specialized_charts and "function drawFastTrendChart" in specialized_charts
assert "function buildDurationDistribution" in specialized_charts and "function drawFastCumulativeChart" in specialized_charts
assert "function handleTrendPointer" in specialized_charts and "function cancelCumulativePointer" in specialized_charts
assert "function buildSummaryChartDays" not in main_stats and "function drawFastTrendChart" not in main_stats
assert (source / "js" / "41-record-entry-workflows.js").is_file()
record_entry = (source / "js" / "41-record-entry-workflows.js").read_text(encoding="utf-8")
assert "function openEntryModal" in record_entry and "function saveManualEntry" in record_entry
assert "function openWeightModal" in record_entry and "function saveWeightEntry" in record_entry
assert "function bindResponsiveAction" in record_entry and "function bindReliableModalAction" in record_entry
assert "function saveManualEntry" not in main_stats and "function saveWeightEntry" not in main_stats
assert (source / "js" / "42-weight-history-management.js").is_file()
weight_history = (source / "js" / "42-weight-history-management.js").read_text(encoding="utf-8")
assert "function setWeightPeriodMode" in weight_history and "function renderWeight" in weight_history
assert "function softDeleteWeightById" in weight_history and "function renderWeightChartData" in weight_history
assert "function setWeightUnit" in weight_history and "function setTargetWeightFromInput" in weight_history
assert "function renderWeight" not in main_stats and "function setWeightUnit" not in main_stats
assert "function renderStatsChartData" not in main_stats
backup_module = (source / "js" / "40-backup-and-update.js").read_text(encoding="utf-8")
assert "function hasBackupWorthyData" in backup_module
assert "function normalizeBackupClockSkew" in backup_module and "function ensureBackupTrackingStarted" in backup_module
assert "let backupDatasetSignatureCache = null" in backup_module
assert "function hasBackupWorthyData" not in main_stats and "function ensureBackupTrackingStarted" not in main_stats
assert (source / "js" / "43-statistics-data-models.js").is_file()
stats_data = (source / "js" / "43-statistics-data-models.js").read_text(encoding="utf-8")
assert "function allFastingIntervals" in stats_data and "function currentZoneDaySummaries" in stats_data
assert "function renderStatsChartData" in stats_data
assert "function allFastingIntervals" not in main_stats and "function renderStatsChartData" not in main_stats
assert "function chartSelectionDetail" not in (source / "js" / "30-statistics-and-charts.js").read_text(encoding="utf-8")
version = json.loads((ROOT / "version.json").read_text(encoding="utf-8"))["version"]
version_major, version_minor, version_patch = (int(part) for part in version.split("."))
expected_recent_releases = [
    f"{version_major}.{version_minor}.{patch}"
    for patch in range(version_patch, max(-1, version_patch - 5), -1)
]
changelog_html = (ROOT / "changelog.html").read_text(encoding="utf-8")
assert "</ul><li>" not in changelog_html, "Localized changelog contains a list item outside its release list"
for language in ("en", "bg", "es"):
    section = re.search(
        rf'<section data-lang="{language}">(.*?)</section>',
        changelog_html,
        re.DOTALL,
    )
    assert section, f"Missing {language} changelog section"
    release_versions = re.findall(r"<h2>v(\d+\.\d+\.\d+)</h2>", section.group(1))
    assert all(release_versions.count(item) == 1 for item in expected_recent_releases), (
        f"{language} changelog must retain each of the five latest releases: "
        f"{expected_recent_releases}"
    )
    positions = [release_versions.index(item) for item in expected_recent_releases]
    assert positions == sorted(positions), (
        f"{language} changelog must list the latest releases in descending order"
    )

assembled_js = "".join(path.read_text(encoding="utf-8") for path in parts).replace("@@FT_APP_VERSION@@", version)
style = index.split("<style>", 1)[1].split("</style>", 1)[0]
scripts = [part.split("</script>", 1)[0] for part in index.split("<script>")[1:]]
main_js = next((item for item in scripts if "const APP_VERSION" in item), None)
assert style == css, "Generated stylesheet differs from source"
assert main_js == assembled_js, "Generated application script differs from ordered source fragments"
template = (source / "index.template.html").read_text(encoding="utf-8")
assert "@@FT_APP_CSS@@" in template and "@@FT_APP_JS@@" in template
assert "@@FT_APP_VERSION@@" in template
result = subprocess.run([sys.executable, str(ROOT / "tools" / "build_app_shell.py"), "--check"], cwd=ROOT, capture_output=True, text=True)
assert result.returncode == 0, result.stdout + result.stderr
print("PASS: app-shell CSS and JavaScript atomization is reproducible.")
