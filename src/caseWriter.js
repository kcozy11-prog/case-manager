// ─────────────────────────────────────────────────────────────────────────────
//  사건 저장 대기열
//  - 사건마다 저장을 순서대로 하나씩 보낸다(빠르게 연달아 고쳐도 순서가 뒤바뀌지 않음).
//  - 저장은 commit(caseId, diff, newCase) 이 맡는다(앱에서는 서버 최신 문서를 읽어 diff 를 얹는 트랜잭션).
//  - 서버에 닿지 않으면(오프라인 등) 문서 전체를 덮어쓰지 않고 diff 를 들고 기다렸다가 다시 보낸다.
//  - 저장이 끝나기 전에도 화면에 바로 보이도록, 대기 중·방금 저장한 diff 를 서버 데이터 위에 겹쳐 보여 준다.
//    (diff 는 여러 번 적용해도 결과가 같으므로 겹쳐 보여도 안전하다)
// ─────────────────────────────────────────────────────────────────────────────
import { applyCaseDiff, isEmptyCaseDiff, stableStringify } from "./caseMerge.js";

const RETRYABLE_CODES = new Set(["unavailable", "deadline-exceeded", "aborted", "resource-exhausted"]);

export function isRetryableWriteError(e) {
  if (!e) return false;
  if (RETRYABLE_CODES.has(e.code)) return true;
  return /client is offline|network ?error|failed to fetch/i.test(String(e.message || ""));
}

export function createCaseWriter({
  commit,
  onChange = () => {},
  isOnline = () => true,
  retryDelayMs = 15000,
  committedTtlMs = 15000,
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
} = {}) {
  const queues = new Map(); // caseId → [{ diff, newCase, resolve, reject }]
  const running = new Set();
  const blocked = new Set(); // 서버 연결을 기다리는 사건
  let committed = []; // [{ caseId, diff, newCase, at }] 저장은 끝났지만 아직 서버 스냅샷에 안 보이는 것
  let retryTimer = null;
  let lastError = null;
  let disposed = false;

  const pendingCount = () => {
    let n = 0;
    for (const q of queues.values()) n += q.length;
    return n;
  };
  const state = () => ({ pending: pendingCount(), waiting: blocked.size > 0, error: lastError });
  const notify = () => { if (!disposed) onChange(state()); };

  function scheduleRetry() {
    if (retryTimer || disposed) return;
    retryTimer = setTimer(() => { retryTimer = null; kickAll(); }, retryDelayMs);
  }

  async function run(caseId) {
    if (running.has(caseId) || disposed) return;
    running.add(caseId);
    try {
      const q = queues.get(caseId);
      while (q && q.length && !disposed) {
        if (!isOnline()) {
          blocked.add(caseId);
          notify();
          scheduleRetry();
          return;
        }
        const job = q[0];
        let result;
        try {
          result = await commit(caseId, job.diff, job.newCase);
        } catch (e) {
          if (isRetryableWriteError(e)) {
            blocked.add(caseId);
            notify();
            scheduleRetry();
            return;
          }
          q.shift();
          blocked.delete(caseId);
          lastError = { caseId, code: e?.code || "", message: String(e?.message || e), at: now() };
          job.reject(e);
          notify();
          continue;
        }
        q.shift();
        blocked.delete(caseId);
        if (result !== "missing") committed.push({ caseId, diff: job.diff, newCase: job.newCase, at: now() });
        job.resolve(result);
        notify();
      }
      if (q && q.length === 0) queues.delete(caseId);
    } finally {
      running.delete(caseId);
    }
  }

  function kick(caseId) {
    run(caseId).catch((e) => {
      lastError = { caseId, code: e?.code || "", message: String(e?.message || e), at: now() };
      notify();
    });
  }

  function kickAll() {
    for (const caseId of [...queues.keys()]) kick(caseId);
  }

  return {
    // 저장 요청. 서버 반영이 끝나면 resolve(결과: "saved" | "unchanged" | "created" | "missing").
    // 서버에 닿지 않는 동안에는 기다렸다가 다시 보내므로 promise 도 그때까지 대기한다.
    submit(caseId, diff, { newCase = null } = {}) {
      if (disposed) return Promise.reject(new Error("저장 대기열이 닫혔습니다."));
      if (!caseId) return Promise.reject(new Error("사건 id 가 없습니다."));
      if (!newCase && isEmptyCaseDiff(diff)) return Promise.resolve("unchanged");
      return new Promise((resolve, reject) => {
        if (!queues.has(caseId)) queues.set(caseId, []);
        queues.get(caseId).push({ diff, newCase, resolve, reject });
        notify();
        kick(caseId);
      });
    },

    // 서버 스냅샷이 오면 호출: 이미 반영된(또는 오래된) '방금 저장분'을 겹쳐 보기에서 뺀다.
    reconcile(serverCases = []) {
      if (!committed.length) return false;
      const byId = new Map((serverCases || []).filter(Boolean).map((c) => [c.id, c]));
      const t = now();
      const before = committed.length;
      committed = committed.filter((e) => {
        if (t - e.at > committedTtlMs) return false;
        const sc = byId.get(e.caseId);
        if (!sc) return true; // 새 사건이 아직 스냅샷에 안 옴
        return stableStringify(applyCaseDiff(sc, e.diff)) !== stableStringify(sc);
      });
      return committed.length !== before;
    },

    // 서버 데이터 위에 '방금 저장분 + 대기 중인 저장'을 겹친 화면용 목록
    overlay(serverCases = []) {
      const list = Array.isArray(serverCases) ? serverCases : [];
      if (!committed.length && !queues.size) return list;
      const out = [...list];
      const index = new Map(out.map((c, i) => [c?.id, i]));
      const applyEntry = (caseId, diff, newCase) => {
        const i = index.get(caseId);
        if (i === undefined) {
          if (!newCase) return;
          out.push({ ...newCase });
          index.set(caseId, out.length - 1);
          return;
        }
        out[i] = applyCaseDiff(out[i], diff);
      };
      for (const e of committed) applyEntry(e.caseId, e.diff, e.newCase);
      for (const [caseId, q] of queues) for (const job of q) applyEntry(caseId, job.diff, job.newCase);
      return out;
    },

    // 사건을 지웠으면 그 사건의 대기 중 저장은 버린다(지운 사건이 되살아나지 않게).
    dropCase(caseId) {
      const q = queues.get(caseId);
      if (q) {
        q.forEach((job) => job.resolve("missing"));
        queues.delete(caseId);
      }
      blocked.delete(caseId);
      committed = committed.filter((e) => e.caseId !== caseId);
      notify();
    },

    retryNow() {
      if (retryTimer) { clearTimer(retryTimer); retryTimer = null; }
      kickAll();
    },

    clearError() {
      lastError = null;
      notify();
    },

    state,

    dispose() {
      disposed = true;
      if (retryTimer) { clearTimer(retryTimer); retryTimer = null; }
    },
  };
}
