#!/usr/bin/env python3
"""Large-history browser smoke/performance regression for Fasting Tracker.

The thresholds are intentionally generous. This catches accidental whole-app
rerenders or multi-second UI stalls rather than benchmarking hardware.
"""
from pathlib import Path
import json, re, sys, time

ROOT = Path(__file__).resolve().parents[1]
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f'SKIP: Playwright unavailable: {exc}')
    sys.exit(0)


def iso(ms):
    return time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime(ms / 1000))


def build_data():
    base = 1_767_225_600_000
    records, weights = [], []
    for i in range(2000):
        start = base - (2000 - i) * 18 * 3_600_000
        records.append({
            'id': f'r{i}', 'start': iso(start), 'end': iso(start + 10 * 3_600_000),
            'goalHours': 10, 'timeZone': 'UTC', 'createdAt': None, 'modifiedAt': None
        })
        when = base - (2000 - i) * 24 * 3_600_000
        weights.append({
            'id': f'w{i}', 'when': iso(when), 'kg': 80 - (i * 0.001),
            'timeZone': 'UTC', 'createdAt': None, 'modifiedAt': None
        })
    return {
        'dataVersion': 1, 'revision': 1, 'updatedAt': '2026-01-01T00:00:00.000Z', 'goalHours': 16,
        'activeStart': None, 'activeGoalHours': None, 'activeTimeZone': None,
        'activeCreatedAt': None, 'activeModifiedAt': None,
        'records': records, 'weights': weights, 'weightUnit': 'kg', 'targetWeightKg': 75,
        'gamificationEnabled': True, 'language': 'en', 'appearance': 'system', 'iconChoice': 'plate'
    }


def inlined_html():
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    html = re.sub(r'^---\r?\n.*?\r?\n---\r?\n', '', html, count=1, flags=re.S)
    for lang in ('en', 'bg', 'es'):
        runtime = (ROOT / 'i18n' / f'{lang}.js').read_text(encoding='utf-8')
        html = html.replace(f'<script src="i18n/{lang}.js"></script>', f'<script>{runtime}</script>')
    return html


def measure_click(page, selector, state_check):
    start = time.perf_counter()
    page.locator(selector).click()
    page.wait_for_function(state_check, timeout=5000)
    return (time.perf_counter() - start) * 1000


def measure_pointer_paint(page, selector):
    # Measures the real PointerEvent handler through the first paint after selection.
    return page.locator(selector).evaluate("""el => new Promise(resolve => {
      const start = performance.now();
      el.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles:true, cancelable:true, pointerType:'touch', pointerId:17,
        button:0, clientX:8, clientY:8
      }));
      requestAnimationFrame(() => resolve(performance.now() - start));
    })""")


with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path='/usr/bin/chromium', headless=True,
        args=['--no-sandbox', '--disable-dev-shm-usage']
    )
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    payload = json.dumps(build_data(), separators=(',', ':'))

    # Network/file navigation is blocked in this test environment. Inline the local
    # translation bundles and provide a Storage-compatible in-memory implementation.
    page.evaluate("""() => {
      const m = new Map();
      const store = {
        getItem:k => m.has(String(k)) ? m.get(String(k)) : null,
        setItem:(k,v) => m.set(String(k), String(v)),
        removeItem:k => m.delete(String(k)), clear:() => m.clear(),
        key:i => Array.from(m.keys())[i] ?? null,
        get length(){ return m.size; }
      };
      Object.defineProperty(window,'localStorage',{value:store,configurable:true});
      Object.defineProperty(window,'sessionStorage',{value:store,configurable:true});
    }""")
    errors = []
    page.on('pageerror', lambda exc: errors.append(str(exc)))
    page.set_content(inlined_html(), wait_until='domcontentloaded')

    # Feed 2,000 fasts + 2,000 weights through the same storage synchronization path
    # used when another app/tab context updates data.
    seed_start = time.perf_counter()
    page.evaluate("""payload => {
      localStorage.setItem('fastingTracker.data', payload);
      const e = new Event('storage');
      Object.defineProperties(e, {
        storageArea:{value:localStorage}, key:{value:'fastingTracker.data'}, newValue:{value:payload}
      });
      window.dispatchEvent(e);
    }""", payload)
    seed_ms = (time.perf_counter() - seed_start) * 1000

    if errors:
        print('FAIL: browser errors: ' + ' | '.join(errors[:3]))
        sys.exit(1)
    if page.locator('#recoveryBanner').is_visible():
        print('FAIL: large valid dataset entered Recovery mode')
        sys.exit(1)

    timings = {'seed-sync': seed_ms}
    timings['weight'] = measure_click(
        page, '.tab[data-screen="weight"]',
        "document.querySelector('#weight.screen.active') !== null && document.querySelector('#wLatest').textContent !== '—'"
    )
    timings['history'] = measure_click(
        page, '.tab[data-screen="history"]',
        "document.querySelector('#history.screen.active') !== null && document.querySelectorAll('#historyList .historyRow').length > 0"
    )
    timings['stats'] = measure_click(
        page, '.tab[data-screen="stats"]',
        "document.querySelector('#stats.screen.active') !== null && document.querySelector('#mTotal').textContent.replace(/\\D/g,'') === '2000'"
    )

    # First render each visualization once. Rendering is deliberately deferred until
    # after the selection paints, so verify the control state directly rather than
    # timing chart work as part of the tap response.
    for mode in ('calendar', 'trend', 'weeks', 'timeline'):
        timings[f'viz-{mode}'] = measure_pointer_paint(page, f'#statsVizSwitcher [data-viz="{mode}"]')
        cls = page.locator(f'#statsVizSwitcher [data-viz="{mode}"]').get_attribute('class') or ''
        if 'active' not in cls.split():
            print(f'FAIL: {mode} selector did not become active synchronously')
            sys.exit(1)
        page.wait_for_timeout(600)

    # Repeat switches after all views have been rendered/cached. This catches
    # regressions where the tap itself becomes delayed even with no redraw needed.
    for mode in ('calendar', 'trend', 'weeks', 'timeline'):
        timings[f'cached-{mode}'] = measure_pointer_paint(page, f'#statsVizSwitcher [data-viz="{mode}"]')
        cls = page.locator(f'#statsVizSwitcher [data-viz="{mode}"]').get_attribute('class') or ''
        if 'active' not in cls.split():
            print(f'FAIL: cached {mode} selector did not become active synchronously')
            sys.exit(1)
        page.wait_for_timeout(80)

    browser.close()

interaction_limit = 1200.0
seed_limit = 10000.0
slow = {k: v for k, v in timings.items() if k != 'seed-sync' and v > interaction_limit}
print('Performance smoke (ms): ' + ', '.join(f'{k}={v:.1f}' for k, v in timings.items()))
if timings['seed-sync'] > seed_limit:
    print(f"FAIL: 2,000+2,000 record synchronization took {timings['seed-sync']:.1f}ms")
    sys.exit(1)
if slow:
    print('FAIL: interaction exceeded generous regression limit: ' + ', '.join(f'{k}={v:.1f}ms' for k, v in slow.items()))
    sys.exit(1)
print('PASS: large-history interaction smoke test')
