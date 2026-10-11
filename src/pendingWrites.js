// ─────────────────────────────────────────────────────────────────────────────
//  사건 저장 대기분을 이 기기에 보관 (사용자별)
//  - 서버에 닿지 못한 저장(diff)을 localStorage 에 적어 두었다가, 앱을 다시 열면 이어서 보낸다.
//  - IndexedDB 대신 localStorage 를 쓰는 까닭: 쓰기가 즉시(동기) 끝나므로, 저장 직후 창을 닫거나
//    새로고침해도 기록이 남는다. 대기분은 바뀐 부분(diff)만이라 크기가 작다.
//  - 보관 형식: { v: 1, savedAt, items: [{ id, caseId, diff, newCase, at }] } — 대기열 순서 그대로.
// ─────────────────────────────────────────────────────────────────────────────

export const PENDING_WRITES_PREFIX = "caseManager.pendingWrites.v1.";

export function pendingWritesKey(uid) {
  return `${PENDING_WRITES_PREFIX}${uid}`;
}

function validItem(it) {
  return !!it && typeof it === "object" && typeof it.caseId === "string" && it.caseId
    && it.diff && typeof it.diff === "object";
}

function defaultStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

// storage: getItem/setItem/removeItem 을 가진 객체 (시험에서는 가짜 저장소를 넣는다)
export function createPendingStore(uid, storage = defaultStorage()) {
  const key = pendingWritesKey(uid);
  return {
    key,
    load() {
      if (!uid || !storage) return [];
      try {
        const raw = storage.getItem(key);
        if (!raw) return [];
        const data = JSON.parse(raw);
        return Array.isArray(data?.items) ? data.items.filter(validItem) : [];
      } catch {
        return [];
      }
    },
    // 보관에 실패하면(용량 초과·사생활 보호 모드 등) 예외를 던진다 — 대기열이 화면에 알린다
    save(items) {
      if (!uid) return;
      if (!storage) throw new Error("이 기기에 보관할 저장소가 없습니다.");
      if (!items || items.length === 0) {
        storage.removeItem(key);
        return;
      }
      storage.setItem(key, JSON.stringify({ v: 1, savedAt: new Date().toISOString(), items }));
    },
  };
}

// 시험·비상용 메모리 저장소
export function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    dump: () => Object.fromEntries(map),
  };
}
