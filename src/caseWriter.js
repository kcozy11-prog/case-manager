// ─────────────────────────────────────────────────────────────────────────────
//  사건 저장 대기열
//  - 사건마다 저장을 순서대로 하나씩 보낸다(빠르게 연달아 고쳐도 순서가 뒤바뀌지 않음).
//  - 저장은 commit(caseId, diff, newCase) 이 맡는다(앱에서는 서버 최신 문서를 읽어 diff 를 얹는 트랜잭션).
//  - 서버에 닿지 않으면(오프라인 등) 문서 전체를 덮어쓰지 않고 diff 를 들고 기다렸다가 다시 보낸다.
//  - 저장이 끝나기 전에도 화면에 바로 보이도록, 대기 중·방금 저장한 diff 를 서버 데이터 위에 겹쳐 보여 준다.
//    (diff 는 여러 번 적용해도 결과가 같으므로 겹쳐 보여도 안전하다)
//  - store 를 주면 대기 중인 diff 를 이 기기에 보관한다(서버 반영에 성공하면 지움). 앱을 닫았다 다시 열면
//    보관된 대기분을 대기열 앞에 다시 올리고, release() 뒤(로그인·서버 판본 수신 후) 같은 diff 경로로 보낸다.
//    문서 전체를 덮어쓰지 않고, 같은 diff 를 다시 보내도 결과가 같으므로(멱등) 이중 전송도 안전하다.
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
  store = null, // { load(): items, save(items) } — 대기분을 이 기기에 보관
  startPaused = false, // true 면 release() 전까지 보내지 않는다(보관분은 서버 판본을 받은 뒤 보낸다)
} = {}) {
  const queues = new Map(); // caseId → [{ id, diff, newCase, at, resolve, reject }]
  const running = new Set();
  const blocked = new Set(); // 서버 연결을 기다리는 사건
  let committed = []; // [{ caseId, diff, newCase, at }] 저장은 끝났지만 아직 서버 스냅샷에 안 보이는 것
  let retryTimer = null;
  let lastError = null;
  let disposed = false;
  let released = !startPaused;
  let persistError = null;
  let seq = 0;
  const noop = () => {};
  const newJobId = () => `${now()}-${(seq += 1)}-${Math.random().toString(36).slice(2, 8)}`;

  const pendingCount = () => {
    let n = 0;
    for (const q of queues.values()) n += q.length;
    return n;
  };
  const restoredCount = () => {
    let n = 0;
    for (const q of queues.values()) n += q.filter((j) => j.restored).length;
    return n;
  };
  const state = () => {
    const pending = pendingCount();
    return {
      pending,
      waiting: blocked.size > 0,
      error: lastError,
      paused: !released && pending > 0, // 보관분: 서버 판본을 받은 뒤 보낸다
      restored: restoredCount(), // 지난번에 보내지 못하고 이 기기에 남아 있던 저장
      stored: !!store && pending > 0 && !persistError, // 대기분이 이 기기에 보관되어 있는지
      persistError, // 보관 실패(창을 닫으면 사라질 수 있음)
    };
  };
  const notify = () => { if (!disposed) onChange(state()); };

  // 대기열 전체를 순서대로 보관한다(쓰기는 동기 — 창을 바로 닫아도 남는다)
  function persist() {
    if (!store || disposed) return;
    const items = [];
    for (const [caseId, q] of queues) {
      for (const job of q) items.push({ id: job.id, caseId, diff: job.diff, newCase: job.newCase || null, at: job.at });
    }
    try {
      store.save(items);
      persistError = null;
    } catch (e) {
      persistError = String(e?.message || e);
    }
  }

  // 지난번에 남은 대기분을 대기열 앞에 올린다(같은 사건 안에서는 순서 그대로)
  if (store) {
    let saved = [];
    try { saved = store.load() || []; } catch { saved = []; }
    for (const it of saved) {
      if (!it || !it.caseId || !it.diff) continue;
      if (!queues.has(it.caseId)) queues.set(it.caseId, []);
      queues.get(it.caseId).push({
        id: it.id || newJobId(), diff: it.diff, newCase: it.newCase || null, at: it.at || now(),
        restored: true, resolve: noop, reject: noop,
      });
    }
  }

  function scheduleRetry() {
    if (retryTimer || disposed) return;
    retryTimer = setTimer(() => { retryTimer = null; kickAll(); }, retryDelayMs);
  }

  async function run(caseId) {
    if (running.has(caseId) || disposed || !released) return;
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
          if (q.length === 0) queues.delete(caseId);
          persist();
          lastError = { caseId, code: e?.code || "", message: String(e?.message || e), at: now() };
          job.reject(e);
          notify();
          continue;
        }
        q.shift();
        blocked.delete(caseId);
        if (q.length === 0) queues.delete(caseId);
        persist(); // 서버 반영에 성공한 것은 보관분에서 지운다
        if (result !== "missing") committed.push({ caseId, diff: job.diff, newCase: job.newCase, at: now() });
        job.resolve(result);
        notify();
      }
      if (q && q.length === 0 && queues.get(caseId) === q) queues.delete(caseId);
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
        queues.get(caseId).push({ id: newJobId(), diff, newCase, at: now(), resolve, reject });
        persist(); // 보내기 전에 먼저 이 기기에 적어 둔다
        notify();
        kick(caseId);
      });
    },

    // 보관분·새 저장을 보내기 시작한다(앱: 로그인과 서버 판본 수신이 끝난 뒤 호출)
    release() {
      if (released || disposed) return;
      released = true;
      notify();
      kickAll();
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
        persist();
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

// 창 이벤트와 대기열을 잇는다.
//  - online: 바로 다시 보낸다.
//  - visibilitychange(숨겨짐): 휴대전화에서 앱을 내리거나 다른 앱으로 갈 때 남은 저장을 보내 본다.
//    (대기분은 이미 이 기기에 보관되어 있으므로, 보내지 못해도 다음에 앱을 열 때 이어서 보낸다)
//  - beforeunload: 아직 서버에 못 보낸 저장이 있으면 창을 닫기 전에 묻는다.
export function bindWriterLifecycle(writer, { win = globalThis.window, doc = globalThis.document } = {}) {
  if (!writer || !win) return () => {};
  const onOnline = () => writer.retryNow();
  const onVisibility = () => { if (doc && doc.visibilityState === "hidden") writer.retryNow(); };
  const onBeforeUnload = (e) => {
    if (writer.state().pending > 0) {
      e.preventDefault();
      e.returnValue = "";
      return "";
    }
    return undefined;
  };
  win.addEventListener("online", onOnline);
  win.addEventListener("beforeunload", onBeforeUnload);
  if (doc) doc.addEventListener("visibilitychange", onVisibility);
  return () => {
    win.removeEventListener("online", onOnline);
    win.removeEventListener("beforeunload", onBeforeUnload);
    if (doc) doc.removeEventListener("visibilitychange", onVisibility);
  };
}

// 화면 위쪽 대기 안내 문구 (없으면 null)
export function pendingNotice(s) {
  if (!s || !(s.pending > 0)) return null;
  const where = s.persistError
    ? "이 기기에 보관하지 못했습니다. 연결될 때까지 이 창을 닫지 마세요"
    : s.stored
      ? "이 기기에 보관됨 — 앱을 닫았다 다시 열어도 연결되면 이어서 보냅니다"
      : "연결될 때까지 이 창을 닫지 마세요";
  if (s.paused) return { tone: "info", text: `보내지 못한 저장 ${s.pending}건을 서버 확인 뒤 보냅니다(${where}).` };
  if (s.waiting) return { tone: "warn", text: `서버 연결 대기 중 — 저장 대기 ${s.pending}건(${where}).` };
  return null;
}
