// Fasting Tracker update protocol v1.
// The release/cache protocol below remains stable across ordinary content releases.
// Non-protocol service-worker features (for example notification-click routing) may
// be extended without changing UPDATE_PROTOCOL_VERSION.
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
const PREVIOUS_KEY = new URL('./__previous_release__', self.registration.scope).href;
const ROLLBACK_GRACE_MS = 300000;
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

async function readReleaseState(key) {
  const meta = await caches.open(META_CACHE);
  const response = await meta.match(key);
  if (!response) return null;
  try {
    const stored = await response.json();
    const info = validateVersionInfo(stored.info || stored);
    return {
      info,
      cacheName: typeof stored.cacheName === 'string' ? stored.cacheName : releaseCacheName(info.version),
      firstBootAt: typeof stored.firstBootAt === 'number' && Number.isFinite(stored.firstBootAt) ? stored.firstBootAt : null
    };
  } catch { return null; }
}

async function activeRelease() {
  const state = await readReleaseState(ACTIVE_KEY);
  return state ? {...state.info, cacheName:state.cacheName} : null;
}

async function writeActiveRelease(info, cacheName) {
  const meta = await caches.open(META_CACHE);
  await meta.put(ACTIVE_KEY, new Response(JSON.stringify({info, cacheName}), {headers:{'content-type':'application/json'}}));
  const verify = await readReleaseState(ACTIVE_KEY);
  if (!verify || verify.info.version !== info.version || verify.cacheName !== cacheName) throw new Error('active release verification failed');
}

async function releaseCacheComplete(info, cacheName) {
  try {
    const cache = await caches.open(cacheName || releaseCacheName(info.version));
    for (const canonical of info.shell) if (!(await cache.match(canonical))) return false;
    return true;
  } catch { return false; }
}

async function setActiveRelease(info, cacheName) {
  const current = await readReleaseState(ACTIVE_KEY);
  const previous = await readReleaseState(PREVIOUS_KEY);
  if (current && current.cacheName !== cacheName && !previous && await releaseCacheComplete(current.info, current.cacheName)) {
    const meta = await caches.open(META_CACHE);
    await meta.put(PREVIOUS_KEY, new Response(JSON.stringify({info:current.info,cacheName:current.cacheName,firstBootAt:null}), {headers:{'content-type':'application/json'}}));
  }
  await writeActiveRelease(info, cacheName);
}

async function confirmActiveRelease(version) {
  const active = await activeRelease();
  if (!active || active.version !== String(version)) throw new Error('cannot confirm a different active release');
  const meta = await caches.open(META_CACHE);
  await meta.delete(PREVIOUS_KEY);
  await cleanupOldReleases(active.cacheName);
  return true;
}

async function checkPendingReleaseOnNavigation() {
  const previous = await readReleaseState(PREVIOUS_KEY);
  if (!previous) return false;
  const active = await activeRelease();
  if (!active || active.cacheName === previous.cacheName) return false;
  if (!previous.firstBootAt) {
    previous.firstBootAt = Date.now();
    const meta = await caches.open(META_CACHE);
    await meta.put(PREVIOUS_KEY, new Response(JSON.stringify(previous), {headers:{'content-type':'application/json'}}));
    return false;
  }
  if (Date.now() - previous.firstBootAt < ROLLBACK_GRACE_MS) return false;
  if (!(await releaseCacheComplete(previous.info, previous.cacheName))) return false;
  await writeActiveRelease(previous.info, previous.cacheName);
  const meta = await caches.open(META_CACHE);
  await meta.delete(PREVIOUS_KEY);
  await caches.delete(active.cacheName);
  return true;
}

function releaseCacheName(version) { return `${RELEASE_PREFIX}${version}`; }

function hexFromBuffer(buffer) {
  return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function normalizeHtmlForIntegrity(text) {
  const siteBase = SCOPE_URL.href.replace(/\/$/, '');
  const siteOrigin = SCOPE_URL.origin;
  return String(text)
    .replace(/\r\n?/g, '\n')
    // The Pages workflow uploads a prepared static artifact, so GitHub Pages
    // does not process Jekyll front matter or Liquid placeholders for us.
    // Match tools/build_release.py's canonicalization before handling any
    // already-rendered URLs that may appear in an older/alternate deployment.
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/{{ site\.github\.url }}/g, '__SITE_URL__')
    .replace(/{{ site\.github\.repository_url }}/g, '__REPO_URL__')
    .split(siteBase).join('__SITE_URL__')
    .split(siteOrigin).join('__SITE_URL__')
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
  if (actualHash !== expectedHash) throw new Error(`integrity check failed for ${url.pathname} (expected ${expectedHash}, received ${actualHash})`);
  return response;
}

async function stageRelease(info) {
  const cacheName = `${RELEASE_PREFIX}${info.version}-staging-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await caches.delete(cacheName);
  try {
    const fetched = await Promise.all(info.shell.map(async canonical =>
      [canonical, await fetchReleaseAsset(canonical, info.version, info.hashes[canonical])]
    ));
    const entryPair = fetched.find(([canonical]) => canonical === info.entry);
    if (!entryPair) throw new Error('entry response missing');
    const entryText = await entryPair[1].clone().text();
    if (!entryText.includes(`${APP_VERSION_META}${info.version}"`)) throw new Error('entry version does not match version.json');
    const cache = await caches.open(cacheName);
    for (const [canonical, response] of fetched) await cache.put(canonical, response);
    for (const canonical of info.shell) {
      const stored = await cache.match(canonical);
      if (!stored) throw new Error(`staged release is missing ${new URL(canonical).pathname}`);
      const actualHash = await responseDigestHex(canonical, stored);
      if (actualHash !== info.hashes[canonical]) throw new Error(`staged cache integrity check failed for ${new URL(canonical).pathname}`);
    }
    return cacheName;
  } catch (err) {
    await caches.delete(cacheName);
    throw err;
  }
}

async function cleanupOldReleases(activeCacheName) {
  const previous = await readReleaseState(PREVIOUS_KEY);
  const keep = new Set([activeCacheName, previous?.cacheName].filter(Boolean));
  const keys = await caches.keys();
  await Promise.all(keys.filter(k => k.startsWith(RELEASE_PREFIX) && !keep.has(k)).map(k => caches.delete(k)));
}

async function activateRelease(info) {
  const stagedCacheName = await stageRelease(info);
  try { await setActiveRelease(info, stagedCacheName); }
  catch (err) { await caches.delete(stagedCacheName); throw err; }
}

async function ensureInitialRelease() {
  const active = await activeRelease();
  if (active) {
    if (await releaseCacheComplete(active, active.cacheName)) return;
    const previous = await readReleaseState(PREVIOUS_KEY);
    if (previous && await releaseCacheComplete(previous.info, previous.cacheName)) {
      await writeActiveRelease(previous.info, previous.cacheName);
      const meta = await caches.open(META_CACHE);
      await meta.delete(PREVIOUS_KEY);
      await caches.delete(active.cacheName);
      return;
    }
    const remote = await fetchVersionInfo();
    if (remote.version !== active.version) throw new Error('active release cache incomplete');
    await activateRelease(remote);
    return;
  }
  await activateRelease(await fetchVersionInfo());
}

self.addEventListener('install', event => { event.waitUntil(ensureInitialRelease()); });
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });

// Device notifications are created by the foreground app so no push server is
// required. When a notification is tapped, focus the installed app if it is
// already open; otherwise open the app at the relevant screen.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const screen = event.notification?.data?.screen || 'fasting';
  const target = new URL(`./#${screen}`, self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({type:'window', includeUncontrolled:true});
    for (const client of windows) {
      if (!client.url.startsWith(self.registration.scope)) continue;
      try { await client.focus(); } catch {}
      try { client.postMessage({type:'OPEN_SCREEN', screen}); } catch {}
      return;
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});

async function releaseHealthReport() {
  const active = await activeRelease();
  if (!active) return {ok:false, activeVersion:null, cacheComplete:false, missingAssets:0, reason:'no-active-release', protocolVersion:UPDATE_PROTOCOL_VERSION};
  const cache = await caches.open(active.cacheName);
  let missing = 0;
  for (const canonical of active.shell) if (!(await cache.match(canonical, {ignoreSearch:true}))) missing++;
  return {ok:true, activeVersion:active.version, cacheComplete:missing===0, missingAssets:missing, shellAssets:active.shell.length, protocolVersion:UPDATE_PROTOCOL_VERSION};
}

self.addEventListener('message', event => {
  if (!event.data) return;
  const port = event.ports && event.ports[0];
  if (event.data.type === 'SKIP_WAITING') { event.waitUntil(self.skipWaiting()); return; }
  if (event.data.type === 'CONFIRM_RELEASE') {
    event.waitUntil((async () => {
      try {
        if (Number(event.data.protocolVersion) !== UPDATE_PROTOCOL_VERSION) throw new Error('unsupported update protocol');
        await confirmActiveRelease(String(event.data.version || ''));
        port?.postMessage({ok:true, confirmed:true, version:String(event.data.version), protocolVersion:UPDATE_PROTOCOL_VERSION});
      } catch (err) {
        port?.postMessage({ok:false, error:String(err && err.message || err), protocolVersion:UPDATE_PROTOCOL_VERSION});
      }
    })());
    return;
  }
  if (event.data.type === 'CHECK_HEALTH') {
    event.waitUntil((async () => {
      try {
        if (Number(event.data.protocolVersion) !== UPDATE_PROTOCOL_VERSION) throw new Error('unsupported update protocol');
        port?.postMessage(await releaseHealthReport());
      } catch (err) { port?.postMessage({ok:false, error:String(err && err.message || err), protocolVersion:UPDATE_PROTOCOL_VERSION}); }
    })());
    return;
  }
  if (event.data.type !== 'REFRESH_RELEASE') return;
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

  if (url.pathname.endsWith('/version.json') || url.searchParams.has('__ft_probe') || event.request.headers.get('X-Fasting-Tracker-Probe') === '1') {
    event.respondWith(fetch(new Request(event.request, {cache:'no-store'})));
    return;
  }

  event.respondWith((async () => {
    if (event.request.mode === 'navigate') {
      try { await checkPendingReleaseOnNavigation(); } catch {}
    }
    const active = await activeRelease();
    if (!active) {
      try { return await fetch(event.request); } catch { return Response.error(); }
    }

    const cache = await caches.open(active.cacheName);
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
          const repairedActive = await activeRelease();
          const repaired = await caches.open(repairedActive.cacheName);
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
