  function formatBytes(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n < 0) return '—';
    if (n < 1024) return `${Math.round(n)} B`;
    if (n < 1024 ** 2) return `${formatNumber(n / 1024, 1, 1)} KB`;
    if (n < 1024 ** 3) return `${formatNumber(n / (1024 ** 2), 1, 1)} MB`;
    return `${formatNumber(n / (1024 ** 3), 1, 1)} GB`;
  }

  async function queryStorageProtection(options = {}) {
    return FTPlatform.queryStorageProtection(options);
  }

  async function refreshStorageProtection({ request = false } = {}) {
    const result = await queryStorageProtection({ request });
    const status = el('storageProtectionStatus'), usage = el('storageUsageLabel'), btn = el('storageProtectBtn');
    if (status && usage && btn) {
      if (!result.supported || result.error) {
        status.textContent = t('storage.unavailable');
        usage.textContent = t('storage.usageUnknown');
        btn.hidden = true;
      } else {
        status.textContent = result.persistent ? t('storage.protected') : (request ? t('storage.requestDenied') : t('storage.bestEffort'));
        btn.hidden = !!result.persistent || !result.requestSupported;
        usage.textContent = Number.isFinite(result.used) && Number.isFinite(result.quota)
          ? t('storage.usage', {used:formatBytes(result.used), quota:formatBytes(result.quota)})
          : t('storage.usageUnknown');
      }
    }
    return result;
  }

  async function repairEmergencyBoot() {
    if (!emergencyBoot) return;
    if (recoveryMode || !versionTransitionSnapshotOK) {
      applyRecoveryMode();
      return;
    }
    setUpdateUI('updating', t('update.emergencyRecovery'));
    try {
      await requestShellRefresh(APP_VERSION);
      const u = new URL(location.href); u.searchParams.delete('ft_recovery');
      history.replaceState(null, '', u);
      emergencyBoot = false;
      location.reload();
    } catch {
      setUpdateUI('offline', t('update.failedInstall'));
    }
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(async reg => {
        const promote=worker=>{if(!worker)return;const send=()=>{if(worker.state==='installed')try{worker.postMessage({type:'SKIP_WAITING'});}catch{}};send();worker.addEventListener?.('statechange',send);};
        promote(reg.waiting);promote(reg.installing);reg.addEventListener?.('updatefound',()=>promote(reg.installing));try{await reg.update();promote(reg.waiting);promote(reg.installing);}catch{}
        if (emergencyBoot) await repairEmergencyBoot(); else checkForUpdates({ quiet: true });
      })
      .catch(() => { if (!emergencyBoot) checkForUpdates({ quiet: true }); });
  } else if (!emergencyBoot) {
    checkForUpdates({ quiet: true });
  }
})();
