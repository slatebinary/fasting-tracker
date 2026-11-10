// App-version transition, migration outcome, and deployment history state.
  function readAppMeta() {
    try { return JSON.parse(localStorage.getItem(APP_META_KEY) || '{}') || {}; } catch { return {}; }
  }

  function writeAppMeta(meta) { try { localStorage.setItem(APP_META_KEY, JSON.stringify(meta || {})); } catch {} }

  function appendDeploymentHistory(type, detail = {}) {
    const meta=readAppMeta(), history=Array.isArray(meta.deploymentHistory)?meta.deploymentHistory:[],event={type:String(type||'event').slice(0,40),version:String(detail.version||APP_VERSION).slice(0,30),at:new Date().toISOString(),detail:String(detail.detail||'').slice(0,100)},last=history.at(-1),lastAt=validDate(last?.at)?.getTime()||0;
    if(last&&last.type===event.type&&last.version===event.version&&last.detail===event.detail&&Date.now()-lastAt<5*60*1000)return;
    history.push(event);meta.deploymentHistory=history.slice(-8); writeAppMeta(meta);
  }
  function markLastKnownGood(reason='startup') {
    const meta=readAppMeta(); meta.lastKnownGood={version:APP_VERSION,at:new Date().toISOString(),revision:Number(data?.revision)||0,reason:String(reason||'startup').slice(0,40)}; writeAppMeta(meta);
  }
  function lastKnownGoodMeta(){return readAppMeta().lastKnownGood||null;}
  function deploymentHistoryMeta(){const h=readAppMeta().deploymentHistory;return Array.isArray(h)?h.slice(-8):[];}

  function beginPendingMigration(fromVersion, toVersion, snapshotId) {
    const meta = readAppMeta();
    meta.pendingMigration = {from:String(fromVersion||'unknown'),to:String(toVersion||'unknown'),snapshotId:snapshotId||null,startedAt:new Date().toISOString()};
    writeAppMeta(meta);
  }

  function finalizePendingMigrationSuccess() {
    const meta = readAppMeta(), pending = meta.pendingMigration;
    if (pending && pending.to === APP_VERSION) {
      meta.lastMigration = {...pending,status:'success',completedAt:new Date().toISOString()};
      const history=Array.isArray(meta.deploymentHistory)?meta.deploymentHistory:[]; history.push({type:'installed',version:APP_VERSION,at:new Date().toISOString(),detail:`${pending.from} → ${pending.to}`}); meta.deploymentHistory=history.slice(-8);
      delete meta.pendingMigration;
      writeAppMeta(meta);
    }
  }

  function safeUpdateErrorMessage(error) {
    const message=String(error?.message||error||'unknown update error')
      .replace(/https?:\/\/[^\s"'<>]+/gi,'[url]')
      .replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim().slice(0,180);
    return message||'unknown update error';
  }

  function failPendingMigration(toVersion, reason='update-failed', error=null) {
    const meta=readAppMeta(),pending=meta.pendingMigration;
    if(pending&&pending.to===String(toVersion)){
      meta.lastMigration={...pending,status:'failed',reason:String(reason||'update-failed').slice(0,60),error:error?safeUpdateErrorMessage(error):null,completedAt:new Date().toISOString()};
      delete meta.pendingMigration;writeAppMeta(meta);
    }
  }

  function migrationStatusMeta() { const meta=readAppMeta(); return {pending:meta.pendingMigration||null,last:meta.lastMigration||null}; }

  function rememberCurrentAppVersion() {
    const meta = readAppMeta(); meta.lastAppVersion = APP_VERSION; meta.seenAt = new Date().toISOString(); writeAppMeta(meta);
  }
