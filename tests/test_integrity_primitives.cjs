'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/fasting-integrity.js', 'utf8');
function loadIntegrity(crypto) {
  const window = crypto ? {crypto} : {};
  const context = {window, TextEncoder, Uint8Array, BigInt};
  vm.runInNewContext(source, context, {filename:'fasting-integrity.js'});
  return window.FTIntegrity;
}

(async () => {
  const fallback = loadIntegrity();
  assert.equal(fallback.stableStringify({b:2,a:1}), '{"a":1,"b":2}');
  assert.equal(fallback.stableStringify({a:[1,{z:'é',b:true}],b:null}), '{"a":[1,{"b":true,"z":"é"}],"b":null}');
  assert.equal(fallback.stableStringify([3,2,1]), '[3,2,1]');
  assert.equal(fallback.fnv1a64Hex(''), 'cbf29ce484222325');
  assert.equal(fallback.fnv1a64Hex('Fasting Tracker'), fallback.fnv1a64Hex('Fasting Tracker'));
  assert.notEqual(fallback.fnv1a64Hex('red'), fallback.fnv1a64Hex('blue'));
  assert.deepEqual(await fallback.checksumText('payload'), {
    algorithm:'FNV-1a-64', digest:fallback.fnv1a64Hex('payload')
  });
  assert.deepEqual(await fallback.checksumText('payload','FNV-1a-64'), {
    algorithm:'FNV-1a-64', digest:fallback.fnv1a64Hex('payload')
  });

  let algorithm = null, bytes = null;
  const crypto = {subtle:{digest:async (name, input) => {
    algorithm=name; bytes=[...input];
    return new Uint8Array([0,1,15,255]).buffer;
  }}};
  const secure = loadIntegrity(crypto);
  const result = await secure.checksumText('abc');
  assert.equal(algorithm,'SHA-256');
  assert.deepEqual(bytes,[97,98,99]);
  assert.deepEqual(result,{algorithm:'SHA-256',digest:'00010fff'});

  console.log('PASS: deterministic serialization, FNV fallback and SHA-256 delegation');
})().catch(error => { console.error(error); process.exitCode=1; });
