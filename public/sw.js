const CACHE = 'ville-actu-v4'
const OFFLINE_URL = '/offline'

// Assets to pre-cache
const PRECACHE = [
  '/offline',
  '/manifest.json',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return
  // Never intercept navigation requests — server-side redirects (307, 308…)
  // cannot be forwarded by a service worker and cause ERR_FAILED in Chrome.
  // The browser handles navigations natively.
  if (event.request.mode === 'navigate') return

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached
      return fetch(event.request).then((response) => {
        // Cache static assets only
        if (
          response.ok &&
          (event.request.destination === 'script' ||
            event.request.destination === 'style' ||
            event.request.destination === 'image')
        ) {
          caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()))
        }
        return response
      }).catch(() => new Response('', { status: 503 }))
    })
  )
})
