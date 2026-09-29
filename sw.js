// Fasting Tracker update protocol v1.
// IMPORTANT: Keep this service worker unchanged for ordinary app/content releases.
// Ordinary releases are described by version.json and staged into a versioned cache.
// Change sw.js only when the update protocol itself must change.
const UPDATE_PROTOCOL_VERSION = 1;
const SCOPE_URL = new URL(self.registration.scope);
function stableScopeToken(value) {
  // FNV-1a style 32-bit hash keeps cache namespaces distinct even when two
  // different scope paths would collapse to the same human-readable slug.
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
const SCOPE_TOKEN = stableScopeToken(SCOPE_URL.href);
const RELEASE_PREFIX = `fasting-tracker-${SCOPE_TOKEN}-release-`;
const META_CACHE = `fasting-tracker-${SCOPE_TOKEN}-meta-v1`;
const ACTIVE_KEY = new URL('./__active_release__', self.registration.scope).href;
const APP_VERSION_META = 'name="ft-app-version" content="';
const VERSION_FETCH_TIMEOUT_MS = 10000;
const ASSET_FETCH_TIMEOUT_MS = 15000;
const INTEGRITY_ALGORITHM = 'SHA-256';
const HTML_INTEGRITY_NORMALIZATION = 'github-pages-v1';

async function fetchWithTimeout(request, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(new Request(request, {signal: controller.signal}));
  } finally {
    clearTimeout(timer);
  }
}

function canonicalUrl(path) {
  if (typeof path !== 'string' || !path || path.startsWith('//')) throw new Error('invalid shell path');
  const url = new URL(path, self.registration.scope);
  if (url.origin !== SCOPE_URL.origin || !url.href.startsWith(SCOPE_URL.href)) throw new Error('shell path outside app scope');
  url.hash = '';
  return url.href;
}

function validateVersionInfo(info) {
  if (!info || typeof info !== 'object') throw new Error('invalid version metadata');
  if (Number(info.protocolVersion) !== UPDATE_PROTOCOL_VERSION) throw new Error('unsupported update protocol');
  if (!/^\d+\.\d+\.\d+$/.test(String(info.version || ''))) throw new Error('invalid version metadata');
  if (typeof info.entry !== 'string') throw new Error('missing app entry');
  if (!Array.isArray(info.shell) || !info.shell.length || info.shell.length > 100) throw new Error('invalid shell list');
  if (info.integrityAlgorithm !== INTEGRITY_ALGORITHM || info.htmlNormalization !== HTML_INTEGRITY_NORMALIZATION) throw new Error('unsupported release integrity metadata');
  if (!info.hashes || typeof info.hashes !== 'object' || Array.isArray(info.hashes)) throw new Error('missing release hashes');
  const shell = info.shell.map(canonicalUrl);
  if (new Set(shell).size !== shell.length) throw new Error('duplicate shell path');
  const entry = canonicalUrl(info.entry);
  if (!shell.includes(entry)) throw new Error('entry missing from shell');
  const hashes = {};
  for (const [path, digest] of Object.entries(info.hashes)) {
    const canonical = canonicalUrl(path);
    if (!/^[0-9a-f]{64}$/i.test(String(digest || ''))) throw new Error('invalid release hash');
    hashes[canonical] = String(digest).toLowerCase();
  }
  if (Object.keys(hashes).length !== shell.length || shell.some(url => !hashes[url])) throw new Error('release hashes do not match shell');
  return { protocolVersion: UPDATE_PROTOCOL_VERSION, version: String(info.version), entry, shell, integrityAlgorithm:INTEGRITY_ALGORITHM, htmlNormalization:HTML_INTEGRITY_NORMALIZATION, hashes };
}

async function fetchVersionInfo() {
  const url = new URL('./version.json', self.registration.scope);
  url.searchParams.set('__ft_check', String(Date.now()));
  const response = await fetchWithTimeout(new Request(url.href, { cache:'no-store', credentials:'same-origin' }), VERSION_FETCH_TIMEOUT_MS);
  if (!response.ok) throw new Error('version metadata unavailable');
  return validateVersionInfo(await response.json());
}

async function activeRelease() {
  const meta = await caches.open(META_CACHE);
  const response = await meta.match(ACTIVE_KEY);
  if (!response) return null;
  try { return validateVersionInfo(await response.json()); }
  catch { return null; }
}

async function setActiveRelease(info) {
  const meta = await caches.open(META_CACHE);
  await meta.put(ACTIVE_KEY, new Response(JSON.stringify(info), {headers:{'content-type':'application/json'}}));
  const verify = await meta.match(ACTIVE_KEY);
  if (!verify) throw new Error('failed to save active release');
  const stored = validateVersionInfo(await verify.json());
  if (stored.version !== info.version) throw new Error('active release verification failed');
}

function releaseCacheName(version) { return `${RELEASE_PREFIX}${version}`; }

function hexFromBuffer(buffer) {
  return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function normalizeHtmlForIntegrity(text) {
  const siteBase = SCOPE_URL.href.replace(/\/$/, '');
  return String(text)
    .replace(/\r\n?/g, '\n')
    .split(siteBase).join('__SITE_URL__')
    .replace(/https:\/\/github\.com\/[^\/"'<>\s]+\/[^\/"'<>\s]+/g, '__REPO_URL__');
}

async function responseDigestHex(canonical, response) {
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  let bytes;
  if (type.includes('text/html') || new URL(canonical).pathname.endsWith('/') || new URL(canonical).pathname.endsWith('.html')) {
    bytes = new TextEncoder().encode(normalizeHtmlForIntegrity(await response.clone().text()));
  } else {
    bytes = new Uint8Array(await response.clone().arrayBuffer());
  }
  return hexFromBuffer(await crypto.subtle.digest(INTEGRITY_ALGORITHM, bytes));
}

async function fetchReleaseAsset(canonical, version, expectedHash) {
  const url = new URL(canonical);
  url.searchParams.set('__ft_release', version);
  const response = await fetchWithTimeout(new Request(url.href, { cache:'no-store', credentials:'same-origin' }), ASSET_FETCH_TIMEOUT_MS);
  if (!response.ok) throw new Error(`failed to cache ${url.pathname}`);
  const actualHash = await responseDigestHex(canonical, response);
  if (actualHash !== expectedHash) throw new Error(`integrity check failed for ${url.pathname}`);
  return response;
}

async function stageRelease(info) {
  const cacheName = releaseCacheName(info.version);
  await caches.delete(cacheName);
  try {
    const fetched = await Promise.all(info.shell.map(async canonical => [canonical, await fetchReleaseAsset(canonical, info.version, info.hashes[canonical])]));
    const entryPair = fetched.find(([canonical]) => canonical === info.entry);
    if (!entryPair) throw new Error('entry response missing');
    const entryText = await entryPair[1].clone().text();
    if (!entryText.includes(`${APP_VERSION_META}${info.version}"`)) throw new Error('entry version does not match version.json');

    const cache = await caches.open(cacheName);
    for (const [canonical, response] of fetched) await cache.put(canonical, response);
    const verifyEntry = await cache.match(info.entry);
    if (!verifyEntry) throw new Error('staged release verification failed');
    return cacheName;
  } catch (err) {
    await caches.delete(cacheName);
    throw err;
  }
}

async function cleanupOldReleases(activeVersion) {
  const activeName = releaseCacheName(activeVersion);
  const keys = await caches.keys();
  await Promise.all(keys.filter(k => k.startsWith(RELEASE_PREFIX) && k !== activeName).map(k => caches.delete(k)));
}

async function activateRelease(info) {
  await stageRelease(info);
  await setActiveRelease(info);
  await cleanupOldReleases(info.version);
}

async function ensureInitialRelease() {
  const active = await activeRelease();
  if (active) {
    const cache = await caches.open(releaseCacheName(active.version));
    if (await cache.match(active.entry)) return;
    // Cache metadata exists but its release cache is incomplete. Rebuild only if
    // version.json still describes exactly the same release; never jump versions here.
    const remote = await fetchVersionInfo();
    if (remote.version !== active.version) throw new Error('active release cache incomplete');
    await activateRelease(remote);
    return;
  }
  await activateRelease(await fetchVersionInfo());
}

self.addEventListener('install', event => { event.waitUntil(ensureInitialRelease()); });
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });

self.addEventListener('message', event => {
  if (!event.data || event.data.type !== 'REFRESH_RELEASE') return;
  const port = event.ports && event.ports[0];
  event.waitUntil((async () => {
    try {
      if (Number(event.data.protocolVersion) !== UPDATE_PROTOCOL_VERSION) throw new Error('unsupported update protocol');
      const info = await fetchVersionInfo();
      if (info.version !== String(event.data.version)) throw new Error('release changed during update');
      await activateRelease(info);
      port?.postMessage({ok:true, version:info.version, protocolVersion:UPDATE_PROTOCOL_VERSION});
    } catch (err) {
      port?.postMessage({ok:false, error:String(err && err.message || err)});
    }
  })());
});

function requestWithoutSearch(request) {
  const url = new URL(request.url);
  url.search = '';
  url.hash = '';
  return url.href;
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== SCOPE_URL.origin || !url.href.startsWith(SCOPE_URL.href)) return;

  if (url.pathname.endsWith('/version.json')) {
    event.respondWith(fetch(new Request(event.request, {cache:'no-store'})));
    return;
  }

  event.respondWith((async () => {
    const active = await activeRelease();
    if (!active) {
      try { return await fetch(event.request); } catch { return Response.error(); }
    }

    const cache = await caches.open(releaseCacheName(active.version));
    const cached = await cache.match(event.request, {ignoreSearch:true});
    if (cached) return cached;

    const canonical = requestWithoutSearch(event.request);
    const managed = active.shell.includes(canonical);
    if (managed) {
      // Self-heal a damaged cache only when the server still advertises the SAME
      // active release. Never jump to a newer release outside the in-app update flow.
      try {
        const remote = await fetchVersionInfo();
        if (remote.version === active.version) {
          await activateRelease(remote);
          const repaired = await caches.open(releaseCacheName(active.version));
          const repairedResponse = await repaired.match(event.request, {ignoreSearch:true});
          if (repairedResponse) return repairedResponse;
        }
        // If the active cache is damaged after a newer release was published,
        // do not strand the user on a 503. For navigations, enter a controlled
        // emergency boot. The new page first protects local data with the normal
        // version-transition snapshot, then asks this worker to stage/activate
        // that exact release before reloading normally.
        if (event.request.mode === 'navigate' && remote.version !== active.version) {
          const requestURL = new URL(event.request.url);
          if (requestURL.searchParams.get('ft_recovery') === '1') {
            const emergencyURL = new URL(remote.entry);
            emergencyURL.searchParams.set('__ft_emergency', remote.version);
            const response = await fetchReleaseAsset(remote.entry, remote.version, remote.hashes[remote.entry]);
            if (response.ok) return response;
          } else {
            const recoveryURL = new URL('./', self.registration.scope);
            recoveryURL.searchParams.set('ft_recovery', '1');
            return Response.redirect(recoveryURL.href, 302);
          }
        }
      } catch {}
      return new Response('Fasting Tracker cached release is incomplete. Reconnect to the internet and reopen the app.', {
        status: 503, headers: {'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}
      });
    }

    try { return await fetch(event.request); }
    catch {
      if (event.request.mode === 'navigate') {
        return (await cache.match(new URL('./404.html', self.registration.scope).href)) || Response.error();
      }
      return Response.error();
    }
  })());
});
