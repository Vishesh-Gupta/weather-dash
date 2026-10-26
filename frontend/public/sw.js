// Service worker: makes the app installable and lets it open offline with the
// last data this device saw. Pages already say how old their data is, so a
// cached reading is shown honestly as an old one.

const VERSION = 'v1'
const SHELL = `shell-${VERSION}`
const ASSETS = `assets-${VERSION}`
const DATA = `data-${VERSION}`
const SHELL_FILES = ['/', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png']
// Built files are named by content, so old ones pile up across deploys; keep the newest.
const MAX_ASSETS = 80

/** How to answer a request. */
function strategyFor(url, request) {
  if (request.method !== 'GET' || url.origin !== self.location.origin) return 'network'
  // The live stream can't be cached, and the API docs aren't part of the app.
  if (url.pathname === '/api/events' || url.pathname.startsWith('/api/docs')) return 'network'
  if (url.pathname.startsWith('/api/')) return 'data'
  if (url.pathname.startsWith('/assets/')) return 'asset'
  if (request.mode === 'navigate') return 'page'
  return 'static'
}

async function trim(name, max) {
  const cache = await caches.open(name)
  const keys = await cache.keys()
  await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((key) => cache.delete(key)))
}

/** Fresh from the network when possible; the last copy when not. */
async function networkFirst(request, cacheName, cacheKey = request) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (response.ok) await cache.put(cacheKey, response.clone())
    return response
  } catch (error) {
    const cached = await cache.match(cacheKey)
    if (cached) return cached
    throw error
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) {
    await cache.put(request, response.clone())
    if (cacheName === ASSETS) await trim(ASSETS, MAX_ASSETS)
  }
  return response
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  const current = new Set([SHELL, ASSETS, DATA])
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((n) => !current.has(n)).map((n) => caches.delete(n))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  switch (strategyFor(url, event.request)) {
    case 'page':
      // Every route is the same app; offline, open it from the saved copy.
      event.respondWith(networkFirst(event.request, SHELL, '/'))
      break
    case 'data':
      event.respondWith(
        networkFirst(event.request, DATA).catch(
          () =>
            new Response(JSON.stringify({ detail: "You're offline, and this wasn't saved yet." }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            }),
        ),
      )
      break
    case 'asset':
      event.respondWith(cacheFirst(event.request, ASSETS))
      break
    case 'static':
      event.respondWith(cacheFirst(event.request, SHELL))
      break
    default:
    // Leave everything else (other sites, the live stream, writes) to the browser.
  }
})
