#!/usr/bin/env python3
"""v1.12.1 regression: fasting-statistics axes stay readable on narrow phone widths."""
import json, subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_perf_common import build_data, inlined_html, STORAGE_SHIM

ROOT = Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT / 'version.json').read_text())['version']


def main():
    visuals = (ROOT / 'js/fasting-visuals.js').read_text(encoding='utf-8')
    js = "global.window=global;\n" + visuals + r'''
const items=Array.from({length:8},(_,i)=>({label:`${String(i*3).padStart(2,'0')}:00–${String((i*3+3)%24).padStart(2,'0')}:00`,shortLabel:`${String(i*3).padStart(2,'0')}:00`}));
const positions=items.map((_,i)=>18+i*35);
const out=FTVisuals.axisLabelPlan(items,{positions,measureText:s=>String(s).length*5,maxLabels:12,minGap:7});
if(out.length!==8) throw new Error('expected all eight compact time ticks');
if(out.some(x=>x.text.includes('–'))) throw new Error('narrow axis should use short time labels');
for(let i=1;i<out.length;i++){
  const a=out[i-1],b=out[i],ar=a.x+a.text.length*2.5,bl=b.x-b.text.length*2.5;
  if(bl<ar+7) throw new Error('axis labels overlap');
}
console.log('axis planner ok');
'''
    cp = subprocess.run(['node', '-e', js], capture_output=True, text=True)
    assert cp.returncode == 0, cp.stderr

    data = build_data(30)
    data['weights'] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'])
        for width in (320, 375, 390, 430):
            page = browser.new_page(viewport={'width': width, 'height': 844})
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.evaluate(STORAGE_SHIM)
            page.evaluate("d=>{__seedFastingDbV2(d.payload,[]);localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:d.version}));}", {'payload': data, 'version': VERSION})
            page.set_content(inlined_html(), wait_until='domcontentloaded')
            page.wait_for_function("v=>document.querySelector('#appVersionLabel')?.textContent==='v'+v", arg=VERSION, timeout=20000)
            page.evaluate(r'''() => {
              window.__axisTexts=[];
              const orig=CanvasRenderingContext2D.prototype.fillText;
              CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...rest){
                if(this.canvas && this.canvas.id==='fastStartPatternChart' && y>190){
                  window.__axisTexts.push({text:String(text),x:Number(x),y:Number(y),width:this.measureText(String(text)).width});
                }
                return orig.call(this,text,x,y,...rest);
              };
            }''')
            page.locator('.tab[data-screen="stats"]').click()
            page.wait_for_timeout(80)
            page.locator('#statsVizSelect').select_option('startpattern')
            page.wait_for_timeout(150)
            labels = page.evaluate("window.__axisTexts.slice(-12)")
            assert len(labels) >= 4, (width, labels)
            labels = sorted(labels, key=lambda x: x['x'])
            for a, b in zip(labels, labels[1:]):
                assert a['x'] + a['width'] / 2 + 5 <= b['x'] - b['width'] / 2, (width, a, b)
            assert not errors, (width, errors[:3])
            page.close()
        browser.close()
    print('PASS: v1.12.1 adaptive fasting-statistics axis labels do not overlap on narrow phone widths')


if __name__ == '__main__':
    main()
