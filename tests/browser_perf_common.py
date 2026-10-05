from pathlib import Path
import json, re, time

ROOT = Path(__file__).resolve().parents[1]


def iso(ms):
    return time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime(ms / 1000))


def build_data(count, base=1_767_225_600_000):
    records, weights = [], []
    # One completed 16h fast and one weigh-in per day, oldest -> newest.
    for i in range(count):
        day = base - (count - i) * 24 * 3_600_000
        start = day + 18 * 3_600_000
        records.append({
            'id': f'r{i}', 'start': iso(start), 'end': iso(start + 16 * 3_600_000),
            'goalHours': 16, 'timeZone': 'UTC', 'createdAt': None, 'modifiedAt': None
        })
        weights.append({
            'id': f'w{i}', 'when': iso(day + 8 * 3_600_000), 'kg': 80 - min(10, i * 0.0002),
            'timeZone': 'UTC', 'createdAt': None, 'modifiedAt': None
        })
    return {
        'dataVersion': 1, 'revision': 1, 'updatedAt': '2026-01-01T00:00:00.000Z', 'goalHours': 16,
        'activeStart': None, 'activeGoalHours': None, 'activeTimeZone': None,
        'activeCreatedAt': None, 'activeModifiedAt': None,
        'records': records, 'deletedFasts': [], 'weights': weights, 'deletedWeights': [], 'weightUnit': 'kg', 'targetWeightKg': 75,
        'gamificationEnabled': True, 'language': 'en', 'appearance': 'system', 'iconChoice': 'plate'
    }


def inlined_html():
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    html = re.sub(r'^---\r?\n.*?\r?\n---\r?\n', '', html, count=1, flags=re.S)
    for lang in ('en', 'bg', 'es'):
        runtime = (ROOT / 'i18n' / f'{lang}.js').read_text(encoding='utf-8')
        html = html.replace(f'<script src="i18n/{lang}.js"></script>', f'<script>{runtime}</script>')
    for rel in ('js/release-health.js','js/fasting-visuals.js','js/platform-diagnostics.js'):
        runtime = (ROOT / rel).read_text(encoding='utf-8')
        html = html.replace(f'<script src="{rel}"></script>', f'<script>{runtime}</script>')
    return html


STORAGE_SHIM = r"""() => {
  const localMap = new Map();
  const sessionMap = new Map();
  const mkStorage = m => ({
    getItem:k => m.has(String(k)) ? m.get(String(k)) : null,
    setItem:(k,v) => m.set(String(k), String(v)),
    removeItem:k => m.delete(String(k)), clear:() => m.clear(),
    key:i => Array.from(m.keys())[i] ?? null,
    get length(){ return m.size; }
  });
  Object.defineProperty(window,'localStorage',{value:mkStorage(localMap),configurable:true});
  Object.defineProperty(window,'sessionStorage',{value:mkStorage(sessionMap),configurable:true});

  const databases = new Map();
  const request = fn => {
    const r={onsuccess:null,onerror:null,result:undefined,error:null};
    setTimeout(()=>{ try { r.result=fn(); r.onsuccess && r.onsuccess({target:r}); }
      catch(e){ r.error=e; r.onerror && r.onerror({target:r}); } },0);
    return r;
  };
  const makeDb = () => {
    const db={stores:new Map(),version:0};
    db.objectStoreNames={contains:n=>db.stores.has(n)};
    db.createObjectStore=(name,opts={})=>{ db.stores.set(name,{map:new Map(),keyPath:opts.keyPath||null}); return {}; };
    db.transaction=(names,mode)=>{
      const tx={oncomplete:null,onerror:null,onabort:null,error:null};
      const finish=()=>setTimeout(()=>tx.oncomplete && tx.oncomplete(),0);
      tx.objectStore=name=>{
        const st=db.stores.get(name); if(!st) throw new Error('missing store '+name);
        return {
          get:key=>request(()=>st.map.get(key)),
          getAll:()=>request(()=>Array.from(st.map.values())),
          put:value=>{ const key=st.keyPath ? value[st.keyPath] : value.key; st.map.set(key,value); finish(); return request(()=>key); },
          delete:key=>{ st.map.delete(key); finish(); return request(()=>undefined); },
          clear:()=>{ st.map.clear(); finish(); return request(()=>undefined); }
        };
      };
      return tx;
    };
    return db;
  };
  Object.defineProperty(window,'indexedDB',{value:{
    open(name,version){
      const r={onsuccess:null,onerror:null,onupgradeneeded:null,onblocked:null,result:null,error:null};
      setTimeout(()=>{
        try {
          let db=databases.get(name); const fresh=!db;
          if(!db){ db=makeDb(); databases.set(name,db); }
          r.result=db;
          const needsUpgrade=fresh || Number(version||1)>Number(db.version||0);
          if(needsUpgrade && r.onupgradeneeded) r.onupgradeneeded({target:r,oldVersion:db.version||0,newVersion:Number(version||1)});
          if(needsUpgrade) db.version=Number(version||1);
          if(r.onsuccess) r.onsuccess({target:r});
        } catch(e){ r.error=e; if(r.onerror) r.onerror({target:r}); }
      },0);
      return r;
    }
  },configurable:true});
  window.__seedFastingDb=(data,dailyEntries)=>{
    const db=makeDb();
    db.createObjectStore('state',{keyPath:'key'});
    db.createObjectStore('snapshotMeta',{keyPath:'id'});
    db.createObjectStore('snapshotPayload',{keyPath:'id'});
    db.version=1;
    db.stores.get('state').map.set('primary',{key:'primary',data:data});
    db.stores.get('state').map.set('dailyTotals',{key:'dailyTotals',revision:data.revision,entries:dailyEntries});
    databases.set('FastingTrackerDB',db);
  };
  window.__seedFastingDbV2=(data,dailyEntries)=>{
    const db=makeDb();
    for(const [name,keyPath] of [['state','key'],['snapshotMeta','id'],['snapshotPayload','id'],['records','id'],['deletedFasts','id'],['weights','id'],['deletedWeights','id']]) db.createObjectStore(name,{keyPath});
    db.version=2;
    const settings={...data}; delete settings.records; delete settings.deletedFasts; delete settings.weights; delete settings.deletedWeights;
    db.stores.get('state').map.set('settings',{key:'settings',data:settings});
    db.stores.get('state').map.set('dailyTotals',{key:'dailyTotals',revision:data.revision,entries:dailyEntries});
    db.stores.get('state').map.set('persistenceMeta',{key:'persistenceMeta',lastSuccessfulSaveAt:new Date().toISOString(),revision:data.revision});
    for(const r of (data.records||[])) db.stores.get('records').map.set(r.id,r);
    for(const r of (data.deletedFasts||[])) db.stores.get('deletedFasts').map.set(r.id,r);
    for(const w of (data.weights||[])) db.stores.get('weights').map.set(w.id,w);
    for(const w of (data.deletedWeights||[])) db.stores.get('deletedWeights').map.set(w.id,w);
    databases.set('FastingTrackerDB',db);
  };
}"""


def prepare_page(page, payload):
    page.evaluate(STORAGE_SHIM)
    page.evaluate("payload => localStorage.setItem('fastingTracker.data', payload)", payload)
    page.set_content(inlined_html(), wait_until='domcontentloaded')


def measure_click(page, selector, state_check, timeout=10000):
    start = time.perf_counter()
    page.locator(selector).click()
    page.wait_for_function(state_check, timeout=timeout)
    return (time.perf_counter() - start) * 1000


def measure_pointer_paint(page, selector):
    return page.locator(selector).evaluate("""el => new Promise(resolve => {
      const start = performance.now();
      el.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles:true, cancelable:true, pointerType:'touch', pointerId:17,
        button:0, clientX:8, clientY:8
      }));
      requestAnimationFrame(() => resolve(performance.now() - start));
    })""")
