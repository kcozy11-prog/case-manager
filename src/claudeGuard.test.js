import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveClaudeGuard, claudeLedgerEntries } from './claudeGuard.js';
import { applyCaseDiff, diffCase } from './caseMerge.js';

// 가공 자료만 쓴다.
const B = 'b1';
const todoItem = { id: `cl:${B}:i1`, done: false, text: '가공 할 일', details: '', priority: '보통', dueDate: '', claude: { batchId: B, itemId: 'i1', fp: 'aaaa0001' } };
const tlItem = { id: `cl:${B}:i2:tl`, date: '2026-10-17', content: '준비서면(2) 제출', activityType: 'document', claude: { batchId: B, itemId: 'i2', fp: 'aaaa0002' } };
const submitSet = { status: 'submitted', submittedDate: '2026-10-17', submitTimelineId: `cl:${B}:i2:tl`, claudeSubmit: { batchId: B, itemId: 'i2', fp: 'aaaa0002' } };

function guardedDiff() {
  return {
    set: {},
    arrays: {
      todos: { upserts: [{ key: `id:cl:${B}:i1`, items: [todoItem] }], removed: [] },
      timeline: { upserts: [{ key: `id:cl:${B}:i2:tl`, items: [tlItem] }], removed: [] },
      briefs: { upserts: [{ key: 'id:51', items: [{ id: 51, title: '준비서면(2)', status: 'pending', preparedDate: '2026-10-10', submittedDate: '', ...submitSet }] }], removed: [] },
    },
    claude: {
      batchId: B,
      items: [
        { itemId: 'i1', fp: 'aaaa0001', created: [{ field: 'todos', key: `id:cl:${B}:i1` }] },
        { itemId: 'i2', fp: 'aaaa0002', created: [{ field: 'timeline', key: `id:cl:${B}:i2:tl` }], briefPatch: { key: 'id:51', set: submitSet, fillDetails: '가공 메모' } },
      ],
    },
  };
}

function serverCase(extra = {}) {
  return {
    id: 'c1', title: '가공 사건',
    todos: [{ id: 41, text: '기존 할 일', done: false }],
    timeline: [], memos: [], hearings: [],
    briefs: [{ id: 51, title: '준비서면(2)', status: 'pending', preparedDate: '2026-10-10', submittedDate: '' }],
    ...extra,
  };
}

test('a diff without a guard passes through unchanged', () => {
  const d = { set: { title: 'x' }, arrays: {} };
  assert.equal(resolveClaudeGuard(serverCase(), d).diff, d);
});

test('fresh server: creates the items and patches only the submission fields of the latest brief', () => {
  const latest = serverCase({ briefs: [{ id: 51, title: '준비서면(2) 수정됨', status: 'pending', preparedDate: '2026-10-10', submittedDate: '', details: '' }] });
  const { applied, skipped } = resolveClaudeGuard(latest, guardedDiff());
  assert.deepEqual(applied, ['i1', 'i2']);
  assert.deepEqual(skipped, []);
  const merged = applyCaseDiff(latest, guardedDiff());
  assert.equal(merged.todos.length, 2);
  assert.equal(merged.timeline.length, 1);
  assert.equal(merged.briefs[0].title, '준비서면(2) 수정됨'); // 다른 기기에서 고친 제목 보존
  assert.equal(merged.timeline[0].content, '준비서면(2) 수정됨 제출'); // 진행경과도 지금 제목으로
  assert.equal(merged.briefs[0].status, 'submitted');
  assert.equal(merged.briefs[0].details, '가공 메모');
  assert.deepEqual(merged.briefs[0].claudeSubmit, submitSet.claudeSubmit);
});

test('an item already present on the server is not overwritten (edited on another device)', () => {
  const latest = serverCase({ todos: [{ ...todoItem, done: true, completedDate: '2026-10-18' }] });
  const merged = applyCaseDiff(latest, guardedDiff());
  const t = merged.todos.find((x) => x.id === todoItem.id);
  assert.equal(t.done, true);
  assert.equal(t.completedDate, '2026-10-18');
  assert.deepEqual(resolveClaudeGuard(latest, guardedDiff()).skipped, [{ itemId: 'i1', reason: 'present' }]);
});

test('items recorded in the ledger are not recreated after the user deleted them', () => {
  const latest = serverCase();
  const { diff, applied, skipped } = resolveClaudeGuard(latest, guardedDiff(), { skipItemIds: ['i1', 'i2'] });
  assert.deepEqual(applied, []);
  assert.deepEqual(skipped.map((s) => s.reason), ['ledger', 'ledger']);
  assert.deepEqual(applyCaseDiff(latest, diff), latest);
});

test('a brief submitted or deleted on another device is left alone, with no extra progress entry', () => {
  const submitted = serverCase({
    briefs: [{ id: 51, title: '준비서면(2)', status: 'submitted', submittedDate: '2026-10-16', submitTimelineId: 777 }],
    timeline: [{ id: 777, date: '2026-10-16', content: '준비서면(2) 제출', activityType: 'document' }],
  });
  const m1 = applyCaseDiff(submitted, guardedDiff());
  assert.deepEqual(m1.briefs, submitted.briefs);
  assert.deepEqual(m1.timeline, submitted.timeline);
  assert.equal(m1.todos.length, 2); // 다른 항목은 그대로 반영
  const deleted = serverCase({ briefs: [] });
  const m2 = applyCaseDiff(deleted, guardedDiff());
  assert.deepEqual(m2.briefs, []);
  assert.deepEqual(m2.timeline, []);
  assert.deepEqual(resolveClaudeGuard(deleted, guardedDiff()).skipped, [{ itemId: 'i2', reason: 'brief-missing' }]);
});

test('existing brief details are kept; applying twice is the same as once', () => {
  const latest = serverCase({ briefs: [{ id: 51, title: '준비서면(2)', status: 'pending', details: '기존 메모' }] });
  const once = applyCaseDiff(latest, guardedDiff());
  assert.equal(once.briefs[0].details, '기존 메모');
  assert.deepEqual(applyCaseDiff(once, guardedDiff()), once);
});

test('a brief added and then submitted by the same batch is saved, not lost', async () => {
  const { parseBatch, planBatch } = await import('./claudeInbox.js');
  const items = [
    { id: 'p1', cmCaseId: 'c1', caseNumber: '', op: 'brief.pending', title: '답변서', basis: '가공' },
    { id: 'p2', cmCaseId: 'c1', caseNumber: '', op: 'brief.submitted', title: '답변서', date: '2026-10-17', basis: '가공' },
  ];
  const b = parseBatch(JSON.stringify({ format: 'cm-update-v1', batchId: 'B2', items }));
  const base = { id: 'c1', title: '가공 사건', caseNumber: '', status: '진행중', briefs: [], timeline: [], memos: [], todos: [], hearings: [] };
  const [{ next, guard }] = planBatch(b, [base], ['p1', 'p2'], { today: '2026-10-17' });
  const diff = { ...diffCase(base, next), claude: guard };
  const r = resolveClaudeGuard(base, diff);
  assert.deepEqual(r.applied, ['p1', 'p2']);
  const merged = applyCaseDiff(base, diff);
  assert.equal(merged.briefs.length, 1);
  assert.equal(merged.briefs[0].status, 'submitted');
  assert.ok(merged.timeline.some((t) => t.id === 'cl:B2:p2:tl'));
  // 앞 항목(p1)이 반영 기록 때문에 빠지면 p2는 짝지을 서면이 없어 건너뛰고, 둘 다 반영됨으로 세지 않는다
  const r2 = resolveClaudeGuard(base, diff, { skipItemIds: ['p1'] });
  assert.deepEqual(r2.applied, []);
  assert.deepEqual(r2.skipped.map((s) => s.reason), ['ledger', 'brief-missing']);
  // 제출 처리(p2)만 건너뛰면 p1이 만든 서면은 제출대기로 남고, 제출 연결·표시가 붙지 않는다
  const r3 = resolveClaudeGuard(base, diff, { skipItemIds: ['p2'] });
  assert.deepEqual(r3.applied, ['p1']);
  const m3 = applyCaseDiff(base, r3.diff);
  assert.equal(m3.briefs.length, 1);
  assert.equal(m3.briefs[0].status, 'pending');
  assert.equal(m3.briefs[0].submitTimelineId, undefined);
  assert.equal(m3.briefs[0].claudeSubmit, undefined);
  assert.deepEqual(m3.timeline, []);
});

test('claudeLedgerEntries records applied and already-present items with their case, not conflicts', () => {
  const guard = guardedDiff().claude;
  assert.deepEqual(claudeLedgerEntries(guard, ['i2'], [{ itemId: 'i1', reason: 'present' }], 'c1'), {
    i1: { fp: 'aaaa0001', caseId: 'c1' }, i2: { fp: 'aaaa0002', caseId: 'c1' },
  });
  assert.deepEqual(claudeLedgerEntries(guard, [], [{ itemId: 'i2', reason: 'brief-submitted' }, { itemId: 'i1', reason: 'ledger' }], 'c1'), {});
});

test('the guarded diff has no effect on fields it does not name', () => {
  const latest = serverCase({ memos: [{ id: 9, title: '다른 기기 메모' }], status: '진행중' });
  const merged = applyCaseDiff(latest, guardedDiff());
  assert.deepEqual(merged.memos, latest.memos);
  assert.equal(merged.status, '진행중');
  assert.deepEqual(diffCase(latest, merged).set, {});
});

test('a submission linked to a drafting todo is skipped whole when the todo was deleted, finished, moved or reworded', () => {
  const tl = (suffix) => ({ id: `cl:${B}:i3:${suffix}`, date: '2026-10-16', content: suffix === 'tl' ? '답변서 제출' : '할 일 완료: 답변서 작성', claude: { batchId: B, itemId: 'i3', fp: 'aaaa0003' } });
  const todo = { id: 41, text: '답변서 작성', details: '', done: false };
  const set = { done: true, completedDate: '2026-10-16', completedTimelineId: `cl:${B}:i3:done`, briefId: `cl:${B}:i3` };
  const brief = { id: `cl:${B}:i3`, title: '답변서', status: 'submitted', preparedDate: '2026-10-16', submittedDate: '2026-10-16', fromTodoId: 41, submitTimelineId: `cl:${B}:i3:tl`, claude: { batchId: B, itemId: 'i3', fp: 'aaaa0003' } };
  const diff = () => ({
    set: {},
    arrays: {
      todos: { upserts: [{ key: 'id:41', items: [{ ...todo, ...set }] }], removed: [] },
      timeline: { upserts: [{ key: `id:cl:${B}:i3:done`, items: [tl('done')] }, { key: `id:cl:${B}:i3:tl`, items: [tl('tl')] }], removed: [] },
      briefs: { upserts: [{ key: `id:cl:${B}:i3`, items: [brief] }], removed: [] },
    },
    claude: {
      batchId: B,
      items: [{
        itemId: 'i3', fp: 'aaaa0003',
        created: [{ field: 'timeline', key: `id:cl:${B}:i3:done` }, { field: 'timeline', key: `id:cl:${B}:i3:tl` }, { field: 'briefs', key: `id:cl:${B}:i3` }],
        todoPatch: { key: 'id:41', set, prev: todo },
      }],
    },
  });
  const server = (todos, briefs = []) => serverCase({ todos, briefs });

  const fresh = server([todo]);
  const ok = resolveClaudeGuard(fresh, diff());
  assert.deepEqual(ok.applied, ['i3']);
  assert.deepEqual(applyCaseDiff(fresh, diff()).todos, [{ ...todo, ...set }]);

  for (const [latest, reason] of [
    [server([]), 'todo-missing'],
    [server([{ ...todo, done: true }]), 'todo-done'],
    [server([{ ...todo, briefId: 77 }], [{ id: 77, title: '답변서', status: 'pending' }]), 'todo-done'],
    [server([todo], [{ id: 78, title: '답변서', status: 'pending', fromTodoId: 41 }]), 'todo-done'],
    [server([{ ...todo, text: '답변서 작성(보충)' }]), 'todo-changed'],
  ]) {
    const r = resolveClaudeGuard(latest, diff());
    assert.deepEqual(r.applied, [], reason);
    assert.deepEqual(r.skipped, [{ itemId: 'i3', reason }], reason);
    assert.deepEqual(applyCaseDiff(latest, diff()), latest, reason); // 서면, 진행경과, 할 일 모두 그대로
    assert.deepEqual(claudeLedgerEntries(diff().claude, r.applied, r.skipped, 'c1'), {}, reason); // 반영 기록에도 적지 않음
  }
  // 반영 기록에 이미 있으면(사용자가 지운 서면) 할 일도 다시 완료하지 않는다
  const again = resolveClaudeGuard(fresh, diff(), { skipItemIds: ['i3'] });
  assert.deepEqual(applyCaseDiff(fresh, again.diff), fresh);
});
