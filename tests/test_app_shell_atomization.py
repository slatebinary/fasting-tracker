#!/usr/bin/env python3
"""Verify the generated app shell is reproducible from its atomized sources."""
from pathlib import Path
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / "src" / "app"
index = (ROOT / "index.html").read_text(encoding="utf-8")
css = (source / "styles.css").read_text(encoding="utf-8")
parts = sorted((source / "js").glob("*.js"))
assert len(parts) == 12, f"Expected twelve ordered app fragments, found {len(parts)}"
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
assert "function chartSelectionDetail" not in (source / "js" / "30-statistics-and-charts.js").read_text(encoding="utf-8")
version = json.loads((ROOT / "version.json").read_text(encoding="utf-8"))["version"]
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
