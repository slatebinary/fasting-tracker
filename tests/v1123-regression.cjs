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
assert.match(index,/const APP_VERSION\s*=\s*['"]1\.13\.7['"]/);
assert.match(index,/function buildInteractiveChartDays\(dayCount = null/);
assert.match(index,/buildInteractiveChartDays\(\)/);
assert.match(index,/const maxTimelineWidth = 9000/);
assert.match(index,/dayKey\(oldestMs,tz\)/);
assert.match(index,/Fasting timeline for all recorded fastings/);
assert.equal(JSON.parse(fs.readFileSync('version.json','utf8')).version,'1.13.7');
assert.match(index,/function safeUpdateErrorMessage\(error\)/);
assert.match(index,/failPendingMigration\(latestVersion, 'update-stage-failed', err\)/);
assert.match(index,/error:migration\.last\.error\|\|null/);
assert.match(index,/function describeDailyTotalsMismatch\(recalculated,cached,tolerance=2\)/);
assert.match(index,/describeDailyTotalsMismatch\(recalculated,storedDayTotalsMap\)/);
assert.match(index,/issueDetails:lastIntegrityCheck\.issues\.map\(x=>\(\{code:x\.code,detail:x\.detail\|\|''\}\)\)/);
assert.match(index,/integrityIssueLabel\(issue\)\+\(issue\.detail\?' — '\+issue\.detail:''\)/);
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

// Legal documents must be discoverable from Settings in every supported language.
for (const [key,file] of [['public.license','license.html'],['public.branding','branding.html']]) {
  assert.match(index,new RegExp('data-i18n="'+key.replace('.','\\.')+'" href="'+file.replace('.','\\.')+'\\?return=settings"'));
  for(const lang of ['en','bg','es']) {
    const dict=JSON.parse(fs.readFileSync('i18n/'+lang+'.json','utf8'));
    assert.ok(dict[key],lang+' missing '+key);
  }
}

// v1.12.8 irreversible deletion guard: two prompts and typed acknowledgment.
assert.match(index, /confirm\(t\('history\.deletedPermanentConfirm'\)\) \|\| !confirm\(t\('history\.deletedPermanentFinalConfirm'\)\)/);
assert.match(index, /confirm\(t\('weight\.deletePermanentFinalConfirm'\)\)/);
assert.match(index, /confirm\(t\('bulk\.purgeFinalConfirm'/);
assert.match(index, /function requestDestructiveReset\(kind\)/);
assert.match(index, /destructiveResetBackupAck'\)\.checked/);
assert.match(index, /destructiveResetPhrase'\)\.value\.trim\(\) !== destructiveResetPhrase/);
assert.match(index, /role="alertdialog"[^>]*aria-modal="true"/);
for(const lang of ['en','bg','es']) {
  const dict=JSON.parse(fs.readFileSync('i18n/'+lang+'.json','utf8'));
  for(const key of ['reset.backupAcknowledgement','reset.typePhrase','reset.finalTitle','reset.recoveryTitle',
                    'bulk.purgeFinalConfirm','weight.deletePermanentFinalConfirm','history.deletedPermanentFinalConfirm']) {
    assert.ok(dict[key] && dict[key] !== key, lang+': missing '+key);
  }
}
console.log('PASS: v1.12.8 two-stage deletion and backup acknowledgment source checks');

// Accessible manual-backup status is tied to the JSON export and data-only fingerprint.
assert.match(index,/id="fastingBackupStatusBtn"[^>]*data-state="empty"/);
assert.match(index,/id="fastingBackupStatusText" aria-live="polite"/);
assert.match(index,/function backupDatasetSignature\(sourceData = data\)/);
assert.match(index,/backupMeta\.lastExternalBackupDataSignature = backupDatasetSignature\(exportedData\)/);
assert.match(index,/bindResponsiveAction\(el\('fastingBackupStatusBtn'\), \(\) => exportBackup\(\)\)/);
assert.match(index,/markExternalBackupNow\(backup\.data\)/);
assert.match(index,/renderFastingBackupIndicator\(freshness, due\)/);
for (const lang of ['en','bg','es']) {
  const dict=JSON.parse(fs.readFileSync('i18n/'+lang+'.json','utf8'));
  for(const state of ['current','stale','never','empty','aged']) {
    assert.ok(dict['backupChip.'+state]);
    assert.ok(dict['backupChip.'+state+'Help']);
  }
  assert.ok(dict['backupChip.action']);
}
console.log('PASS: manual backup color-coded status, export action and translated accessible states');

// v1.12.8: the section header is a dedicated row; backup attention appears below.
assert.match(index, /<div class="sectionHeader fastingSectionHeader"><h1[^>]*>Fasting<\/h1><button id="shareProgressBtn"/);
assert.match(index, /<div id="fastingBackupRow" class="fastingBackupRow" hidden>/);
assert.match(index, /const visible = state === 'stale' \|\| state === 'never' \|\| state === 'aged'/);
assert.match(index, /Date\.now\(\) < backupSuccessVisibleUntil/);
assert.match(index, /row\.hidden = !visible/);
assert.match(index, /banner\.hidden = !snapshotAttention/);
console.log('PASS: v1.12.8 consistent fasting header and attention-only backup action');

// v1.12.8: Daily/Weekly onboarding cadence stays within mobile modal widths.
assert.match(index, /class="row setupNotificationWeighRow"/);
assert.match(index, /\.setupNotificationWeighRow \.notificationCadenceToggle/);
assert.match(index, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
console.log('PASS: narrow-screen onboarding notification cadence layout source');
