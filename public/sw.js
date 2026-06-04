const CACHE = 'ville-actu-v1'
const OFFLINE_URL = '/offline'

// Assets to pre-cache
const PRECACHE = [
  '/',
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

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached
      // iOS Safari PWA rejects redirect responses from service workers —
      // use redirect:'follow' so we always return the final 200 response.
      const req = new Request(event.request, { redirect: 'follow' })
      return fetch(req).then((response) => {
        // Cache HTML pages and static assets
        if (
          response.ok &&
          (event.request.destination === 'document' ||
            event.request.destination === 'script' ||
            event.request.destination === 'style' ||
            event.request.destination === 'image')
        ) {
          const clone = response.clone()
          caches.open(CACHE).then((cache) => cache.put(event.request, clone))
        }
        return response
      }).catch(() => {
        if (event.request.destination === 'document') {
          return caches.match(OFFLINE_URL) ?? new Response('Offline', { status: 503 })
        }
        return new Response('', { status: 503 })
      })
    })
  )
})
