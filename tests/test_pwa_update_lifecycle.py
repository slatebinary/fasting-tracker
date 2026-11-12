#!/usr/bin/env python3
"""Exercise real service-worker release staging, reload, confirmation and data preservation."""
import copy
import hashlib
import json
import re
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
BASE_METADATA = json.loads((ROOT / "version.json").read_text(encoding="utf-8"))
BASE_VERSION = BASE_METADATA["version"]
BASE_HTML = (ROOT / "index.html").read_text(encoding="utf-8")
PREFIX = "/fasting-tracker/"

try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f"SKIP: Playwright unavailable: {exc}")
    sys.exit(0)


def patch_version(version, increment):
    major, minor, patch = (int(part) for part in version.split("."))
    return f"{major}.{minor}.{patch + increment}"


def normalize_html_for_integrity(text, scope_url):
    parsed = urlsplit(scope_url)
    site_base = scope_url.rstrip("/")
    site_origin = f"{parsed.scheme}://{parsed.netloc}"
    normalized = (
        str(text)
        .replace("\r\n", "\n")
        .replace("\r", "\n")
    )
    normalized = re.sub(r"^---\n[\s\S]*?\n---\n", "", normalized, count=1)
    normalized = (
        normalized
        .replace("{{ site.github.url }}", "__SITE_URL__")
        .replace("{{ site.github.repository_url }}", "__REPO_URL__")
        .replace(site_base, "__SITE_URL__")
        .replace(site_origin, "__SITE_URL__")
    )
    normalized = re.sub(
        r"""https://github\.com/[^/"'<>\s]+/[^/"'<>\s]+""",
        "__REPO_URL__",
        normalized,
    )
    return normalized


def build_release(version, scope_url):
    meta_marker = f'<meta name="ft-app-version" content="{BASE_VERSION}"'
    const_marker = f"const APP_VERSION = '{BASE_VERSION}';"
    if meta_marker not in BASE_HTML or const_marker not in BASE_HTML:
        raise AssertionError("Could not locate both app-version markers in index.html")
    html = BASE_HTML.replace(meta_marker, f'<meta name="ft-app-version" content="{version}"', 1)
    html = html.replace(const_marker, f"const APP_VERSION = '{version}';", 1)
    normalized = normalize_html_for_integrity(html, scope_url)
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
    metadata = copy.deepcopy(BASE_METADATA)
    metadata["version"] = version
    metadata["notes"] = "Simulated service-worker update lifecycle regression"
    metadata["hashes"]["./"] = digest
    metadata["hashes"]["./index.html"] = digest
    return metadata, html


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        request_path = unquote(urlsplit(path).path)
        if not request_path.startswith(PREFIX):
            return str(ROOT / "404.html")
        relative = request_path[len(PREFIX):]
        target = (ROOT / relative).resolve()
        try:
            target.relative_to(ROOT)
        except ValueError:
            return str(ROOT / "404.html")
        return str(target)

    def _send_dynamic(self, body, content_type):
        encoded = body if isinstance(body, bytes) else body.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self):
        parsed = urlsplit(self.path)
        path = parsed.path
        if "__ft_release" in parsed.query:
            if path in getattr(self.server, "failed_paths", set()):
                self.send_error(503, "simulated interrupted release asset transfer")
                return
            if path in getattr(self.server, "corrupt_paths", set()):
                target = Path(self.translate_path(self.path))
                if target.is_file():
                    body = target.read_bytes() + b"\\n/* simulated corrupted release asset */"
                    self._send_dynamic(body, self.guess_type(str(target)) or "application/octet-stream")
                    return
        state = self.server.release_state
        if path in (PREFIX, PREFIX + "index.html"):
            self._send_dynamic(state["html"], "text/html; charset=utf-8")
            return
        if path == PREFIX + "version.json":
            self._send_dynamic(json.dumps(state["metadata"]), "application/json; charset=utf-8")
            return
        if path.startswith(PREFIX) and path.endswith("/"):
            relative = path[len(PREFIX):].strip("/")
            target = ROOT / relative / "index.html"
            if target.is_file():
                self._send_dynamic(target.read_bytes(), "text/html; charset=utf-8")
                return
        super().do_GET()

    def log_message(self, *_args):
        pass


def read_app_state(page):
    return page.evaluate("""() => new Promise((resolve, reject) => {
      const request = indexedDB.open('FastingTrackerDB', 2);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(['state','records','snapshotMeta'], 'readonly');
        const settings = tx.objectStore('state').get('settings');
        const records = tx.objectStore('records').getAll();
        const snapshots = tx.objectStore('snapshotMeta').getAll();
        let result = {};
        settings.onsuccess = () => { result.settings = settings.result?.data || {}; };
        records.onsuccess = () => { result.records = records.result || []; };
        snapshots.onsuccess = () => { result.snapshots = snapshots.result || []; };
        settings.onerror = records.onerror = snapshots.onerror = () => reject(settings.error || records.error || snapshots.error);
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
      };
    })""")


def wait_for_active_fast(page, timeout=20):
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        try:
            last = read_app_state(page)
            if last.get("settings", {}).get("activeStart"):
                return last
        except Exception:
            pass
        time.sleep(0.2)
    raise AssertionError(f"Active fast was not persisted to IndexedDB; last state: {last}")


def worker_health(page):
    return page.evaluate("""async () => {
      const registration = await navigator.serviceWorker.ready;
      const worker = navigator.serviceWorker.controller || registration.active;
      if (!worker) return null;
      return await new Promise(resolve => {
        const channel = new MessageChannel();
        const timer = setTimeout(() => resolve(null), 10000);
        channel.port1.onmessage = event => {
          clearTimeout(timer);
          try { channel.port1.close(); } catch {}
          resolve(event.data);
        };
        worker.postMessage({type:'CHECK_HEALTH', protocolVersion:1}, [channel.port2]);
      });
    }""")


def wait_for_installed_release(page, version, active_start):
    page.wait_for_function(
                "version => document.querySelector('meta[name=ft-app-version]')?.content === version",
        arg=version,
        timeout=90000,
    )
    page.wait_for_function(
        "version => document.querySelector('#appVersionLabel')?.textContent.trim() === ('v' + version)",
        arg=version,
        timeout=45000,
    )
    page.wait_for_function(
        """version => {
          try {
            const meta = JSON.parse(localStorage.getItem('fastingTracker.appMeta') || '{}');
            return meta.lastKnownGood?.version === version &&
              meta.lastKnownGood?.reason === 'startup-integrity' &&
              meta.lastMigration?.to === version &&
              meta.lastMigration?.status === 'success';
          } catch { return false; }
        }""",
        arg=version,
        timeout=45000,
    )
    page.wait_for_function("() => !!navigator.serviceWorker?.controller", timeout=30000)
    health = worker_health(page)
    assert health and health.get("ok") is True, f"Service worker health check failed after {version}: {health}"
    assert health.get("activeVersion") == version, f"Wrong active cached release after {version}: {health}"
    assert health.get("cacheComplete") is True and health.get("missingAssets") == 0, (
        f"Release cache is incomplete after {version}: {health}"
    )
    state = wait_for_active_fast(page)
    assert state["settings"].get("activeStart") == active_start, (
        f"Active fast was not preserved across update to {version}"
    )
    return state


def ensure_update_group_open(page):
    group = page.locator("#settingsGroupUpdates")
    if not group.evaluate("(node) => node.open"):
        page.evaluate("document.querySelector('#settingsGroupUpdates > summary').click()")


def install_release(page, version, backup, active_start):
    ensure_update_group_open(page)
    page.evaluate("document.querySelector('#updateBtn').click()")
    page.wait_for_function(
        "() => !document.querySelector('#updateBanner').hidden",
        timeout=20000,
    )
    page.evaluate("document.querySelector('#updateBtn').click()")
    page.wait_for_function(
        "() => !document.querySelector('#updateModal').hidden",
        timeout=10000,
    )
    if backup:
        with page.expect_download(timeout=30000) as download_info:
            page.evaluate("document.querySelector('#backupUpdateBtn').click()")
        download = download_info.value
        assert download.suggested_filename.startswith("fasting-backup-")
        assert download.suggested_filename.endswith(".json")
    else:
        page.evaluate("document.querySelector('#updateWithoutBackupBtn').click()")
    return wait_for_installed_release(page, version, active_start)


def assert_failed_update_preserved_release(page, active_version, active_start):
    page.wait_for_function(
        """() => {
          const button = document.querySelector('#updateBtn');
          const status = document.querySelector('#updateStatus')?.textContent || '';
          return button && !button.disabled && !/installing/i.test(status) &&
            document.querySelector('#updateBanner')?.hidden &&
            document.querySelector('#updateModal')?.hidden;
        }""",
        timeout=45000,
    )
    page.wait_for_function(
        """version => {
          const meta = JSON.parse(localStorage.getItem('fastingTracker.appMeta') || '{}');
          return document.querySelector('meta[name="ft-app-version"]')?.content === version &&
            meta.lastKnownGood?.version === version;
        }""",
        arg=active_version,
        timeout=15000,
    )
    health = worker_health(page)
    assert health and health.get("ok") is True, f"Active release health failed after rejected update: {health}"
    assert health.get("activeVersion") == active_version and health.get("cacheComplete") is True, (
        f"Rejected update displaced the last known-good release: {health}"
    )
    state = wait_for_active_fast(page)
    assert state["settings"].get("activeStart") == active_start, "Failed update changed active-fast metadata"
    staging = page.evaluate(
        """activeVersion => caches.keys().then(keys => keys.filter(name =>
          name.includes('-staging-') &&
          !name.includes('-release-' + activeVersion + '-staging-')
        ))""",
        active_version,
    )
    assert not staging, f"Failed update left an orphaned staging cache behind: {staging}"


def attempt_rejected_update(page, active_version, active_start):
    ensure_update_group_open(page)
    page.evaluate("document.querySelector('#updateBtn').click()")
    page.wait_for_function("() => !document.querySelector('#updateBanner').hidden", timeout=20000)
    page.evaluate("document.querySelector('#updateBtn').click()")
    page.wait_for_function("() => !document.querySelector('#updateModal').hidden", timeout=10000)
    page.evaluate("document.querySelector('#updateWithoutBackupBtn').click()")
    page.wait_for_function(
        """() => {
          const status = document.querySelector('#updateStatus')?.textContent || '';
          return !document.querySelector('#updateBtn')?.disabled &&
            document.querySelector('#updateBanner')?.hidden &&
            !/installing/i.test(status);
        }""",
        timeout=45000,
    )
    assert_failed_update_preserved_release(page, active_version, active_start)


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.daemon_threads = True
    scope_url = f"http://127.0.0.1:{server.server_port}{PREFIX}"
    base_digest = hashlib.sha256(
        normalize_html_for_integrity(BASE_HTML, scope_url).encode("utf-8")
    ).hexdigest()
    assert BASE_METADATA["hashes"]["./"] == base_digest
    assert BASE_METADATA["hashes"]["./index.html"] == base_digest

    first_version = patch_version(BASE_VERSION, 1)
    second_version = patch_version(BASE_VERSION, 2)
    third_version = patch_version(BASE_VERSION, 3)
    fourth_version = patch_version(BASE_VERSION, 4)
    first_metadata, first_html = build_release(first_version, scope_url)
    second_metadata, second_html = build_release(second_version, scope_url)
    third_metadata, third_html = build_release(third_version, scope_url)
    fourth_metadata, fourth_html = build_release(fourth_version, scope_url)
    server.release_state = {"metadata": BASE_METADATA, "html": BASE_HTML}
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    errors = []

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                executable_path="/usr/bin/chromium",
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage"],
            )
            context = browser.new_context(
                accept_downloads=True,
                viewport={"width": 390, "height": 844},
                timezone_id="UTC",
                service_workers="allow",
            )
            page = context.new_page()
            page.set_default_timeout(15000)
            page.on("pageerror", lambda exc: errors.append(str(exc)))
            page.on("dialog", lambda dialog: dialog.accept())
            page.goto(scope_url, wait_until="domcontentloaded")
            page.wait_for_function(
                "version => document.querySelector('meta[name=\"ft-app-version\"]')?.content === version",
                arg=BASE_VERSION,
                timeout=20000,
            )
            # The worker can claim the page before asynchronous app/IndexedDB
            # startup has finished. Wait for the runtime version label before
            # interacting with controls.
            page.wait_for_function(
                "version => document.querySelector('#appVersionLabel')?.textContent.trim() === ('v' + version)",
                arg=BASE_VERSION,
                timeout=30000,
            )
            page.wait_for_function(
                "() => !!navigator.serviceWorker?.controller",
                timeout=45000,
            )
            initial_health = worker_health(page)
            assert initial_health and initial_health.get("activeVersion") == BASE_VERSION, (
                f"Initial service-worker release was not installed: {initial_health}"
            )
            assert initial_health.get("cacheComplete") is True, (
                f"Initial service-worker cache is incomplete: {initial_health}"
            )

            page.evaluate("""() => {
              const tab = document.querySelector('.tab[data-screen="fasting"]');
              if (!tab) throw new Error('Fasting navigation tab is missing');
              tab.click();
            }""")
            page.wait_for_function(
                "() => { const button = document.querySelector('#toggleFast'); return !!button && !!button.offsetParent; }",
                timeout=15000,
            )
            page.wait_for_function(
                "() => { const button = document.querySelector('#toggleFast'); return !!button && !button.disabled; }",
                timeout=15000,
            )
            # The first-run notice can cover the control in a real PWA shell;
            # dispatch the control's own click handler after verifying it is enabled.
            page.evaluate("document.querySelector('#toggleFast').click()")
            initial_state = wait_for_active_fast(page)
            active_start = initial_state["settings"]["activeStart"]

            page.evaluate("document.querySelector('.tab[data-screen=\"settings\"]').click()")
            ensure_update_group_open(page)
            page.wait_for_function(
                """() => {
                  const button = document.querySelector('#updateBtn');
                  const status = document.querySelector('#updateStatus')?.textContent || '';
                  return button && !button.disabled && !/checking/i.test(status) &&
                    document.querySelector('#updateBanner')?.hidden;
                }""",
                timeout=30000,
            )

            # First update uses the no-external-backup path.
            server.release_state = {"metadata": first_metadata, "html": first_html}
            install_release(page, first_version, backup=False, active_start=active_start)

            # Second update exercises the Backup & Update path and verifies
            # that the backup download completes before the release is staged.
            page.wait_for_function(
                """() => {
                  const button = document.querySelector('#updateBtn');
                  const status = document.querySelector('#updateStatus')?.textContent || '';
                  return button && !button.disabled && !/checking/i.test(status) &&
                    document.querySelector('#updateBanner')?.hidden;
                }""",
                timeout=30000,
            )
            server.release_state = {"metadata": second_metadata, "html": second_html}
            install_release(page, second_version, backup=True, active_start=active_start)

            # A failed network transfer must discard the staging cache without
            # changing the active pointer or the last known-good application.
            server.release_state = {"metadata": third_metadata, "html": third_html}
            server.failed_paths = {PREFIX.rstrip("/") + "/js/fasting-time.js"}
            attempt_rejected_update(page, second_version, active_start)

            # A successful HTTP response containing corrupted bytes must also
            # fail SHA-256 validation and leave the previous release untouched.
            server.failed_paths = set()
            server.corrupt_paths = {PREFIX.rstrip("/") + "/js/fasting-time.js"}
            server.release_state = {"metadata": fourth_metadata, "html": fourth_html}
            attempt_rejected_update(page, second_version, active_start)

            # The last known-good release must still boot from its complete
            # cache while the network is unavailable, retaining the active fast.
            context.set_offline(True)
            page.reload(wait_until="domcontentloaded")
            page.wait_for_function(
                "version => document.querySelector('meta[name=ft-app-version]')?.content === version",
                arg=second_version,
                timeout=30000,
            )
            page.wait_for_function("() => !!navigator.serviceWorker?.controller", timeout=30000)
            offline_health = worker_health(page)
            assert offline_health and offline_health.get("activeVersion") == second_version and offline_health.get("cacheComplete") is True, (
                f"Last known-good release did not survive offline reload: {offline_health}"
            )
            offline_state = wait_for_active_fast(page)
            assert offline_state["settings"].get("activeStart") == active_start, "Offline reload lost the active fast"
            context.set_offline(False)
            server.failed_paths = set()
            server.corrupt_paths = set()

            assert not errors, "Browser errors during PWA update lifecycle: " + " | ".join(errors[:8])
            browser.close()
    finally:
        server.shutdown()
        server.server_close()

    print(
        "PASS: real service-worker install, staged release integrity, "
        "no-backup update, Backup & Update download, startup confirmation, "
        "complete cache and active-fast preservation, rejected HTTP/corrupt updates, "
        "staging cleanup and offline last-known-good recovery"
    )


if __name__ == "__main__":
    main()
