'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const docs = ['about.html','privacy.html','branding.html','license.html'];
const index = fs.readFileSync('index.html','utf8');
const jsBlocks = html => [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
function checkSyntax(path) {
  const text=fs.readFileSync(path,'utf8');
  if(path.endsWith('.html')){
    for(const m of jsBlocks(text)){
      if(/application\/ld\+json/.test(m[1])) JSON.parse(m[2]);
      else if(!/\bsrc=/.test(m[1])) new vm.Script(m[2],{filename:path});
    }
  } else if(path.endsWith('.json')) JSON.parse(text);
  else new vm.Script(text,{filename:path});
}
for(const p of ['index.html',...docs,'version.json','i18n/en.js','i18n/bg.js','i18n/es.js'])checkSyntax(p);
assert.match(index,/window\.addEventListener\('pageshow'/);
assert.match(index,/if \(!event\.persisted \|\| !uiReady\) return;/);
assert.match(index,/persistedRecordMap\.size > 0 && snapshotData\.records\.length === 0/);
assert.match(index,/persistedWeightMap\.size > 0 && snapshotData\.weights\.length === 0/);
assert.match(index,/snapshotData\.deletedFasts\.length <= persistedDeletedFastMap\.size/);
assert.match(index,/snapshotData\.deletedWeights\.length <= persistedDeletedWeightMap\.size/);
assert.match(index,/readableBackupView/);
assert.match(index,/v\$\{APP_VERSION\}/);
assert.match(index,/const APP_VERSION\s*=\s*['"]1\.12\.3['"]/);
assert.equal(JSON.parse(fs.readFileSync('version.json','utf8')).version,'1.12.3');
for(const p of docs){
  const html=fs.readFileSync(p,'utf8');
  assert.match(html,/history\.back\(\)/);
  assert.match(html,/const fromApp=!!exactReturn;/);
  // Execute the actual return script with a fake iOS standalone navigation
  // context. The no-referrer policy means document.referrer is intentionally empty.
  const script=jsBlocks(html).at(-1)[2];
  const url='https://example.org/fasting-tracker/'+p;
  const appUrl='https://example.org/fasting-tracker/#settings';
  const back={href:'./',handlers:[],addEventListener(_,f){this.handlers.push(f);},getAttribute(){return './'}};
  const fakeDoc={href:'privacy.html',getAttribute(){return 'privacy.html'}};
  const store=new Map([['fastingTracker.documentReturnUrl',appUrl]]);
  const sessionStorage={getItem:k=>store.get(k)||null,removeItem:k=>store.delete(k)};
  let backCalls=0,prevented=false;
  const history={length:3,back(){backCalls++}};
  const document={referrer:'',getElementById:id=>id==='backAppLink'?back:null,querySelectorAll:()=>[fakeDoc]};
  vm.runInNewContext(script,{document,location:new URL(url),URL,URLSearchParams,sessionStorage,history},{filename:p});
  assert.equal(back.href,appUrl,p+' must retain exact app return');
  back.handlers[0]({preventDefault(){prevented=true}});
  assert.equal(backCalls,1,p+' must restore existing app history');
  assert.equal(prevented,true,p+' must prevent a fresh app reload');
  assert.equal(store.has('fastingTracker.documentReturnUrl'),false);
}
console.log('PASS: syntax, release metadata, backup safeguards and four document-return simulations');
