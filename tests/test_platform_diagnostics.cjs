'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/platform-diagnostics.js', 'utf8');
function loadPlatform(storage) {
  const window = {};
  const context = { window, navigator: storage === undefined ? {} : { storage } };
  vm.runInNewContext(source, context, { filename: 'platform-diagnostics.js' });
  return window.FTPlatform;
}

(async () => {
  const unsupported = await loadPlatform(undefined).queryStorageProtection();
  assert.equal(unsupported.supported, false);
  assert.equal(unsupported.error, false);

  let persistCalls = 0;
  const supported = await loadPlatform({
    persisted: async () => false,
    persist: async () => { persistCalls++; return true; },
    estimate: async () => ({ usage: 4096, quota: 65536 })
  }).queryStorageProtection({ request: true });
  assert.equal(supported.supported, true);
  assert.equal(supported.requestSupported, true);
  assert.equal(supported.attempted, true);
  assert.equal(supported.persistent, true);
  assert.equal(supported.used, 4096);
  assert.equal(supported.quota, 65536);
  assert.equal(persistCalls, 1);

  const alreadyPersistent = await loadPlatform({
    persisted: async () => true,
    persist: async () => { throw new Error('must not request twice'); }
  }).queryStorageProtection({ request: true });
  assert.equal(alreadyPersistent.persistent, true);

  const failed = await loadPlatform({
    persisted: async () => { throw new Error('storage unavailable'); }
  }).queryStorageProtection();
  assert.equal(failed.supported, true);
  assert.equal(failed.error, true);
  assert.equal(failed.persistent, null);

  const estimateFailure = await loadPlatform({
    persisted: async () => true,
    estimate: async () => { throw new Error('estimate unavailable'); }
  }).queryStorageProtection();
  assert.equal(estimateFailure.persistent, true);
  assert.equal(estimateFailure.error, false);
  assert.equal(estimateFailure.used, null);
  assert.equal(estimateFailure.quota, null);

  console.log('PASS: platform storage-protection diagnostics capability and failure cases');
})().catch(error => { console.error(error); process.exitCode = 1; });
