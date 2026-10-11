import test from 'node:test';
import assert from 'node:assert/strict';
import { createCaseWriter, bindWriterLifecycle } from './caseWriter.js';
import { createPendingStore, createMemoryStorage, pendingWritesKey } from './pendingWrites.js';
import { diffCase, applyCaseDiff } from './caseMerge.js';

const tick = () => new Promise((r) => setImmediate(r));
const settle = async (n = 5) => { for (let i = 0; i < n; i++) await tick(); };

// 서버 역할: 트랜잭션처럼 '최신 문서에 diff 를 얹는' commit. online=false 면 앱의 트랜잭션처럼 실패한다.
function fakeServer(initial = {}) {
  const docs = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]));
  const calls = [];
  const net = { online: true };
  const commit = async (caseId, diff, newCase) => {
    await tick();
    if (!net.online) throw Object.assign(new Error('Failed to get document because the client is offline.'), { code: 'unavailable' });
    calls.push({ caseId, diff });
    if (!docs.has(caseId)) {
      if (!newCase) return 'missing';
      docs.set(caseId, JSON.parse(JSON.stringify(newCase)));
      return 'created';
    }
    docs.set(caseId, applyCaseDiff(docs.get(caseId), diff));
    return 'saved';
  };
  return { docs, calls, commit, net };
}

function fakeTimers() {
  const timers = [];
  return {
    setTimer: (fn) => { timers.push(fn); return timers.length; },
    clearTimer: (id) => { timers[id - 1] = null; },
    fire: () => { const list = timers.splice(0); list.forEach((fn) => fn && fn()); },
  };
}

const C = { id: 'c1', title: '원기업 민사', timeline: [{ id: 1, content: '소장 접수' }], todos: [] };
const D = { id: 'c2', title: '강남연립 손해배상', timeline: [], todos: [] };

test('오프라인에서 입력한 저장은 사용자별로 이 기기에 보관되고, 서버 반영에 성공하면 지워진다', async () => {
  const storage = createMemoryStorage();
  const server = fakeServer({ c1: C });
  server.net.online = false;
  const w = createCaseWriter({ commit: server.commit, store: createPendingStore('u1', storage), ...fakeTimers() });
  const next = { ...C, timeline: [...C.timeline, { id: 2, content: '현장 확인(오프라인 입력)' }] };
  w.submit('c1', diffCase(C, next));
  await settle();
  const saved = JSON.parse(storage.getItem(pendingWritesKey('u1')));
  assert.equal(saved.items.length, 1);
  assert.equal(saved.items[0].caseId, 'c1');
  assert.deepEqual(applyCaseDiff(C, saved.items[0].diff).timeline.map((t) => t.id), [1, 2]);
  assert.equal(w.state().stored, true);
  assert.equal(w.state().waiting, true);
  // 다른 사용자 칸에는 남지 않는다
  assert.equal(storage.getItem(pendingWritesKey('u2')), null);

  server.net.online = true;
  w.retryNow();
  await settle();
  assert.deepEqual(server.docs.get('c1').timeline.map((t) => t.id), [1, 2]);
  assert.equal(storage.getItem(pendingWritesKey('u1')), null); // 반영되면 지운다
  assert.equal(w.state().pending, 0);
});

test('앱을 닫았다 다시 열면, 서버 판본을 받은 뒤(release) 남은 대기분을 같은 diff 경로로 보낸다 — 문서를 덮어쓰지 않는다', async () => {
  const storage = createMemoryStorage();
  const server = fakeServer({ c1: C, c2: D });
  server.net.online = false;
  // ① 첫 세션: 오프라인으로 두 사건을 고치고 창을 닫는다(대기열은 메모리에서 사라짐)
  const first = createCaseWriter({ commit: server.commit, store: createPendingStore('u1', storage), ...fakeTimers() });
  const c1a = { ...C, timeline: [...C.timeline, { id: 2, content: '조정기일 결과' }] };
  const c1b = { ...c1a, title: '원기업 민사(본안)' };
  first.submit('c1', diffCase(C, c1a));
  first.submit('c1', diffCase(c1a, c1b));
  first.submit('c2', diffCase(D, { ...D, todos: [{ id: 7, text: '감정서 검토', done: false }] }));
  await settle();
  first.dispose();

  // ② 그사이 다른 기기가 c1 에 진행경과를 더했다(이 내용이 지워지면 안 된다)
  server.net.online = true;
  server.docs.set('c1', { ...server.docs.get('c1'), timeline: [...server.docs.get('c1').timeline, { id: 9, content: '다른 기기 기록' }] });

  // ③ 다시 열기: 보관분을 불러와 화면에는 바로 겹쳐 보이지만, release 전에는 보내지 않는다
  const states = [];
  const second = createCaseWriter({
    commit: server.commit, store: createPendingStore('u1', storage), startPaused: true, onChange: (s) => states.push(s), ...fakeTimers(),
  });
  assert.equal(second.state().pending, 3);
  assert.equal(second.state().restored, 3);
  assert.equal(second.state().paused, true);
  const shown = second.overlay([server.docs.get('c1'), server.docs.get('c2')]);
  assert.equal(shown[0].title, '원기업 민사(본안)');
  await settle();
  assert.equal(server.calls.length, 0, '서버 판본을 받기 전에는 보내지 않는다');

  // release 전에 새로 고친 내용은 보관분 뒤에 이어 보낸다(순서 보장)
  const c1c = { ...c1b, todos: [{ id: 11, text: '새 할 일', done: false }] };
  second.submit('c1', diffCase(c1b, c1c));
  await settle();
  assert.equal(server.calls.length, 0);

  second.release();
  await settle(10);
  const doc = server.docs.get('c1');
  assert.deepEqual(doc.timeline.map((t) => t.id).sort(), [1, 2, 9]); // 다른 기기 기록 보존
  assert.equal(doc.title, '원기업 민사(본안)');
  assert.deepEqual(doc.todos.map((t) => t.id), [11]);
  assert.deepEqual(server.docs.get('c2').todos.map((t) => t.id), [7]);
  // 사건끼리는 따로 보내고, 같은 사건 안에서는 보관분 → 새 저장 순서를 지킨다
  assert.equal(server.calls.filter((c) => c.caseId === 'c1').length, 3);
  assert.equal(server.calls.filter((c) => c.caseId === 'c2').length, 1);
  assert.equal(storage.getItem(pendingWritesKey('u1')), null);
  assert.equal(second.state().pending, 0);
});

test('같은 대기분을 두 번 보내도(반영 직후 보관분을 지우기 전에 닫힌 경우) 결과가 같다', async () => {
  const storage = createMemoryStorage();
  const server = fakeServer({ c1: C });
  const next = { ...C, timeline: [...C.timeline, { id: 2, content: '한 번만 들어가야 할 기록' }] };
  const diff = diffCase(C, next);
  server.docs.set('c1', applyCaseDiff(server.docs.get('c1'), diff)); // 이미 한 번 반영됨
  createPendingStore('u1', storage).save([{ id: 'x', caseId: 'c1', diff, newCase: null, at: 1 }]);
  const w = createCaseWriter({ commit: server.commit, store: createPendingStore('u1', storage), startPaused: true });
  w.release();
  await settle();
  assert.deepEqual(server.docs.get('c1').timeline.map((t) => t.id), [1, 2]);
});

test('기기에 보관하지 못하면(용량 초과 등) 그 사실을 상태로 알린다', async () => {
  const broken = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
  const server = fakeServer({ c1: C });
  server.net.online = false;
  const w = createCaseWriter({ commit: server.commit, store: createPendingStore('u1', broken), ...fakeTimers() });
  w.submit('c1', diffCase(C, { ...C, title: 'x' }));
  await settle();
  assert.match(w.state().persistError, /Quota/);
  assert.equal(w.state().stored, false);
});

test('보관분이 깨져 있으면 무시하고, 다시 보낼 수 없는 오류(권한 등)는 보관분에서 뺀다', async () => {
  const storage = createMemoryStorage({ [pendingWritesKey('u1')]: '{깨진 json' });
  assert.deepEqual(createPendingStore('u1', storage).load(), []);
  const server = { commit: async () => { throw Object.assign(new Error('denied'), { code: 'permission-denied' }); } };
  const w = createCaseWriter({ commit: server.commit, store: createPendingStore('u1', storage) });
  await w.submit('c1', diffCase(C, { ...C, title: 'x' })).catch(() => {});
  await settle();
  assert.equal(storage.getItem(pendingWritesKey('u1')), null);
  assert.equal(w.state().error.code, 'permission-denied');
});

test('online 이벤트·화면 숨김 때 바로 다시 보내고, 대기분이 있으면 창 닫기 전에 묻는다', async () => {
  const listeners = {};
  const target = () => ({
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener: (t, fn) => { listeners[t] = (listeners[t] || []).filter((f) => f !== fn); },
  });
  const win = target();
  const doc = { ...target(), visibilityState: 'visible' };
  const fire = (t, e = {}) => (listeners[t] || []).forEach((fn) => fn(e));

  const server = fakeServer({ c1: C });
  server.net.online = false;
  const timers = fakeTimers();
  const w = createCaseWriter({ commit: server.commit, store: createPendingStore('u1', createMemoryStorage()), ...timers });
  const unbind = bindWriterLifecycle(w, { win, doc });
  w.submit('c1', diffCase(C, { ...C, title: '원기업 민사(항소)' }));
  await settle();

  const ev = { preventDefault() { this.prevented = true; } };
  fire('beforeunload', ev);
  assert.equal(ev.prevented, true);

  // 화면이 숨겨질 때 다시 보내 본다(아직 오프라인 → 그대로 대기)
  doc.visibilityState = 'hidden';
  fire('visibilitychange');
  await settle();
  assert.equal(server.calls.length, 0);

  // 연결되면 타이머(15초)를 기다리지 않고 바로 보낸다
  server.net.online = true;
  fire('online');
  await settle();
  assert.equal(server.docs.get('c1').title, '원기업 민사(항소)');
  const ev2 = { preventDefault() { this.prevented = true; } };
  fire('beforeunload', ev2);
  assert.equal(ev2.prevented, undefined);
  unbind();
  assert.equal((listeners.online || []).length, 0);
});
