// 사건 관리 PWA 서비스워커 (앱 셸 캐시)
// 데이터 동기화는 Firestore 오프라인 캐시가 담당하므로, 여기서는 정적 자산만 캐싱한다.
//
// 갱신 전략(중요):
//  - HTML/내비게이션 요청은 항상 네트워크(no-store)로 받아 '최신 index.html'을 보장한다.
//    index.html 은 매 배포마다 새 해시 자산(JS/CSS)을 가리키므로, 이것만 최신이면 전체가 갱신된다.
//  - 해시가 박힌 정적 자산(JS/CSS 등)은 불변이므로 캐시 우선(빠름 + 오프라인).
//  - 캐시 이름(버전)을 올리면 activate 시 옛 캐시를 모두 비워 stale 화면 고착을 푼다.
const CACHE = "case-manager-shell-v2";
const SHELL = ["/case-manager/", "/case-manager/index.html", "/case-manager/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isHtmlRequest(req, url) {
  return req.mode === "navigate"
    || req.destination === "document"
    || url.pathname.endsWith("/")
    || url.pathname.endsWith("index.html");
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // 외부(파이어베이스/구글 API 등)는 그대로 네트워크
  if (url.origin !== self.location.origin) return;

  // HTML/내비게이션: 항상 최신(no-store). 오프라인이면 캐시된 셸로 폴백.
  if (isHtmlRequest(req, url)) {
    e.respondWith(
      fetch(req, { cache: "no-store" })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/case-manager/index.html", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/case-manager/index.html")))
    );
    return;
  }

  // 해시된 정적 자산: 캐시 우선, 없으면 네트워크 후 캐시 저장.
  e.respondWith(
    caches.match(req).then((cached) =>
      cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match("/case-manager/index.html"))
    )
  );
});
