const CACHE_NAME = 'cropworks-v1'
const API_CACHE = 'cropworks-api-v1'
const PHOTO_CACHE = 'cropworks-photos-v1'

const PRECACHE_URLS = ['/', '/index.html']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => ![CACHE_NAME, API_CACHE, PHOTO_CACHE].includes(k)).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // 写真: CacheFirst（30日）
  if (url.pathname.startsWith('/photos/')) {
    event.respondWith(
      caches.open(PHOTO_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached
          return fetch(event.request).then(res => {
            cache.put(event.request, res.clone())
            return res
          })
        })
      )
    )
    return
  }

  // API: NetworkFirst（10秒タイムアウト）
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      Promise.race([
        fetch(event.request.clone()).then(res => {
          if (res.ok) {
            caches.open(API_CACHE).then(cache => cache.put(event.request, res.clone()))
          }
          return res
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
      ]).catch(() =>
        caches.match(event.request)
      )
    )
    return
  }

  // その他: NetworkFirst、失敗時はキャッシュ、なければindex.html
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request).then(cached => cached || caches.match('/index.html'))
    )
  )
})
