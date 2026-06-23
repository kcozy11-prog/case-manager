import test from 'node:test';
import assert from 'node:assert/strict';
import {
  diffResolvedItems,
  createTaskCompletion,
  carryForwardTomorrowTasks,
  carryForwardPendingDocs,
  createPendingDocCompletion,
  mergeCompletions,
  pruneCompletionsForActive,
} from './journalLogic.js';

// ── diffResolvedItems: 체크(done) 또는 삭제된 항목을 골라낸다 ──────────────────
test('diffResolvedItems picks items that just became done', () => {
  const prev = [{ id: 'a', text: '준비서면', done: false }, { id: 'b', text: '답변서', done: false }];
  const next = [{ id: 'a', text: '준비서면', done: true }, { id: 'b', text: '답변서', done: false }];
  const resolved = diffResolvedItems(prev, next);
  assert.deepEqual(resolved.map((i) => i.id), ['a']);
  assert.equal(resolved[0].done, true);
});

test('diffResolvedItems picks items that were removed', () => {
  const prev = [{ id: 'a', text: '준비서면', done: false }, { id: 'b', text: '답변서', done: false }];
  const next = [{ id: 'b', text: '답변서', done: false }];
  const resolved = diffResolvedItems(prev, next);
  assert.deepEqual(resolved.map((i) => i.id), ['a']);
});

test('diffResolvedItems ignores unchanged or newly added items', () => {
  const prev = [{ id: 'a', text: '준비서면', done: false }];
  const next = [{ id: 'a', text: '준비서면', done: false }, { id: 'c', text: '신규', done: false }];
  assert.deepEqual(diffResolvedItems(prev, next), []);
});

test('createTaskCompletion records id, text and completedAt', () => {
  const rec = createTaskCompletion({ id: 'a', text: ' 국민은행 준비서면 ', done: true }, '2026-06-22T01:00:00.000Z');
  assert.equal(rec.id, 'a');
  assert.equal(rec.text, '국민은행 준비서면');
  assert.equal(rec.completedAt, '2026-06-22T01:00:00.000Z');
});

// ── 핵심 회귀 방지: 체크/삭제한 항목이 다음 날 carry-forward로 되살아나면 안 됨 ──

test('carryForwardTomorrowTasks does not revive a today-task once it is completed on a later day', () => {
  // Day1: 내일 할 일에 "국민은행 준비서면" 입력 → Day2 오늘 할 일로 이월됨
  // Day2: 이월된 항목을 체크(done) → todayTaskCompletions 기록
  const resolved = diffResolvedItems(
    [{ id: 't1', text: '국민은행 준비서면', done: false, sourceDate: '2026-06-20' }],
    [{ id: 't1', text: '국민은행 준비서면', done: true, sourceDate: '2026-06-20' }],
  );
  const completions = resolved.map((i) => createTaskCompletion(i, '2026-06-21T01:00:00.000Z'));

  const entries = {
    '2026-06-20': { tomorrowTasks: JSON.stringify([{ id: 't1', text: '국민은행 준비서면', done: false }]) },
    '2026-06-21': {
      todayTasks: JSON.stringify([{ id: 't1', text: '국민은행 준비서면', done: true, sourceDate: '2026-06-20' }]),
      todayTaskCompletions: JSON.stringify(completions),
    },
  };
  // Day3: 더 이상 보이면 안 됨
  assert.deepEqual(carryForwardTomorrowTasks(entries, '2026-06-22').map((i) => i.text), []);
});

test('carryForwardTomorrowTasks does not revive a today-task that was deleted on a later day', () => {
  const resolved = diffResolvedItems(
    [{ id: 't1', text: '국민은행 준비서면', done: false, sourceDate: '2026-06-20' }],
    [],
  );
  const completions = resolved.map((i) => createTaskCompletion(i, '2026-06-21T01:00:00.000Z'));
  const entries = {
    '2026-06-20': { tomorrowTasks: JSON.stringify([{ id: 't1', text: '국민은행 준비서면', done: false }]) },
    '2026-06-21': {
      todayTasks: JSON.stringify([]),
      todayTaskCompletions: JSON.stringify(completions),
    },
  };
  assert.deepEqual(carryForwardTomorrowTasks(entries, '2026-06-22').map((i) => i.text), []);
});

test('carryForwardTomorrowTasks still carries genuinely unfinished tasks', () => {
  const entries = {
    '2026-06-20': { tomorrowTasks: JSON.stringify([{ id: 't1', text: '국민은행 준비서면', done: false }]) },
  };
  assert.deepEqual(carryForwardTomorrowTasks(entries, '2026-06-22').map((i) => i.text), ['국민은행 준비서면']);
});

// ── 제출 예정 서면: 같은 시나리오를 createPendingDocCompletion 으로 ──────────────

test('checking a carried pending-doc records a completion that suppresses re-carry', () => {
  const resolved = diffResolvedItems(
    [{ id: 'p1', text: '국민은행 준비서면', done: false, sourceDate: '2026-06-20' }],
    [{ id: 'p1', text: '국민은행 준비서면', done: true, sourceDate: '2026-06-20' }],
  );
  const completions = resolved.map((i) => createPendingDocCompletion(i, '2026-06-21T01:00:00.000Z', i.sourceDate));
  const entries = {
    '2026-06-20': { pendingDocItems: JSON.stringify([{ id: 'p1', text: '국민은행 준비서면', done: false }]) },
    '2026-06-21': {
      pendingDocItems: JSON.stringify([]),
      pendingDocCompletions: JSON.stringify(completions),
    },
  };
  assert.deepEqual(carryForwardPendingDocs(entries, '2026-06-22').map((i) => i.text), []);
});

// ── 체크 후 다시 체크 해제(uncheck)하면 완료 기록을 회수해 다시 이월되게 ──────────
test('un-checking an item retracts its completion so it carries forward again', () => {
  const item = (done) => ({ id: 'p1', text: '국민은행 준비서면', done, sourceDate: '2026-06-20' });

  // 1) 체크 → 완료 기록 추가
  let completions = mergeCompletions('', diffResolvedItems([item(false)], [item(true)])
    .map((i) => createPendingDocCompletion(i, '2026-06-21T01:00:00.000Z', i.sourceDate)));
  assert.equal(JSON.parse(completions).length, 1);

  // 2) 체크 해제 → 현재 활성(미완료) 항목의 완료 기록은 회수
  const active = [item(false)];
  completions = pruneCompletionsForActive(
    mergeCompletions(completions, diffResolvedItems([item(true)], active)
      .map((i) => createPendingDocCompletion(i, '2026-06-21T02:00:00.000Z', i.sourceDate))),
    active,
  );
  assert.deepEqual(JSON.parse(completions), []);

  // 3) 다음 날 다시 이월되어야 함
  const entries = {
    '2026-06-20': { pendingDocItems: JSON.stringify([item(false)]) },
    '2026-06-21': { pendingDocItems: JSON.stringify(active), pendingDocCompletions: completions },
  };
  assert.deepEqual(carryForwardPendingDocs(entries, '2026-06-22').map((i) => i.text), ['국민은행 준비서면']);
});

// ── mergeCompletions: 누적 + 중복 제거 ──────────────────────────────────────
test('mergeCompletions appends new records and de-duplicates', () => {
  const prevStr = JSON.stringify([{ id: 'a', text: '준비서면' }]);
  const merged = mergeCompletions(prevStr, [
    { id: 'a', text: '준비서면' },          // 중복 → 무시
    { id: 'b', text: '답변서' },            // 신규 → 추가
  ]);
  const arr = JSON.parse(merged);
  assert.deepEqual(arr.map((r) => r.id), ['a', 'b']);
});
