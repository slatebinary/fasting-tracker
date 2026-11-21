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
assert len(parts) == 76, f"Expected seventy-six ordered app fragments, found {len(parts)}"

# Global lifecycle listeners and recurring background tasks are kept outside settings/startup wiring.
lifecycle_runtime = (source / "js" / "52-app-lifecycle-runtime.js").read_text(encoding="utf-8")

# The shared async application scope remains open through the lifecycle module.
startup_protection = (source / "js" / "51-startup-storage-protection.js").read_text(encoding="utf-8")
assert not startup_protection.rstrip().endswith("})();"), "the application scope must remain open through the lifecycle runtime"
assert lifecycle_runtime.rstrip().endswith("})();"), "the lifecycle runtime must close the shared application scope"
assert "const versionTransitionSnapshotOK = await initializePersistentStorage();" in (source / "js" / "00-bootstrap-and-preferences.js").read_text(encoding="utf-8")

settings_startup = (source / "js" / "50-settings-and-startup.js").read_text(encoding="utf-8")
for marker in ("window.addEventListener('online'", "window.addEventListener('offline'", "window.addEventListener('storage'", "document.addEventListener('visibilitychange'", "window.addEventListener('pageshow'", "window.addEventListener('pagehide'"):
    assert marker in lifecycle_runtime, f"application lifecycle module is missing {marker}"
    assert marker not in settings_startup, f"{marker} must not remain in settings/startup wiring"
for marker in ("setInterval(() =>", "setInterval(checkFastNotifications", "setInterval(checkMaintenanceNotifications", "queueStorageProtectionRefresh();", "setTimeout(maybeAutoOpenSetupGuide, 180)"):
    assert marker in lifecycle_runtime, f"application lifecycle module is missing scheduled task {marker}"
    assert marker not in settings_startup, f"scheduled task {marker} must not remain in settings/startup wiring"

assert (source / "js" / "31-timeline-interaction.js").is_file()
storage_pressure = (source / "js" / "43r-storage-pressure-policy.js").read_text(encoding="utf-8")
assert "function resolveStoragePressurePolicy" in storage_pressure
assert "function resolveStoragePressurePolicy" not in (source / "js" / "40-backup-and-update.js").read_text(encoding="utf-8")
backup_freshness = (source / "js" / "43m-backup-freshness-policy.js").read_text(encoding="utf-8")
assert "function resolveBackupFreshnessPolicy" in backup_freshness
assert "function resolveBackupFreshnessPolicy" not in (source / "js" / "40-backup-export.js").read_text(encoding="utf-8")
assert "function chartSelectionDetail" in (source / "js" / "31-timeline-interaction.js").read_text(encoding="utf-8")
assert "function selectTimelineAt" in (source / "js" / "31-timeline-interaction.js").read_text(encoding="utf-8")
assert (source / "js" / "32-weight-chart-interaction.js").is_file()
weight_layout = (source / "js" / "43w-weight-chart-layout-policy.js").read_text(encoding="utf-8")
assert "function weightChartPointSpacingPolicy" in weight_layout
assert "function weightChartVisibleRangePolicy" in weight_layout
weight_chart_interaction = (source / "js" / "32-weight-chart-interaction.js").read_text(encoding="utf-8")
assert "weightChartPointSpacingPolicy(buckets.length,viewportW)" in weight_chart_interaction
assert "weightChartVisibleRangePolicy(buckets.length,viewportW,scrollX,pointSpacing)" in weight_chart_interaction
assert "function weightChartPointSpacingPolicy" not in weight_chart_interaction
weight_chart = (source / "js" / "32-weight-chart-interaction.js").read_text(encoding="utf-8")
assert "function drawWeightChart" in weight_chart and "function handleWeightChartScroll" in weight_chart
assert "function drawWeightChart" not in (source / "js" / "30-statistics-and-charts.js").read_text(encoding="utf-8")
assert (source / "js" / "33-statistics-generic-chart.js").is_file()
generic_chart = (source / "js" / "33-statistics-generic-chart.js").read_text(encoding="utf-8")
assert "function drawGenericBarChart" in generic_chart and "function handleGenericChartPointer" in generic_chart
assert "function drawGenericBarChart" not in (source / "js" / "30-statistics-and-charts.js").read_text(encoding="utf-8")
assert (source / "js" / "33k-weight-history-range-cutoff.js").is_file()
weight_history_cutoff = (source / "js" / "33k-weight-history-range-cutoff.js").read_text(encoding="utf-8")
assert "function resolveWeightHistoryRangeCutoff" in weight_history_cutoff
assert "function resolveWeightHistoryRangeCutoff" not in (source / "js" / "42-weight-history-management.js").read_text(encoding="utf-8")
weight_history_display = (source / "js" / "33l-weight-history-display-range.js").read_text(encoding="utf-8")
assert "function selectWeightHistoryRecordsForDisplay" in weight_history_display
assert "function selectWeightHistoryRecordsForDisplay" not in (source / "js" / "42-weight-history-management.js").read_text(encoding="utf-8")
fast_intervals = (source / "js" / "43a-fasting-intervals.js").read_text(encoding="utf-8")
assert "function buildFastingIntervals" in fast_intervals
stats_models = (source / "js" / "43-statistics-data-models.js").read_text(encoding="utf-8")
assert "function buildFastingIntervals" not in stats_models
assert "function currentZoneDaySummaries" in stats_models and "buildCurrentZoneDaySummaries(" in stats_models
calendar_duration = (source / "js" / "43c-calendar-duration-display.js").read_text(encoding="utf-8")
assert "function calendarDurationForDisplay" in calendar_duration
assert "function calendarDurationForDisplay" not in (source / "js" / "38-calendar-dst-rendering.js").read_text(encoding="utf-8")
weight_hit_test = (source / "js" / "43g-weight-chart-hit-test-policy.js").read_text(encoding="utf-8")
assert "function nearestWeightChartPoint" in weight_hit_test
assert "function nearestWeightChartPointAtX" in weight_hit_test
assert "function isWeightChartPointerTap" in weight_hit_test
weight_chart_interaction = (source / "js" / "32-weight-chart-interaction.js").read_text(encoding="utf-8")
assert "return nearestWeightChartPoint(weightChartHitPoints,x,y,28)" in weight_chart_interaction
assert "return nearestWeightChartPointAtX(weightChartHitPoints,x,maxDistance)" in weight_chart_interaction
assert "isWeightChartPointerTap(start.x,start.y,event.clientX,event.clientY" in weight_chart_interaction
assert "function nearestWeightChartPoint" not in weight_chart_interaction

timeline_hit_test = (source / "js" / "43f-timeline-hit-test-policy.js").read_text(encoding="utf-8")
assert "function hitTestTimelineChart" in timeline_hit_test
assert "function hitTestTimelineChart" not in (source / "js" / "31-timeline-interaction.js").read_text(encoding="utf-8")
chart_continuations = (source / "js" / "43e-chart-continuation-keys.js").read_text(encoding="utf-8")
assert "function buildChartContinuationKeys" in chart_continuations
assert "function buildChartContinuationKeys" not in (source / "js" / "39-primary-chart-renderer.js").read_text(encoding="utf-8")
calendar_clock = (source / "js" / "43d-calendar-clock-change-policy.js").read_text(encoding="utf-8")
assert "function calendarClockChangeMetrics" in calendar_clock
assert "function formatClockChangeDuration" in calendar_clock
assert "function calendarClockChangeMetrics" not in (source / "js" / "38-calendar-dst-rendering.js").read_text(encoding="utf-8")
assert "function formatClockChangeDuration" not in (source / "js" / "38-calendar-dst-rendering.js").read_text(encoding="utf-8")
zone_summaries = (source / "js" / "43b-zone-day-summaries.js").read_text(encoding="utf-8")
assert "function buildCurrentZoneDaySummaries" in zone_summaries
assert "function buildCurrentZoneDaySummaries" not in stats_models
assert "return buildFastingIntervals(" in stats_models
assert "function allFastingIntervals" in stats_models
weight_daily = (source / "js" / "33m-weight-daily-buckets.js").read_text(encoding="utf-8")
assert "function buildWeightDailyBuckets" in weight_daily
assert "function buildWeightDailyBuckets" not in (source / "js" / "34-weight-period-analytics.js").read_text(encoding="utf-8")
assert "buildWeightDailyBuckets(entries)" in (source / "js" / "34-weight-period-analytics.js").read_text(encoding="utf-8")
assert (source / "js" / "34-weight-period-analytics.js").is_file()
assert (source / "js" / "33a-weight-calendar-primitives.js").is_file()
assert (source / "js" / "33b-weight-period-filter.js").is_file()
assert (source / "js" / "33c-weight-calendar-aggregation.js").is_file()
assert (source / "js" / "33d-weight-rolling-series.js").is_file()
assert (source / "js" / "33e-weight-period-summary.js").is_file()
assert (source / "js" / "33f-weight-selected-period-bounds.js").is_file()
assert (source / "js" / "33g-weight-period-labels.js").is_file()
assert (source / "js" / "33h-weight-entry-calendar-day.js").is_file()
weight_entry_day = (source / "js" / "33h-weight-entry-calendar-day.js").read_text(encoding="utf-8")
assert "function resolveWeightEntryCalendarDay" in weight_entry_day
assert "function resolveWeightEntryCalendarDay" not in (source / "js" / "34-weight-period-analytics.js").read_text(encoding="utf-8")
weight_date_range = (source / "js" / "33j-weight-period-date-range-label.js").read_text(encoding="utf-8")
assert "function formatWeightPeriodDateRange" in weight_date_range
assert "function formatWeightPeriodDateRange" not in (source / "js" / "34-weight-period-analytics.js").read_text(encoding="utf-8")
weight_lifetime = (source / "js" / "33i-weight-lifetime-maximum.js").read_text(encoding="utf-8")
assert "function highestValidWeightKg" in weight_lifetime
assert "function highestValidWeightKg" not in (source / "js" / "34-weight-period-analytics.js").read_text(encoding="utf-8")
weight_labels = (source / "js" / "33g-weight-period-labels.js").read_text(encoding="utf-8")
assert "function resolveWeightBucketLabel" in weight_labels
assert "function resolveWeightBucketLabel" not in (source / "js" / "34-weight-period-analytics.js").read_text(encoding="utf-8")
weight_selected_bounds = (source / "js" / "33f-weight-selected-period-bounds.js").read_text(encoding="utf-8")
assert "function resolveSelectedWeightPeriodBounds" in weight_selected_bounds
assert "function resolveSelectedWeightPeriodBounds" not in (source / "js" / "34-weight-period-analytics.js").read_text(encoding="utf-8")
weight_summary = (source / "js" / "33e-weight-period-summary.js").read_text(encoding="utf-8")
assert "function summarizeWeightPeriodEntries" in weight_summary
assert "function summarizeWeightPeriodEntries" not in (source / "js" / "34-weight-period-analytics.js").read_text(encoding="utf-8")
weight_rolling = (source / "js" / "33d-weight-rolling-series.js").read_text(encoding="utf-8")
assert "function buildWeightRollingAverageBuckets" in weight_rolling
assert "function buildWeightRollingAverageBuckets" not in (source / "js" / "34-weight-period-analytics.js").read_text(encoding="utf-8")
weight_aggregation = (source / "js" / "33c-weight-calendar-aggregation.js").read_text(encoding="utf-8")
assert "function aggregateWeightCalendarBuckets" in weight_aggregation
assert "function aggregateWeightCalendarBuckets" not in (source / "js" / "34-weight-period-analytics.js").read_text(encoding="utf-8")
weight_filter = (source / "js" / "33b-weight-period-filter.js").read_text(encoding="utf-8")
assert "function weightEntriesWithinBounds" in weight_filter
assert "function weightEntriesWithinBounds" not in (source / "js" / "34-weight-period-analytics.js").read_text(encoding="utf-8")
weight_calendar = (source / "js" / "33a-weight-calendar-primitives.js").read_text(encoding="utf-8")
for owned_function in ("subtractCalendarMonthsClamped", "weightPeriodBounds", "weightBucketKeyForDay", "nextWeightBucketKey", "weightBucketDate", "weightRollingWindowDays"):
    assert f"function {owned_function}" in weight_calendar, f"{owned_function} must remain in the pure weight calendar fragment"
    assert f"function {owned_function}" not in (source / "js" / "34-weight-period-analytics.js").read_text(encoding="utf-8"), f"{owned_function} must not remain in weight analytics"
weight_analytics = (source / "js" / "34-weight-period-analytics.js").read_text(encoding="utf-8")
assert "function buildWeightAggregateBuckets" in weight_analytics and "function renderWeightPeriodAnalytics" in weight_analytics
assert "function buildWeightAggregateBuckets" not in (source / "js" / "30-statistics-and-charts.js").read_text(encoding="utf-8")
assert (source / "js" / "35-gamification-achievements.js").is_file()
gamification = (source / "js" / "35-gamification-achievements.js").read_text(encoding="utf-8")
weight_week_streak = (source / "js" / "43o-weight-week-streak-policy.js").read_text(encoding="utf-8")
assert "function calculateWeightWeekStreak" in weight_week_streak
assert "function calculateWeightWeekStreak" not in gamification
assert "calculateWeightWeekStreak(weekKeys,currentWeekKey)" in gamification

notification_detail_policy = (source / "js" / "43p-notification-detail-normalization-policy.js").read_text(encoding="utf-8")
notification_state = (source / "js" / "13-notification-state.js").read_text(encoding="utf-8")
assert "function normalizeNotificationDetailItemsPolicy" in notification_detail_policy
assert "function normalizeNotificationDetailItemsPolicy" not in notification_state
assert "return normalizeNotificationDetailItemsPolicy(raw, Date.now(), validDate, APP_SCREENS, NOTIFICATION_DETAIL_TTL_MS, NOTIFICATION_DETAIL_LIMIT)" in notification_state
notification_snooze_policy = (source / "js" / "43q-notification-snooze-restoration-policy.js").read_text(encoding="utf-8")
assert "function resolveDueSnoozedNotificationDetailsPolicy" in notification_snooze_policy
assert "function resolveDueSnoozedNotificationDetailsPolicy" not in notification_state
assert "resolveDueSnoozedNotificationDetailsPolicy(pending, notificationDetailItems(), nowMs, validDate, APP_SCREENS, NOTIFICATION_DETAIL_LIMIT)" in notification_state
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
backup_export = (source / "js" / "40-backup-export.js").read_text(encoding="utf-8")
assert "function backupDatasetSignature" in backup_export and "async function exportBackup" in backup_export
assert "async function exportFastingCsv" in backup_export and "async function exportWeightCsv" in backup_export
assert "function backupDatasetSignature" not in (source / "js" / "40-backup-and-update.js").read_text(encoding="utf-8")
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
assert "function statsSummary" in stats_data and "function statsSummary" not in main_stats
gamification = (source / "js" / "35-gamification-achievements.js").read_text(encoding="utf-8")
assert "function scheduleStatsGamificationDetail" in gamification
assert "let statsGamificationRenderToken = 0" in gamification
assert "function scheduleStatsGamificationDetail" not in main_stats
assert "function renderStats" in main_stats
assert "function chartSelectionDetail" not in (source / "js" / "30-statistics-and-charts.js").read_text(encoding="utf-8")
assert (source / "js" / "49-installation-setup-guide.js").is_file()
setup_guide = (source / "js" / "49-installation-setup-guide.js").read_text(encoding="utf-8")
assert "function renderSetupGuide" in setup_guide and "function setSetupGuideStep" in setup_guide
assert "function setupInstallInstructions" in setup_guide and "function renderSetupBackupStatus" in setup_guide
assert "function applySetupBasics" in setup_guide and "function maybeAutoOpenSetupGuide" in setup_guide
assert "function renderSetupGuide" not in (source / "js" / "50-settings-and-startup.js").read_text(encoding="utf-8")
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

settings_disclosure = (source / "js" / "49-settings-disclosure.js").read_text(encoding="utf-8")
assert "function settingsGroups" in settings_disclosure and "function applySettingsSearch" in settings_disclosure
assert "function initSettingsDisclosure" in settings_disclosure and "function restoreSettingsGroupState" in settings_disclosure
settings_startup = (source / "js" / "50-settings-and-startup.js").read_text(encoding="utf-8")
assert "function settingsGroups" not in settings_startup and "function applySettingsSearch" not in settings_startup

recovery_snapshots = (source / "js" / "11-recovery-snapshots.js").read_text(encoding="utf-8")
assert "function snapshotCoverageStats" in recovery_snapshots and "function snapshotTierKeys" in recovery_snapshots
assert "function createInternalSnapshotAsync" in recovery_snapshots and "function scheduleRollingSnapshot" in recovery_snapshots
migration_state = (source / "js" / "12-app-migration-state.js").read_text(encoding="utf-8")
assert "function beginPendingMigration" in migration_state and "function finalizePendingMigrationSuccess" in migration_state
assert "function markLastKnownGood" in migration_state and "function deploymentHistoryMeta" in migration_state
storage_recovery = (source / "js" / "10-storage-and-recovery.js").read_text(encoding="utf-8")
assert "function beginPendingMigration" not in storage_recovery and "function markLastKnownGood" not in storage_recovery
assert "function snapshotCoverageStats" not in storage_recovery and "function createInternalSnapshotAsync" not in storage_recovery
assert "function normalizeNotificationPreferences" not in storage_recovery
assert "function renderNotificationDetails" not in storage_recovery
notification_state = (source / "js" / "13-notification-state.js").read_text(encoding="utf-8")
assert "function normalizeNotificationPreferences" in notification_state
assert "function loadNotificationRuntimeState" in notification_state and "function saveNotificationRuntimeState" in notification_state
assert "function normalizeNotificationDetailItems" in notification_state
assert "function recordNotificationDetail" in notification_state and "function renderNotificationDetails" in notification_state

data_validation = (source / "js" / "14-data-validation.js").read_text(encoding="utf-8")
assert "function migrateData" in data_validation and "function normalizeRecord" in data_validation
assert "function normalizeData" in data_validation and "function prepareCompatibleData" in data_validation
assert "function validateCompatibleData" in data_validation and "function validateImportedData" in data_validation
storage_validation_source = (source / "js" / "10-storage-and-recovery.js").read_text(encoding="utf-8")
for owned_function in ("migrateData", "normalizeRecord", "normalizeData", "prepareCompatibleData", "validateCompatibleData", "validateImportedData"):
    assert f"function {owned_function}" not in storage_validation_source, f"{owned_function} must remain in data-validation fragment"

fast_history = (source / "js" / "21-fast-history-management.js").read_text(encoding="utf-8")
assert "function historyFilterSpec" in fast_history and "function renderHistory" in fast_history
assert "function bulkDeleteFasts" in fast_history and "function restoreDeletedFast" in fast_history
time_fast = (source / "js" / "20-time-fast-history.js").read_text(encoding="utf-8")
next_fast_cycle = (source / "js" / "43n-next-fast-cycle-policy.js").read_text(encoding="utf-8")
assert "function resolveNextFastCycleInfo" in next_fast_cycle
assert "function resolveNextFastCycleInfo" not in time_fast
assert "function nextFastCycleInfo" in time_fast
assert "function historyFilterSpec" not in time_fast and "function renderHistory" not in time_fast


backdate_workflows = (source / "js" / "15-backdated-fast-workflows.js").read_text(encoding="utf-8")
for owned_function in (
    "showBackdateError", "clearBackdateConflict", "backdateConflicts",
    "renderBackdateConflict", "setBackdatePreset", "openBackdateModal",
    "closeBackdateModal", "saveBackdatedActiveFast",
    "adjustBackdateAfterConflicts", "editBackdateConflict",
    "deleteBackdateConflictAndStart",
):
    assert f"function {owned_function}" in backdate_workflows, f"{owned_function} must remain in backdate workflow fragment"
    assert f"function {owned_function}" not in (source / "js" / "20-time-fast-history.js").read_text(encoding="utf-8"), f"{owned_function} must not remain in time/fast lifecycle fragment"
assert "function startFast" in (source / "js" / "20-time-fast-history.js").read_text(encoding="utf-8")


edit_fast_workflows = (source / "js" / "15-backdated-fast-workflows.js").read_text(encoding="utf-8")
for owned_function in ("openEditActiveFast", "saveEditedActiveFast", "commitEditedActiveFast", "setEditFastStartAgo", "syncEditFastPresetState"):
    assert f"function {owned_function}" in edit_fast_workflows, f"{owned_function} must remain in Edit fast workflow fragment"
assert "function requestActiveGoalChange" not in edit_fast_workflows
assert "editActiveTargetBtn" not in (source / "js" / "20-time-fast-history.js").read_text(encoding="utf-8")
assert "pendingLongFastScope='editFast'" in edit_fast_workflows


time_calendar = (source / "js" / "17-time-calendar-primitives.js").read_text(encoding="utf-8")
for owned_function in (
    "exactDuration", "friendlyDuration", "compactDuration", "totalHoursDuration",
    "dayKey", "dayKeyFast", "weekKeyFromDayString", "weightCalendarDay",
    "localDateLabel", "localDateTimeLabel", "localTimeLabel",
    "nextZonedDayBoundary", "addIntervalToDayMap",
    "completedFastingByStoredCalendarDay", "fastingByStoredCalendarDay",
    "fastingMsForDay", "startOfWeek", "weekKey",
):
    assert f"function {owned_function}" in time_calendar, f"{owned_function} must remain in time/calendar primitives"
    assert f"function {owned_function}" not in (source / "js" / "20-time-fast-history.js").read_text(encoding="utf-8"), f"{owned_function} must not remain in time/fast lifecycle fragment"
assert "return timeUtils.dayKey(dateLike, timeZone)" in time_calendar
assert "return timeUtils.nextZonedDayBoundary(ms, timeZone, knownKey)" in time_calendar
assert "function startFast" in (source / "js" / "20-time-fast-history.js").read_text(encoding="utf-8")


notification_runtime = (source / "js" / "19-notification-runtime-and-settings.js").read_text(encoding="utf-8")
for owned_function in (
    "nativeNotificationsSupported", "notificationPermissionState",
    "notificationPrefs", "notificationEnabledFor", "sendDeviceNotification",
    "maybeNotifyTargetReached", "maybeNotifyLongFastSafety",
    "maybeNotifyCycleComplete", "backupDueToken", "maybeNotifyBackupDue",
    "latestWeightRecord", "maybeNotifyWeighIn", "checkFastNotifications",
    "checkMaintenanceNotifications", "notificationDiagnosticState",
    "notificationStatusKey", "renderWeighCadenceButtons",
    "setSettingsWeighCadence", "renderNotificationSettings",
    "setNotificationMasterEnabled", "saveNotificationOption",
    "sendTestNotification",
):
    assert f"function {owned_function}" in notification_runtime or f"async function {owned_function}" in notification_runtime, f"{owned_function} must remain in notification runtime fragment"
    assert f"function {owned_function}" not in (source / "js" / "20-time-fast-history.js").read_text(encoding="utf-8"), f"{owned_function} must not remain in time/fast lifecycle fragment"
assert "if (notificationPermissionState() !== 'granted') return false;" in notification_runtime
assert "recordNotificationDetail(kind" in notification_runtime
assert "saveNotificationRuntimeState()" in notification_runtime
assert "function updateTimer" in (source / "js" / "20-time-fast-history.js").read_text(encoding="utf-8")


app_update_workflows = (source / "js" / "44-app-update-workflows.js").read_text(encoding="utf-8")
for owned_function in (
    "openUpdateModal", "closeUpdateModal", "setUpdateUI",
    "saveUpdateStatusMeta", "loadUpdateStatusMeta", "fetchLiveReleaseStatus",
    "checkForUpdates", "getCurrentServiceWorkerController",
    "requestShellRefresh", "installUpdate",
):
    assert f"function {owned_function}" in app_update_workflows or f"async function {owned_function}" in app_update_workflows, f"{owned_function} must remain in app-update workflow fragment"
    assert f"function {owned_function}" not in (source / "js" / "40-backup-and-update.js").read_text(encoding="utf-8"), f"{owned_function} must not remain in backup/recovery fragment"
assert "async function installUpdate" in app_update_workflows
assert "async function requestShellRefresh" in app_update_workflows

semantic_version_policy = (source / "js" / "43zz-semantic-version-policy.js").read_text(encoding="utf-8")
assert "function compareVersions" in semantic_version_policy
assert "function compareVersions" not in app_update_workflows
assert "compareVersions(remote, APP_VERSION)" in app_update_workflows

# Trend and cumulative Statistics charts share the same pure day-hit selection policy.
stats_hit_test = (source / "js" / "43h-stats-chart-hit-test-policy.js").read_text(encoding="utf-8")
assert "function nearestStatsChartDayHit" in stats_hit_test
specialized_charts = (source / "js" / "40-specialized-statistics-charts.js").read_text(encoding="utf-8")
assert "nearestStatsChartDayHit(x,y,trendPlotBounds,trendInteractiveLayout)" in specialized_charts
assert "nearestStatsChartDayHit(x,y,cumulativePlotBounds,cumulativeInteractiveLayout)" in specialized_charts
assert "let best=null,bestD=Infinity" not in specialized_charts

# Trend and cumulative chart marker density is owned by a pure policy helper.
stats_marker_density = (source / "js" / "43i-stats-chart-marker-density.js").read_text(encoding="utf-8")
assert "function statsChartMarkerStep" in stats_marker_density
assert "statsChartMarkerStep(days.length,w,chartRange('trend'))" in specialized_charts
assert "statsChartMarkerStep(days.length,w,chartRange('cumulative'))" in specialized_charts
assert "function markerStepForPlot" not in specialized_charts

# Statistics weekly summaries use a pure local-noon Monday anchor policy.
stats_week_anchor = (source / "js" / "43j-stats-week-anchor-policy.js").read_text(encoding="utf-8")
assert "function startOfStatsWeekMonday" in stats_week_anchor
assert "startOfStatsWeekMonday(new Date())" in specialized_charts
assert "function startOfWeekMonday" not in specialized_charts

# Weekly Statistics summaries are assembled by a pure local-calendar policy.
stats_weekly_builder = (source / "js" / "43l-stats-weekly-summary-builder.js").read_text(encoding="utf-8")
assert "function buildStatsWeeklySummaryRows" in stats_weekly_builder
assert "buildStatsWeeklySummaryRows(thisMonday,tz,summaries,chartDayForAnchor,dayKey" in specialized_charts
assert "for(let wi=7;wi>=0;wi--)" not in specialized_charts

# Monthly comparison period selection is a pure, index-stable policy.
stats_month_comparison = (source / "js" / "43k-stats-month-comparison-policy.js").read_text(encoding="utf-8")
assert "function selectStatsMonthComparisonPeriods" in stats_month_comparison
assert "selectStatsMonthComparisonPeriods(items,genericChartSelectedKey)" in specialized_charts
assert "selectedIndex=genericChartSelectedKey?items.findIndex" not in specialized_charts

# Generic timing/duration bars support pointer selection and a completed-click fallback.
generic_chart = (source / "js" / "33-statistics-generic-chart.js").read_text(encoding="utf-8")
assert "function selectGenericChartItem(event)" in generic_chart
assert "function handleGenericChartPointer(event)" in generic_chart
assert "function handleGenericChartClick(event)" in generic_chart
assert "const genericChartPointerStamps=new WeakMap()" in generic_chart
assert "genericChartPointerStamps.get(canvas)" in generic_chart and "genericChartPointerStamps.delete(canvas)" in generic_chart
startup = (source / "js" / "50-settings-and-startup.js").read_text(encoding="utf-8")
assert "el(id).addEventListener('pointerdown',handleGenericChartPointer);el(id).addEventListener('click',handleGenericChartClick)" in startup
assert "fastDistributionChart" in startup and "fastStartPatternChart" in startup
 

# Screen navigation and render scheduling are isolated from settings event wiring.
screen_navigation = (source / "js" / "46-screen-navigation-and-rendering.js").read_text(encoding="utf-8")
for owned_function in ("activeScreenId", "applyPreferencesIfChanged", "queueStorageProtectionRefresh", "renderScreen", "renderAll", "applyGoalValue", "longFastNoticeSeen", "requestGoalChange", "rememberDocumentReturn", "activateScreen", "installArrowKeyNavigation"):
    assert f"function {owned_function}" in screen_navigation, f"{owned_function} must remain in screen navigation fragment"
    assert f"function {owned_function}" not in startup, f"{owned_function} must not remain in settings/startup fragment"

# Storage-protection UI and final service-worker startup live in the final startup fragment.
assert (source / "js" / "51-startup-storage-protection.js").is_file()
startup_storage = (source / "js" / "51-startup-storage-protection.js").read_text(encoding="utf-8")
assert "function formatBytes(bytes)" in startup_storage
assert "async function queryStorageProtection" in startup_storage
assert "async function refreshStorageProtection" in startup_storage
assert "async function repairEmergencyBoot" in startup_storage
assert "navigator.serviceWorker.register('./sw.js'" in startup_storage
assert "function formatBytes(bytes)" not in (source / "js" / "50-settings-and-startup.js").read_text(encoding="utf-8")
assert "async function refreshStorageProtection" not in (source / "js" / "50-settings-and-startup.js").read_text(encoding="utf-8")

# Import merge primitives are isolated from settings/startup orchestration.
import_merge = (source / "js" / "45-import-merge-workflows.js").read_text(encoding="utf-8")
assert "function backupDateRange" in import_merge
assert "function mergeImportedData(imported)" in import_merge
assert "resolveImportedDataMergePolicy(data, imported, normalizeStopReason, validateCompatibleData)" in import_merge
assert "function stableRecordString" not in import_merge
assert "function mergeByIdAndFingerprint" not in import_merge
import_merge_policy = (source / "js" / "43s-import-merge-policy.js").read_text(encoding="utf-8")
for owned_function in ("stableRecordString", "mergeByIdAndFingerprint", "resolveImportedDataMergePolicy"):
    assert f"function {owned_function}" in import_merge_policy, f"{owned_function} must be owned by the pure import merge policy"
    assert f"function {owned_function}" not in import_merge, f"{owned_function} must not remain in import merge orchestration"


# Category-specific external-backup signatures are deterministic pure policy.
backup_categories = (source / "js" / "43t-backup-category-signatures-policy.js").read_text(encoding="utf-8")
assert "function buildBackupCategorySignatures" in backup_categories
backup_export = (source / "js" / "40-backup-export.js").read_text(encoding="utf-8")
assert "return buildBackupCategorySignatures(sourceData, value => fnv1a64Hex(stableStringify(value)))" in backup_export
assert "function backupCategorySignatures" in backup_export
assert "function buildBackupCategorySignatures" not in backup_export

# Notification preference defaults, strict booleans and snooze bounds are owned by a pure policy.
notification_preferences = (source / "js" / "43x-notification-preferences-policy.js").read_text(encoding="utf-8")
assert "function normalizeNotificationPreferencesPolicy" in notification_preferences
notification_state = (source / "js" / "13-notification-state.js").read_text(encoding="utf-8")
assert "return normalizeNotificationPreferencesPolicy(raw, NOTIFICATION_SNOOZE_MINUTES)" in notification_state
bootstrap = (source / "js" / "00-bootstrap-and-preferences.js").read_text(encoding="utf-8")
assert "const NOTIFICATION_SNOOZE_MINUTES = Object.freeze([15,30,60,240,480,720,1440,2880,4320,10080])" in bootstrap
assert "const NOTIFICATION_SNOOZE_MINUTES" not in notification_state
assert "function normalizeNotificationPreferences(raw)" in notification_state
assert "function normalizeNotificationPreferencesPolicy" not in notification_state

post_start_extension = (source / "js" / "43z-post-start-extension-policy.js").read_text(encoding="utf-8")
assert "function resolvePostStartExtensionWindow" in post_start_extension
assert "function resolvePostStartExtendedTimestamp" in post_start_extension

notification_snooze_category = (source / "js" / "43y-notification-snooze-category-policy.js").read_text(encoding="utf-8")
assert "function notificationSnoozeCategoryPolicy" in notification_snooze_category
assert "return notificationSnoozeCategoryPolicy(kind)" in notification_state
assert "function notificationSnoozeCategoryPolicy" not in notification_state


# External-backup manifest record counts are checked by a pure policy.
backup_manifest = (source / "js" / "43u-backup-manifest-policy.js").read_text(encoding="utf-8")
assert "function backupManifestMatchesPolicy" in backup_manifest
assert "return backupManifestMatchesPolicy(raw)" in backup_export
assert "function backupManifestMatchesPolicy" not in backup_export


# Import preview date-range calculation is isolated as a pure policy.
backup_date_range = (source / "js" / "43v-backup-date-range-policy.js").read_text(encoding="utf-8")
assert "function resolveBackupDateRangePolicy" in backup_date_range
import_workflows = (source / "js" / "45-import-merge-workflows.js").read_text(encoding="utf-8")
assert "return resolveBackupDateRangePolicy(candidate, validDate)" in import_workflows
assert "function backupDateRange" in import_workflows
assert "function resolveBackupDateRangePolicy" not in import_workflows
