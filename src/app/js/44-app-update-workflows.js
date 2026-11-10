  function openUpdateModal() {
    if (!updateAvailable) { checkForUpdates(); return; }
    el('updateModalText').textContent = t('update.modalText', {version:latestVersion});
    showModal('updateModal', 'updateCancelBtn');
  }

  function closeUpdateModal() { hideModal('updateModal'); }

  function compareVersions(a, b) {
    const pa = String(a).split('.').map(x => Number.parseInt(x, 10) || 0);
    const pb = String(b).split('.').map(x => Number.parseInt(x, 10) || 0);
    const n = Math.max(pa.length, pb.length);
    for (let i = 0; i < n; i++) {
      const av = pa[i] || 0, bv = pb[i] || 0;
      if (av > bv) return 1;
      if (av < bv) return -1;
    }
    return 0;
  }

  function setUpdateUI(state, message = '') {
    const status = el('updateStatus');
    const btn = el('updateBtn');
    const banner = el('updateBanner');
    const bannerText = el('updateBannerText');
    status.classList.remove('good', 'warn');

    if (state === 'checking') {
      status.textContent = t('update.checking'); btn.textContent = t('update.checkingBtn'); btn.disabled = true; banner.hidden = true;
    } else if (state === 'available') {
      updateAvailable = true; status.textContent = t('update.available', {version:latestVersion}); status.classList.add('warn');
      btn.textContent = t('update.updateNow'); btn.disabled = false; bannerText.textContent = t('update.ready', {version:latestVersion}); banner.hidden = false;
    } else if (state === 'updating') {
      status.textContent = t('update.installing'); status.classList.add('warn'); btn.textContent = t('update.updating'); btn.disabled = true;
      bannerText.textContent = t('update.installingShort'); banner.hidden = false;
    } else if (state === 'deploymentMismatch') {
      updateAvailable = false; status.textContent = message || t('update.deploymentIncomplete'); status.classList.add('warn'); btn.textContent = t('update.check'); btn.disabled = false; banner.hidden = true;
    } else if (state === 'offline') {
      updateAvailable = false; status.textContent = message || t('update.offline'); btn.textContent = t('update.check'); btn.disabled = false; banner.hidden = true;
    } else {
      updateAvailable = false; status.textContent = t('update.current', {version:APP_VERSION}); status.classList.add('good'); btn.textContent = t('update.check'); btn.disabled = false; banner.hidden = true;
    }
  }


  function saveUpdateStatusMeta(){try{localStorage.setItem(UPDATE_STATUS_META_KEY,JSON.stringify({metadataVersion:liveMetadataVersion,entryVersion:liveEntryVersion,state:deploymentConsistencyState,checkedAt:lastUpdateCheckAt}));}catch{}}
  function loadUpdateStatusMeta(){try{const x=JSON.parse(localStorage.getItem(UPDATE_STATUS_META_KEY)||'null');if(x){liveMetadataVersion=x.metadataVersion||null;liveEntryVersion=x.entryVersion||null;deploymentConsistencyState=x.state||'unknown';lastUpdateCheckAt=x.checkedAt||null;}}catch{}}
  async function fetchLiveReleaseStatus(signal){
    const response=await fetch(`./version.json?t=${Date.now()}`,{cache:'no-store',signal});if(!response.ok)throw new Error('version check failed');
    const info=FTReleaseHealth.validateMetadata(await response.json(),UPDATE_PROTOCOL_VERSION);const entryVersion=await FTReleaseHealth.fetchLiveEntryVersion(info.entry,7000);const consistency=FTReleaseHealth.consistency(info.version,entryVersion);
    liveMetadataVersion=info.version;liveEntryVersion=entryVersion;deploymentConsistencyState=consistency.ok?'ok':'mismatch';lastUpdateCheckAt=new Date().toISOString();saveUpdateStatusMeta();return {info,metadataVersion:info.version,entryVersion,consistency};
  }
  async function checkForUpdates({ quiet = false } = {}) {
    if (!quiet) setUpdateUI('checking');
    if (navigator.onLine === false) {
      setUpdateUI('offline', t('update.offlineExplicit'));
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    try {
      const live = await fetchLiveReleaseStatus(controller.signal), remote=live.metadataVersion;
      latestVersion = remote;
      if (!live.consistency.ok) { setUpdateUI('deploymentMismatch', t('update.deploymentMismatch',{metadata:live.metadataVersion||'—',entry:live.entryVersion||'—'})); noteDiagnosticError('update.deployment-mismatch');appendDeploymentHistory('mismatch',{version:live.metadataVersion,detail:`entry ${live.entryVersion}`}); }
      else if (compareVersions(remote, APP_VERSION) > 0) {setUpdateUI('available');appendDeploymentHistory('available',{version:remote});}
      else {setUpdateUI('current');if(!quiet)appendDeploymentHistory('current',{version:remote});}
      renderDeploymentStatus();
    } catch (err) {
      noteDiagnosticError('update.'+FTPlatform.errorCategory(err));
      const msg = navigator.onLine === false
        ? t('update.offlineExplicit')
        : t('update.failed');
      setUpdateUI('offline', msg);if(!quiet)appendDeploymentHistory('failed',{version:APP_VERSION,detail:FTPlatform.errorCategory(err)});
    } finally {
      clearTimeout(timeout);
    }
  }

  async function getCurrentServiceWorkerController() {
    if (!('serviceWorker' in navigator)) throw new Error('service worker unavailable');
    const reg = await navigator.serviceWorker.ready;
    let candidate = null;
    let updateFound = false;
    const promote = worker => {
      if (!worker) return;
      const skip = () => {
        if (worker.state === 'installed') {
          try { worker.postMessage({type:'SKIP_WAITING'}); } catch {}
        }
      };
      skip();
      worker.addEventListener?.('statechange', skip);
    };
    const onUpdateFound = () => {
      updateFound = true;
      candidate = reg.installing || candidate;
      promote(candidate);
    };
    reg.addEventListener('updatefound', onUpdateFound);
    try { await reg.update(); } catch {}
    if (reg.installing || reg.waiting) {
      updateFound = true;
      candidate = reg.installing || reg.waiting;
      promote(candidate);
    }
    const isReady = () => {
      const controller = navigator.serviceWorker.controller;
      if (candidate) return candidate.state === 'activated' && reg.active === candidate && controller === candidate;
      return !!reg.active && controller === reg.active;
    };
    if (!updateFound && reg.active && (!navigator.serviceWorker.controller || isReady())) {
      reg.removeEventListener('updatefound', onUpdateFound);
      return reg.active;
    }
    try {
      await new Promise((resolve, reject) => {
        let settled = false;
        const finish = error => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          navigator.serviceWorker.removeEventListener('controllerchange', check);
          candidate?.removeEventListener?.('statechange', check);
          reg.removeEventListener('updatefound', onUpdateFound);
          if (error) reject(error); else resolve();
        };
        const check = () => {
          if (candidate?.state === 'redundant') {
            finish(new Error('new service worker failed to activate'));
            return;
          }
          if (isReady()) finish();
        };
        const timer = setTimeout(() => finish(new Error('service worker controller update timed out')), 20000);
        navigator.serviceWorker.addEventListener('controllerchange', check);
        candidate?.addEventListener?.('statechange', check);
        check();
      });
    } catch (error) {
      reg.removeEventListener('updatefound', onUpdateFound);
      throw error;
    }
    return navigator.serviceWorker.controller || reg.active;
  }

  async function requestShellRefresh(version) {
    const controller = await getCurrentServiceWorkerController();
    if (!controller) throw new Error('service worker not controlling this page');
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => reject(new Error('update timed out')), 35000);
      channel.port1.onmessage = event => {
        clearTimeout(timer);
        if (event.data?.ok) resolve(event.data);
        else reject(new Error(event.data?.error || 'update failed'));
      };
      controller.postMessage({ type:'REFRESH_RELEASE', version, protocolVersion: UPDATE_PROTOCOL_VERSION }, [channel.port2]);
    });
  }

  async function installUpdate() {
    if (updateInProgress) return;
    if (!(await allowStorageIntensiveOperation())) return;
    const preUpdateSnapshot = await createInternalSnapshotAsync(`before updating from v${APP_VERSION} to v${latestVersion}`);
    if (!preUpdateSnapshot) { alert(t('backup.snapshotFailed')); return; }
    beginPendingMigration(APP_VERSION, latestVersion, preUpdateSnapshot.id);
    updateInProgress = true; setUpdateUI('updating');
    try {
      if (navigator.onLine === false) throw new Error('offline');
      await requestShellRefresh(latestVersion);
      window.location.reload();
    } catch (err) {
      noteDiagnosticError('update.stage');
      failPendingMigration(latestVersion, 'update-stage-failed', err);
      updateInProgress = false; setUpdateUI('offline', t('update.failedInstall'));
    }
  }

