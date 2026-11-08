/* IndexedDB connection and transaction primitives. No app data policy lives here. */
(function(global){
  'use strict';
  function create({IDB_NAME,IDB_VERSION,noteDiagnosticError}){
    let appDbPromise=null;
  function openAppDb() {
    if (appDbPromise) return appDbPromise;
    const pending = new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('state')) db.createObjectStore('state', {keyPath:'key'});
        if (!db.objectStoreNames.contains('snapshotMeta')) db.createObjectStore('snapshotMeta', {keyPath:'id'});
        if (!db.objectStoreNames.contains('snapshotPayload')) db.createObjectStore('snapshotPayload', {keyPath:'id'});
        if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', {keyPath:'id'});
        if (!db.objectStoreNames.contains('deletedFasts')) db.createObjectStore('deletedFasts', {keyPath:'id'});
        if (!db.objectStoreNames.contains('weights')) db.createObjectStore('weights', {keyPath:'id'});
        if (!db.objectStoreNames.contains('deletedWeights')) db.createObjectStore('deletedWeights', {keyPath:'id'});
      };
      req.onsuccess = () => {
        const db = req.result;
        const releaseConnection = () => {
          try { db.close(); } catch {}
          if (appDbPromise === pending) appDbPromise = null;
        };
        // A newer tab may request a schema upgrade. Close this connection so
        // the upgrade can proceed, then let the next operation reopen the DB.
        db.onversionchange = releaseConnection;
        if ('onclose' in db) db.onclose = () => {
          if (appDbPromise === pending) appDbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
      // A blocked request may still succeed after another tab closes its
      // connection. Keep it pending instead of caching a permanently rejected
      // promise while the original open request remains capable of succeeding.
      req.onblocked = () => noteDiagnosticError('idb_open_blocked');
    });
    appDbPromise = pending;
    pending.catch(() => {
      if (appDbPromise === pending) appDbPromise = null;
    });
    return pending;
  }

  function idbRequest(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
    });
  }

  async function idbGet(storeName, key) {
    const db = await openAppDb();
    const tx = db.transaction(storeName, 'readonly');
    return idbRequest(tx.objectStore(storeName).get(key));
  }

  async function idbGetAll(storeName) {
    const db = await openAppDb();
    const tx = db.transaction(storeName, 'readonly');
    return idbRequest(tx.objectStore(storeName).getAll());
  }

  async function idbPut(storeName, value) {
    const db = await openAppDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB write aborted'));
    });
  }

  async function idbDelete(storeName, key) {
    const db = await openAppDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('IndexedDB delete failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB delete aborted'));
    });
  }

  async function idbClear(storeName) {
    const db = await openAppDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('IndexedDB clear failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB clear aborted'));
    });
  }

  async function idbClearStoresAtomic(storeNames) {
    const db = await openAppDb();
    const names = [...new Set(storeNames)].filter(name => db.objectStoreNames.contains(name));
    if (!names.length) return true;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(names, 'readwrite');
      for (const name of names) tx.objectStore(name).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('IndexedDB atomic clear failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB atomic clear aborted'));
    });
  }


    return {openAppDb,idbRequest,idbGet,idbGetAll,idbPut,idbDelete,idbClear,idbClearStoresAtomic};
  }
  global.FTStorageDB={create};
})(window);
