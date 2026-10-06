import test from 'node:test';
import assert from 'node:assert/strict';
import { createCaseWriter, isRetryableWriteError } from './caseWriter.js';
import { diffCase, applyCaseDiff } from './caseMerge.js';

const tick = () => new Promise((r) => setImmediate(r));

// 서버 역할: 문서 저장소 + 트랜잭션처럼 '최신 문서에 diff 를 얹는' commit
function fakeServer(initial = {}) {
  const docs = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]));
  const log = [];
  let failNext = null;
  const commit = async (caseId, diff, newCase) => {
    await tick();
    if (failNext) { const e = failNext; failNext = null; throw e; }
    log.push(caseId);
    if (!docs.has(caseId)) {
      if (!newCase) return 'missing';
      docs.set(caseId, JSON.parse(JSON.stringify(newCase)));
      return 'created';
    }
    docs.set(caseId, applyCaseDiff(docs.get(caseId), diff));
    return 'saved';
  };
  return { docs, log, commit, failOnce: (e) => { failNext = e; } };
}

function fakeTimers() {
  const timers = [];
  return {
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimer: (id) => { if (timers[id - 1]) timers[id - 1].fn = null; },
    fire: () => { const list = timers.splice(0); list.forEach((t) => t.fn && t.fn()); },
    count: () => timers.filter((t) => t.fn).length,
  };
}

const C = { id: 'c1', title: '원기업 민사', timeline: [{ id: 1, content: '소장' }], todos: [] };

test('연달아 고쳐도 사건별로 순서대로 저장되고 서로의 변경을 지우지 않는다', async () => {
  const server = fakeServer({ c1: C });
  const w = createCaseWriter({ commit: server.commit });
  const a = { ...C, todos: [{ id: 10, text: '증거 정리', done: false }] };
  const b = { ...a, todos: [{ id: 10, text: '증거 정리', done: true }] };
  const p1 = w.submit('c1', diffCase(C, a));
  const p2 = w.submit('c1', diffCase(a, b));
  assert.deepEqual(await Promise.all([p1, p2]), ['saved', 'saved']);
  assert.equal(server.docs.get('c1').todos[0].done, true);
  assert.equal(server.docs.get('c1').timeline.length, 1);
});

test('서버에 닿지 않으면 덮어쓰지 않고 기다렸다가 다시 보낸다', async () => {
  const server = fakeServer({ c1: C });
  const timers = fakeTimers();
  const states = [];
  const w = createCaseWriter({ commit: server.commit, onChange: (s) => states.push(s), ...timers });
  server.failOnce(Object.assign(new Error('offline'), { code: 'unavailable' }));
  const next = { ...C, timeline: [...C.timeline, { id: 2, content: '강남연립 현장 확인' }] };
  let done = false;
  const p = w.submit('c1', diffCase(C, next)).then((r) => { done = r; });
  await tick(); await tick();
  assert.equal(done, false, '아직 대기 중');
  assert.equal(w.state().waiting, true);
  assert.equal(w.state().pending, 1);
  // 대기 중에도 화면에는 보인다
  assert.equal(w.overlay([C])[0].timeline.length, 2);
  // 그 사이 다른 기기가 서버에 기록을 추가
  server.docs.set('c1', { ...server.docs.get('c1'), timeline: [...C.timeline, { id: 3, content: '다른 기기 기록' }] });
  timers.fire();
  await p;
  assert.equal(done, 'saved');
  assert.deepEqual(server.docs.get('c1').timeline.map((t) => t.id), [1, 3, 2]);
  assert.equal(w.state().waiting, false);
  assert.equal(w.state().pending, 0);
});

test('오프라인으로 알려진 동안에는 보내지 않고, 다시 연결되면 보낸다', async () => {
  const server = fakeServer({ c1: C });
  const timers = fakeTimers();
  let online = false;
  const w = createCaseWriter({ commit: server.commit, isOnline: () => online, ...timers });
  const p = w.submit('c1', diffCase(C, { ...C, title: '원기업 민사(항소심)' }));
  await tick();
  assert.equal(server.log.length, 0);
  online = true;
  w.retryNow();
  assert.equal(await p, 'saved');
  assert.equal(server.docs.get('c1').title, '원기업 민사(항소심)');
});

test('권한 오류 같은 영구 오류는 재시도하지 않고 알린다', async () => {
  const server = fakeServer({ c1: C });
  const timers = fakeTimers();
  const w = createCaseWriter({ commit: server.commit, ...timers });
  server.failOnce(Object.assign(new Error('denied'), { code: 'permission-denied' }));
  await assert.rejects(w.submit('c1', diffCase(C, { ...C, title: 'x' })), /denied/);
  assert.equal(w.state().error.code, 'permission-denied');
  assert.equal(timers.count(), 0);
  w.clearError();
  assert.equal(w.state().error, null);
});

test('변경이 없으면 보내지 않는다', async () => {
  const server = fakeServer({ c1: C });
  const w = createCaseWriter({ commit: server.commit });
  assert.equal(await w.submit('c1', diffCase(C, { ...C })), 'unchanged');
  assert.equal(server.log.length, 0);
});

test('새 사건은 만들고, 서버에서 지워진 사건은 되살리지 않는다', async () => {
  const server = fakeServer({});
  const w = createCaseWriter({ commit: server.commit });
  const nc = { id: 'n1', title: '새 사건', todos: [] };
  assert.equal(await w.submit('n1', diffCase({ id: 'n1' }, nc), { newCase: nc }), 'created');
  assert.equal(server.docs.get('n1').title, '새 사건');
  assert.equal(await w.submit('gone', diffCase(C, { ...C, title: 'y' })), 'missing');
  assert.equal(server.docs.has('gone'), false);
});

test('방금 저장한 내용은 서버 스냅샷에 보일 때까지 화면에 겹쳐 보인다', async () => {
  const server = fakeServer({ c1: C });
  let t = 1000;
  const w = createCaseWriter({ commit: server.commit, now: () => t });
  const next = { ...C, todos: [{ id: 5, text: '준비서면 작성', done: false }] };
  await w.submit('c1', diffCase(C, next));
  // 스냅샷이 아직 옛 판본이면 겹쳐 보인다
  assert.equal(w.reconcile([C]), false);
  assert.equal(w.overlay([C])[0].todos.length, 1);
  // 스냅샷이 따라오면 겹침을 거둔다
  assert.equal(w.reconcile([server.docs.get('c1')]), true);
  assert.equal(w.overlay([C])[0].todos.length, 0, '겹침이 거둬지면 서버 판본 그대로');
  // 오래된 겹침은 시간이 지나면 거둔다
  await w.submit('c1', diffCase(next, { ...next, title: 'z' }));
  t += 60000;
  assert.equal(w.reconcile([C]), true);
});

test('지운 사건의 대기 저장은 버린다', async () => {
  const server = fakeServer({ c1: C });
  const w = createCaseWriter({ commit: server.commit, isOnline: () => false, setTimer: () => 0, clearTimer: () => {} });
  const p = w.submit('c1', diffCase(C, { ...C, title: 'q' }));
  w.dropCase('c1');
  assert.equal(await p, 'missing');
  assert.equal(w.state().pending, 0);
  assert.deepEqual(w.overlay([]), []);
});

test('재시도 대상 오류 판별', () => {
  assert.equal(isRetryableWriteError({ code: 'unavailable' }), true);
  assert.equal(isRetryableWriteError({ code: 'aborted' }), true);
  assert.equal(isRetryableWriteError({ message: 'Failed to get document because the client is offline.' }), true);
  assert.equal(isRetryableWriteError({ code: 'permission-denied' }), false);
  assert.equal(isRetryableWriteError({ code: 'invalid-argument' }), false);
  assert.equal(isRetryableWriteError(null), false);
});
