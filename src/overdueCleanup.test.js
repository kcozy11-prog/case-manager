import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isCleanupTarget,
  daysOverdue,
  collectOverdueTodos,
  countOverdueTodos,
  planOverdueDeletion,
  buildCleanupEntry,
  appendCleanupEntry,
  lastActiveCleanup,
  markCleanupUndone,
  hiddenTaskRecords,
  mergeHiddenTasks,
  unhideTasks,
  linkedTaskIds,
  isHiddenGoogleTask,
  planCleanupUndo,
} from './overdueCleanup.js';
import { diffCase, applyCaseDiff } from './caseMerge.js';
import { STANDALONE_TODOS_CASE_ID } from './standaloneTodos.js';

const TODAY = new Date('2026-10-07T10:00:00');

const cases = () => [
  { id: 'c1', title: '강남연립 손해배상', status: '진행중', todos: [
    { id: 1, text: '준비서면 초안', dueDate: '2026-09-20', done: false, priority: '보통' },
    { id: 2, text: '감정료 예납', dueDate: '2026-10-06', done: false, priority: '높음' },
    { id: 3, text: '오늘 기한', dueDate: '2026-10-07', done: false },
    { id: 4, text: '완료한 일', dueDate: '2026-09-01', done: true },
    { id: 5, text: '기한 없음', dueDate: '', done: false },
    { id: 6, text: '옛 캘린더 할 일', dueDate: '2026-09-01', done: false, fromCalendar: true },
    { id: 7, text: 'Google 할 일', dueDate: '2026-09-30', done: false, calendarTaskId: 'gt1', fromTasks: true, sourceUpdatedAt: '2026-09-29T00:00:00.000Z' },
  ] },
  { id: 'c2', title: '원기업 민사', status: '종결', todos: [
    { id: 8, text: '판결문 송부', dueDate: '2026-08-01', done: false },
  ] },
  { id: 'c3', title: '할 일 없는 사건', status: '진행중', todos: [] },
];
const standalone = () => [
  { id: 9, text: '사무실 계약 갱신', dueDate: '2026-10-01', done: false },
  { id: 10, text: '다음 주 할 일', dueDate: '2026-10-14', done: false },
];

test('기한이 오늘보다 앞서고 완료하지 않은 할 일만 대상이다 (화면의 기한 지남 표시와 같은 기준)', () => {
  const [c1] = cases();
  const ids = c1.todos.filter((t) => isCleanupTarget(t, TODAY)).map((t) => t.id);
  assert.deepEqual(ids, [1, 2, 7]);
  assert.equal(daysOverdue('2026-09-20', TODAY), 17);
  assert.equal(daysOverdue('2026-10-06', TODAY), 1);
  assert.equal(isCleanupTarget({ text: '날짜 형식 오류', dueDate: '언젠가', done: false }, TODAY), false);
});

test('진행 중 사건 → 일반 할 일 → 종결 사건 순으로 묶고, 묶음 안에서는 오래 밀린 것부터 보여 준다', () => {
  const groups = collectOverdueTodos(cases(), standalone(), TODAY);
  assert.deepEqual(groups.map((g) => [g.caseTitle, g.closed, g.standalone]), [
    ['강남연립 손해배상', false, false],
    ['일반 할 일', false, true],
    ['원기업 민사', true, false],
  ]);
  assert.deepEqual(groups[0].items.map((i) => i.todo.id), [1, 7, 2]);
  assert.deepEqual(groups[0].items.map((i) => i.days), [17, 7, 1]);
  assert.equal(groups[0].items[1].google, true);
  assert.equal(groups[1].caseId, STANDALONE_TODOS_CASE_ID);
  assert.equal(countOverdueTodos(cases(), standalone(), TODAY), 5);
  // 키는 다시 계산해도 같다 (선택 상태 유지)
  assert.deepEqual(collectOverdueTodos(cases(), standalone(), TODAY)[0].items.map((i) => i.key), groups[0].items.map((i) => i.key));
});

test('고른 항목만 뺀 판본을 만들고, 그 판본의 diff 는 고른 할 일만 지운다', () => {
  const all = cases();
  const groups = collectOverdueTodos(all, standalone(), TODAY);
  const selection = [groups[0].items[0], groups[0].items[1], groups[1].items[0]];
  const { changes, skipped } = planOverdueDeletion(all, standalone(), selection);
  assert.equal(skipped, 0);
  assert.deepEqual(changes.map((c) => [c.caseId, c.removed.map((t) => t.id)]), [['c1', [1, 7]], [STANDALONE_TODOS_CASE_ID, [9]]]);
  assert.deepEqual(changes[0].next.todos.map((t) => t.id), [2, 3, 4, 5, 6]);
  assert.equal(changes[1].standalone, true);
  assert.deepEqual(changes[1].next.todos.map((t) => t.id), [10]);

  // 서버 최신 문서에 그 사이 새 할 일이 생겨도 그대로 남는다
  const diff = diffCase(changes[0].base, changes[0].next);
  assert.deepEqual(diff.set, {});
  assert.deepEqual(diff.arrays.todos.removed.sort(), ['id:1', 'id:7']);
  const latest = { ...all[0], todos: [...all[0].todos, { id: 99, text: '다른 기기에서 추가', dueDate: '2026-09-01', done: false }] };
  assert.deepEqual(applyCaseDiff(latest, diff).todos.map((t) => t.id), [2, 3, 4, 5, 6, 99]);
});

test('미리보기 뒤 완료하거나 고친 항목, 없어진 사건의 항목은 지우지 않고 건너뛴다', () => {
  const before = cases();
  const groups = collectOverdueTodos(before, [], TODAY);
  const selection = groups.flatMap((g) => g.items);
  const after = cases();
  after[0].todos[0] = { ...after[0].todos[0], done: true }; // 다른 기기에서 완료
  after[0].todos[1] = { ...after[0].todos[1], dueDate: '2026-10-20' }; // 기한 연장
  const withoutClosed = after.filter((c) => c.id !== 'c2'); // 사건 삭제
  const { changes, skipped } = planOverdueDeletion(withoutClosed, [], selection);
  assert.equal(skipped, 3);
  assert.deepEqual(changes.map((c) => c.removed.map((t) => t.id)), [[7]]);
});

test('id 가 같거나 없는 옛 할 일도 고른 것만 정확히 지운다', () => {
  const dup = { id: 'c9', title: '옛 사건', status: '진행중', todos: [
    { id: 1, text: '중복 id 앞', dueDate: '2026-09-01', done: false },
    { id: 1, text: '중복 id 뒤', dueDate: '2026-12-01', done: false },
    { text: 'id 없음', dueDate: '2026-09-02', done: false },
    { text: 'id 없음', dueDate: '2026-09-02', done: false },
  ] };
  const groups = collectOverdueTodos([dup], [], TODAY);
  assert.equal(groups[0].items.length, 3);
  assert.equal(new Set(groups[0].items.map((i) => i.key)).size, 3);
  const pick = groups[0].items.filter((i) => i.todo.text === '중복 id 앞' || i.key.endsWith('|0') && i.todo.text === 'id 없음');
  const { changes } = planOverdueDeletion([dup], [], pick);
  assert.deepEqual(changes[0].next.todos.map((t) => t.text), ['중복 id 뒤', 'id 없음']);
  const merged = applyCaseDiff(dup, diffCase(changes[0].base, changes[0].next));
  assert.deepEqual(merged.todos.map((t) => t.text).sort(), ['id 없음', '중복 id 뒤']);
});

test('되돌리기 기록은 최근 것만, 문서 크기 안에서 남긴다', () => {
  const { changes } = planOverdueDeletion(cases(), standalone(), collectOverdueTodos(cases(), standalone(), TODAY).flatMap((g) => g.items));
  const entry = buildCleanupEntry(changes, '2026-10-07T05:00:00.000Z');
  assert.equal(entry.items.length, 5);
  assert.deepEqual(entry.items[0], { caseId: 'c1', caseTitle: '강남연립 손해배상', todo: cases()[0].todos[0] });
  // Firestore 가 받지 않는 undefined 값은 기록에서 빠진다
  const odd = buildCleanupEntry([{ caseId: 'c1', caseTitle: 't', removed: [{ id: 1, text: 'x', doneAt: undefined }] }], 'a');
  assert.deepEqual(odd.items[0].todo, { id: 1, text: 'x' });

  let entries = [];
  for (let i = 0; i < 12; i++) entries = appendCleanupEntry(entries, { at: `2026-10-0${i % 9}T0${i % 10}:00:00Z#${i}`, items: [] }, { limit: 10 });
  assert.equal(entries.length, 10);
  const big = { at: 'z', items: [{ caseId: 'c1', todo: { text: 'x'.repeat(5000) } }] };
  const trimmed = appendCleanupEntry([{ at: 'a', items: [{ todo: { text: 'y'.repeat(5000) } }] }, { at: 'b', items: [] }], big, { maxBytes: 6000 });
  assert.deepEqual(trimmed.map((e) => e.at), ['b', 'z']);

  const log = [{ at: '2026-10-07T01:00:00Z', items: [] }, { at: '2026-10-07T03:00:00Z', items: [] }];
  assert.equal(lastActiveCleanup(log).at, '2026-10-07T03:00:00Z');
  const undone = markCleanupUndone(log, '2026-10-07T03:00:00Z', '2026-10-07T04:00:00Z');
  assert.equal(lastActiveCleanup(undone).at, '2026-10-07T01:00:00Z');
  assert.equal(lastActiveCleanup([]), null);
});

test('지운 Google 할 일은 동기화 때 다시 가져오지 않되, Google 쪽에서 기한을 바꾸면 다시 가져온다', () => {
  const entry = { at: '2026-10-07T05:00:00Z', items: [{ caseId: 'c1', todo: cases()[0].todos[6] }, { caseId: 'c1', todo: cases()[0].todos[0] }] };
  const records = hiddenTaskRecords(entry);
  assert.deepEqual(records, [{ id: 'gt1', due: '2026-09-30', updated: '2026-09-29T00:00:00.000Z', at: '2026-10-07T05:00:00Z' }]);

  const task = { id: 'gt1', title: 'Google 할 일', status: 'needsAction', due: '2026-09-30T00:00:00.000Z', updated: '2026-09-29T00:00:00.000Z' };
  assert.equal(isHiddenGoogleTask(task, records, new Set()), true);
  // Google 쪽에서 완료해도 다시 가져오지 않는다
  assert.equal(isHiddenGoogleTask({ ...task, status: 'completed', updated: '2026-10-08T00:00:00Z' }, records, new Set()), true);
  // 메모만 고친 경우(기한 그대로)도 숨긴다
  assert.equal(isHiddenGoogleTask({ ...task, notes: '추가', updated: '2026-10-08T00:00:00Z' }, records, new Set()), true);
  // 기한을 새로 잡으면 다시 가져온다
  assert.equal(isHiddenGoogleTask({ ...task, due: '2026-10-20T00:00:00.000Z', updated: '2026-10-08T00:00:00Z' }, records, new Set()), false);
  // 되살려서 앱에 연결돼 있으면 평소대로 동기화한다
  assert.equal(isHiddenGoogleTask(task, records, linkedTaskIds(cases(), [])), false);
  // 기록에 없는 할 일은 상관없다
  assert.equal(isHiddenGoogleTask({ ...task, id: 'other' }, records, new Set()), false);

  const merged = mergeHiddenTasks([{ id: 'old', due: '', at: 'x' }, { id: 'gt1', due: '2026-01-01', at: 'y' }], records);
  assert.deepEqual(merged.map((r) => [r.id, r.at]), [['old', 'x'], ['gt1', '2026-10-07T05:00:00Z']]);
  assert.deepEqual(unhideTasks(merged, ['gt1', 'old'], '2026-10-07T05:00:00Z').map((r) => r.id), ['old']);
});

test('되돌리기는 지운 할 일을 원래 자리(사건·일반 할 일)에 다시 넣고, 이미 있는 것은 넣지 않는다', () => {
  const all = cases();
  const sel = collectOverdueTodos(all, standalone(), TODAY).flatMap((g) => g.items);
  const del = planOverdueDeletion(all, standalone(), sel);
  const entry = buildCleanupEntry(del.changes, '2026-10-07T05:00:00Z');
  // 삭제가 반영된 지금 상태
  const nowCases = all.map((c) => del.changes.find((ch) => ch.caseId === c.id)?.next || c)
    .filter((c) => c.id !== 'c2'); // 그 뒤 종결 사건을 지웠다
  const nowStandalone = del.changes.find((ch) => ch.standalone).next.todos;
  // 그 사이 같은 Google 할 일이 다른 사건에 다시 연결된 경우
  nowCases[1] = { ...nowCases[1], todos: [{ id: 50, text: 'Google 할 일', calendarTaskId: 'gt1' }] };

  const undo = planCleanupUndo(nowCases, nowStandalone, entry);
  assert.equal(undo.missing, 1); // 종결 사건이 없어짐
  assert.equal(undo.present, 1); // gt1 은 이미 연결됨
  assert.deepEqual(undo.taskIds, ['gt1']); // 이미 앱에 있으므로 숨김을 푼다
  assert.deepEqual(undo.changes.map((c) => [c.caseId, c.restored.map((t) => t.id)]), [['c1', [1, 2]], [STANDALONE_TODOS_CASE_ID, [9]]]);
  const restored = applyCaseDiff(nowCases[0], diffCase(undo.changes[0].base, undo.changes[0].next));
  assert.deepEqual(restored.todos.map((t) => t.id).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
  // 두 번 되돌려도 더 늘지 않는다
  assert.equal(planCleanupUndo([restored, nowCases[1]], [], { items: entry.items.filter((i) => i.caseId === 'c1') }).changes.length, 0);
});
