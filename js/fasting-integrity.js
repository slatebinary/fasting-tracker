(function(global){
  'use strict';

  function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    const keys = Object.keys(value).sort();
    return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }

  function fnv1a64Hex(text) {
    let hash = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n;
    const bytes = new TextEncoder().encode(text);
    for (const byte of bytes) {
      hash ^= BigInt(byte);
      hash = BigInt.asUintN(64, hash * prime);
    }
    return hash.toString(16).padStart(16, '0');
  }

  async function checksumText(text, preferred = 'SHA-256') {
    const subtle = global.crypto?.subtle;
    if (preferred === 'SHA-256' && subtle && typeof subtle.digest === 'function') {
      const digest = await subtle.digest.call(subtle, 'SHA-256', new TextEncoder().encode(text));
      return {
        algorithm: 'SHA-256',
        digest: [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
      };
    }
    return {algorithm: 'FNV-1a-64', digest: fnv1a64Hex(text)};
  }

  global.FTIntegrity = Object.freeze({stableStringify, fnv1a64Hex, checksumText});
})(window);
