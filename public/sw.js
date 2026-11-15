/* Service worker GestionPro : ressources statiques et synchronisation des brouillons de clients.
 * Les données métier ne sont jamais mises en cache. Les brouillons restent dans IndexedDB
 * jusqu'à confirmation du serveur, qui vérifie la session, les permissions et l'entreprise.
 */
const CACHE = "gestionpro-static-v2";
const PRECACHE = ["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png", "/manifest.webmanifest"];
const DB_NAME = "xgestion-offline";
const STORE = "customers";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("gestionpro-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
      return res;
    })));
  }
});

function openQueue() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function syncQueue() {
  if (!self.navigator.onLine) return;
  const db = await openQueue();
  const pending = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  if (!pending.length) { db.close(); return; }

  let response;
  try {
    response = await fetch("/api/offline-sync", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customers: pending }),
    });
  } catch {
    db.close();
    return;
  }
  if (!response.ok) { db.close(); return; }

  const payload = await response.json();
  const synced = (payload.results || []).filter((item) => item.synced).map((item) => item.id);
  if (synced.length) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      synced.forEach((id) => store.delete(id));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  db.close();
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  clients.forEach((client) => client.postMessage({ type: "XGESTION_OFFLINE_SYNC", synced: synced.length, failed: (payload.results || []).length - synced.length }));
}

self.addEventListener("sync", (e) => {
  if (e.tag === "xgestion-offline-queue") e.waitUntil(syncQueue());
});
self.addEventListener("message", (e) => {
  if (e.data?.type === "XGESTION_SYNC_OFFLINE_QUEUE") e.waitUntil(syncQueue());
});
