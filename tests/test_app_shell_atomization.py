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
assert len(parts) == 35, f"Expected thirty-five ordered app fragments, found {len(parts)}"
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


active_target_workflows = (source / "js" / "16-active-target-workflows.js").read_text(encoding="utf-8")
for owned_function in (
    "showActiveTargetError", "syncActiveTargetPresetState",
    "openActiveTargetModal", "closeActiveTargetModal",
    "applyActiveGoalValue", "requestActiveGoalChange",
):
    assert f"function {owned_function}" in active_target_workflows, f"{owned_function} must remain in active-target workflow fragment"
    assert f"function {owned_function}" not in (source / "js" / "20-time-fast-history.js").read_text(encoding="utf-8"), f"{owned_function} must not remain in time/fast lifecycle fragment"
assert "function startFast" in (source / "js" / "20-time-fast-history.js").read_text(encoding="utf-8")

assert "if (!data.activeStart || recoveryMode) return;" in active_target_workflows
assert "parsed <= 0 || parsed > MAX_SAFE_GOAL_HOURS" in active_target_workflows
assert "next >= LONG_FAST_NOTICE_HOURS && !longFastNoticeSeen()" in active_target_workflows
assert "pendingLongFastScope = 'active';" in active_target_workflows
assert "save({ invalidateDerived:false, dirtyViews:['fasting','settings'] })" in active_target_workflows


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
    "openUpdateModal", "closeUpdateModal", "compareVersions", "setUpdateUI",
    "saveUpdateStatusMeta", "loadUpdateStatusMeta", "fetchLiveReleaseStatus",
    "checkForUpdates", "getCurrentServiceWorkerController",
    "requestShellRefresh", "installUpdate",
):
    assert f"function {owned_function}" in app_update_workflows or f"async function {owned_function}" in app_update_workflows, f"{owned_function} must remain in app-update workflow fragment"
    assert f"function {owned_function}" not in (source / "js" / "40-backup-and-update.js").read_text(encoding="utf-8"), f"{owned_function} must not remain in backup/recovery fragment"
assert "async function installUpdate" in app_update_workflows
assert "async function requestShellRefresh" in app_update_workflows

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
for owned_function in ("backupDateRange", "stableRecordString", "mergeByIdAndFingerprint", "mergeImportedData"):
    assert f"function {owned_function}" in import_merge, f"{owned_function} must remain in import merge fragment"
    assert f"function {owned_function}" not in (source / "js" / "50-settings-and-startup.js").read_text(encoding="utf-8"), f"{owned_function} must not remain in settings/startup fragment"
