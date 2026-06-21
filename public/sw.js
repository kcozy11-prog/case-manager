// 사건 관리 PWA 서비스워커 (앱 셸 캐시)
// 데이터 동기화는 Firestore 오프라인 캐시가 담당하므로, 여기서는 정적 자산만 캐싱한다.
const CACHE = "case-manager-shell-v1";
const SHELL = ["/case-manager/", "/case-manager/index.html", "/case-manager/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // 외부(파이어베이스/구글 API 등)는 그대로 네트워크
  if (url.origin !== self.location.origin) return;

  // 정적 자산: 캐시 우선, 그 외: 네트워크 우선 + 오프라인 폴백
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("/case-manager/index.html")))
  );
});
