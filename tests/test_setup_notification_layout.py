#!/usr/bin/env python3
"""v1.12.8: on narrow iPhones, the Daily/Weekly chooser stays inside onboarding."""

from browser_perf_common import STORAGE_SHIM, build_data, inlined_html
from playwright.sync_api import sync_playwright

HTML = inlined_html()
DATA = build_data(0)

with sync_playwright() as pw:
    browser = pw.chromium.launch(
        executable_path='/usr/bin/chromium', headless=True,
        args=['--no-sandbox', '--disable-dev-shm-usage']
    )
    checked = []
    for width in (320, 350, 375, 390, 414, 430, 480, 600, 601, 768):
        page = browser.new_page(viewport={'width':width, 'height':780}, is_mobile=True,
                                device_scale_factor=2, has_touch=True)
        errors = []
        page.on('pageerror', lambda err: errors.append(str(err)))
        page.evaluate(STORAGE_SHIM)
        page.evaluate('''data => {
          __seedFastingDbV2(data, []);
          localStorage.setItem('fastingTracker.appMeta', JSON.stringify({lastAppVersion:'1.12.8'}));
        }''', DATA)
        page.set_content(HTML, wait_until='domcontentloaded')
        page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent === 'v1.14.1'",timeout=15000)
        for lang in ('en','bg','es'):
            page.evaluate('''lang => {
              const select=document.querySelector('#languageSelect');
              select.value=lang;select.dispatchEvent(new Event('change',{bubbles:true}));
            }''',lang)
            page.wait_for_function('(lang) => document.documentElement.lang === lang',arg=lang)
            # Locale changes can rerender onboarding and restore another step.
            # Reveal step 5 again before measuring its real layout.
            page.evaluate('''() => {
              document.querySelector('#setupModal').hidden = false;
              document.querySelectorAll('#setupModal [data-setup-step]').forEach(step => {
                step.hidden = step.dataset.setupStep !== '5';
              });
            }''')
            rects = page.evaluate('''() => {
              const box = id => {
                let e=document.getElementById(id);
                let r=e.getBoundingClientRect();
                return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,
                        height:r.height,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth};
              };
              return {modal:box('setupModal'),row:box('setupNotificationWeighCadenceButtons'),
                      daily:box('setupNotificationWeighDailyBtn'),
                      weekly:box('setupNotificationWeighWeeklyBtn')};
            }''')
            group, daily, weekly, modal = (rects[k] for k in ('row','daily','weekly','modal'))
            assert group['left'] <= daily['left']+1 and group['left'] <= weekly['left']+1, (width,lang,rects)
            assert daily['right'] <= group['right']+1 and weekly['right'] <= group['right']+1, (width,lang,rects)
            assert group['left'] >= modal['left']+14 and group['right'] <= modal['right']-14, (width,lang,rects)
            assert group['scrollWidth'] <= group['clientWidth']+1, (width,lang,rects)
            assert weekly['height'] >= 43 and daily['height'] >= 43, (width,lang,rects)
            assert page.locator('#setupNotificationWeighCadenceButtons').get_attribute('role') == 'group'
            # Verify both buttons still interact and expose selection to VoiceOver.
            page.locator('#setupNotificationWeighDailyBtn').click()
            assert page.locator('#setupNotificationWeighCadence').input_value() == 'daily'
            assert page.locator('#setupNotificationWeighDailyBtn').get_attribute('aria-pressed') == 'true'
            page.locator('#setupNotificationWeighWeeklyBtn').click()
            assert page.locator('#setupNotificationWeighCadence').input_value() == 'weekly'
            assert page.locator('#setupNotificationWeighWeeklyBtn').get_attribute('aria-pressed') == 'true'
            checked.append((width,lang))
        assert not errors, (width,errors[:5])
        page.close()
    browser.close()
print('PASS: onboarding weigh-in cadence fits 320–768px across EN/BG/ES; buttons remain tappable and accessible:',len(checked),'cases')
