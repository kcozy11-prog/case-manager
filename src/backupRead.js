// 서버 판본 우선 읽기 정책 (Firebase 와 떨어진 순수 함수 — 시험용)
//  - 서버에서 먼저 읽는다.
//  - requireServer 이면 서버에서 못 읽을 때 그대로 실패한다(기기 캐시로 백업을 만들지 않는다).
//  - 아니면 기기 사본으로 읽고 onFallback 으로 알린다.
export async function readWithServerPolicy(readAll, { requireServer = false, onFallback } = {}) {
  try {
    return await readAll(true);
  } catch (e) {
    if (requireServer) throw e;
    if (onFallback) onFallback(e);
    return readAll(false);
  }
}
