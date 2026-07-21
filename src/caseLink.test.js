import test from 'node:test';
import assert from 'node:assert/strict';
import {
  upsertTimelineEntry,
  upsertCaseMemo,
  upsertBrief,
  buildCallTimelineContent,
  computeRetainerPayups,
  markBriefSubmitted,
  markBriefPending,
  markTodoDone,
  markTodoPending,
} from './caseLink.js';

// ── upsertTimelineEntry ──────────────────────────────────────────────
test('upsertTimelineEntry appends a new entry when id is unseen', () => {
  const c = { id: 'c1', timeline: [{ id: 1, date: '2026-01-01', content: '수임' }] };
  const out = upsertTimelineEntry(c, { id: 2, date: '2026-02-01', content: '소장 접수' });
  assert.equal(out.timeline.length, 2);
  assert.deepEqual(out.timeline[1], { id: 2, date: '2026-02-01', content: '소장 접수' });
});

test('upsertTimelineEntry replaces date/content of an existing id (no duplicate)', () => {
  const c = { id: 'c1', timeline: [{ id: 7, date: '2026-01-01', content: '초안' }] };
  const out = upsertTimelineEntry(c, { id: 7, date: '2026-01-02', content: '최종본' });
  assert.equal(out.timeline.length, 1);
  assert.deepEqual(out.timeline[0], { id: 7, date: '2026-01-02', content: '최종본' });
});

test('upsertTimelineEntry stores optional detail memo', () => {
  const c = { id: 'c1', timeline: [] };
  const out = upsertTimelineEntry(c, { id: 3, date: '2026-02-01', content: '준비서면 초안', detail: '쟁점별 증거 보강 필요' });
  assert.deepEqual(out.timeline[0], { id: 3, date: '2026-02-01', content: '준비서면 초안', detail: '쟁점별 증거 보강 필요' });
});

test('upsertTimelineEntry handles a case with no timeline array', () => {
  const c = { id: 'c1' };
  const out = upsertTimelineEntry(c, { id: 1, date: '2026-01-01', content: 'x' });
  assert.equal(out.timeline.length, 1);
});

test('upsertTimelineEntry does not mutate the input case', () => {
  const c = { id: 'c1', timeline: [{ id: 1, date: '2026-01-01', content: 'a' }] };
  const before = JSON.stringify(c);
  upsertTimelineEntry(c, { id: 2, date: '2026-02-01', content: 'b' });
  assert.equal(JSON.stringify(c), before);
});

// ── upsertCaseMemo ───────────────────────────────────────────────────
test('upsertCaseMemo appends a new memo by id', () => {
  const c = { id: 'c1', memos: [] };
  const out = upsertCaseMemo(c, { id: 5, category: '의뢰인요청', title: '계약서', content: '원본', date: '2026-02-01' });
  assert.equal(out.memos.length, 1);
  assert.equal(out.memos[0].category, '의뢰인요청');
});

test('upsertCaseMemo replaces an existing memo with the same id', () => {
  const c = { id: 'c1', memos: [{ id: 5, category: '의뢰인요청', title: '구', content: '구내용', date: '2026-02-01' }] };
  const out = upsertCaseMemo(c, { id: 5, category: '의뢰인요청', title: '신', content: '신내용', date: '2026-02-02' });
  assert.equal(out.memos.length, 1);
  assert.equal(out.memos[0].title, '신');
  assert.equal(out.memos[0].content, '신내용');
});

// ── upsertBrief ──────────────────────────────────────────────────────
test('upsertBrief appends a pending brief when id is unseen', () => {
  const c = { id: 'c1', briefs: [] };
  const out = upsertBrief(c, { id: 9, title: '준비서면 2호', preparedDate: '2026-03-01' });
  assert.equal(out.briefs.length, 1);
  assert.deepEqual(out.briefs[0], { id: 9, title: '준비서면 2호', status: 'pending', preparedDate: '2026-03-01', submittedDate: '' });
});

test('upsertBrief updates title but preserves submitted status on re-send', () => {
  const c = { id: 'c1', briefs: [{ id: 9, title: '준비서면 2호', status: 'submitted', preparedDate: '2026-03-01', submittedDate: '2026-03-05' }] };
  const out = upsertBrief(c, { id: 9, title: '준비서면 2호(수정)', preparedDate: '2026-03-01' });
  assert.equal(out.briefs.length, 1);
  assert.equal(out.briefs[0].title, '준비서면 2호(수정)');
  assert.equal(out.briefs[0].status, 'submitted');
  assert.equal(out.briefs[0].submittedDate, '2026-03-05');
});

test('upsertBrief stores and updates optional details memo', () => {
  const c = { id: 'c1', briefs: [] };
  const once = upsertBrief(c, { id: 9, title: '준비서면 2호', preparedDate: '2026-03-01', details: '증거 3호 첨부 확인' });
  assert.equal(once.briefs[0].details, '증거 3호 첨부 확인');
  const twice = upsertBrief(once, { id: 9, title: '준비서면 2호', preparedDate: '2026-03-01', details: '청구취지 수정 확인' });
  assert.equal(twice.briefs[0].details, '청구취지 수정 확인');
});

// ── buildCallTimelineContent ─────────────────────────────────────────
test('buildCallTimelineContent joins title and detail with a dash', () => {
  assert.equal(buildCallTimelineContent({ title: '의뢰인 통화', detail: '합의 의향 확인' }), '[통화/상담] 의뢰인 통화 — 합의 의향 확인');
});

test('buildCallTimelineContent omits the dash when there is no detail', () => {
  assert.equal(buildCallTimelineContent({ title: '의뢰인 통화', detail: '' }), '[통화/상담] 의뢰인 통화');
});

test('buildCallTimelineContent uses detail alone when there is no title', () => {
  assert.equal(buildCallTimelineContent({ title: '', detail: '상대방 연락' }), '[통화/상담] 상대방 연락');
});

// ── computeRetainerPayups ────────────────────────────────────────────
test('computeRetainerPayups marks unpaid cases as fully paid', () => {
  const cases = [{ id: 'c1', retainer: { amount: 3000000, paidAmount: '' } }];
  const out = computeRetainerPayups(cases);
  assert.equal(out.length, 1);
  assert.equal(out[0].retainer.paidAmount, 3000000);
});

test('computeRetainerPayups coerces string amounts and fills partial payments', () => {
  const cases = [{ id: 'c1', retainer: { amount: '5000000', paidAmount: 2000000 } }];
  const out = computeRetainerPayups(cases);
  assert.equal(out.length, 1);
  assert.equal(out[0].retainer.paidAmount, '5000000');
});

test('computeRetainerPayups skips fully paid and zero/empty amount cases', () => {
  const cases = [
    { id: 'c1', retainer: { amount: 3000000, paidAmount: 3000000 } }, // 완납
    { id: 'c2', retainer: { amount: '', paidAmount: '' } },           // 약정 없음
    { id: 'c3', retainer: { amount: 0, paidAmount: 0 } },             // 0원
  ];
  assert.equal(computeRetainerPayups(cases).length, 0);
});

test('computeRetainerPayups returns only changed cases and does not mutate input', () => {
  const cases = [
    { id: 'c1', retainer: { amount: 3000000, paidAmount: '' } },
    { id: 'c2', retainer: { amount: 2000000, paidAmount: 2000000 } },
  ];
  const before = JSON.stringify(cases);
  const out = computeRetainerPayups(cases);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'c1');
  assert.equal(JSON.stringify(cases), before);
});

test('computeRetainerPayups preserves other retainer fields', () => {
  const cases = [{ id: 'c1', retainer: { amount: 3000000, paidAmount: '', date: '2026-01-15', successFee: '10%' } }];
  const out = computeRetainerPayups(cases);
  assert.equal(out[0].retainer.date, '2026-01-15');
  assert.equal(out[0].retainer.successFee, '10%');
});

test('markBriefSubmitted: 진행경과에 "{제목} 제출" 자동 추가 + 서면 상태 갱신', () => {
  const c = { id: 'c1', briefs: [{ id: 'b1', title: '준비서면 2호', status: 'pending', preparedDate: '2026-06-20', submittedDate: '' }], timeline: [] };
  const out = markBriefSubmitted(c, 'b1', '2026-06-24', () => 999);
  const b = out.briefs.find(x => x.id === 'b1');
  assert.equal(b.status, 'submitted');
  assert.equal(b.submittedDate, '2026-06-24');
  assert.equal(b.submitTimelineId, 999);
  assert.equal(out.timeline.length, 1);
  assert.deepEqual(out.timeline[0], { id: 999, date: '2026-06-24', content: '준비서면 2호 제출' });
});

test('markBriefSubmitted: 재호출해도 진행경과 중복 없음(submitTimelineId 재사용)', () => {
  const c = { id: 'c1', briefs: [{ id: 'b1', title: '답변서', status: 'pending', submittedDate: '' }], timeline: [] };
  const once = markBriefSubmitted(c, 'b1', '2026-06-24', () => 111);
  const twice = markBriefSubmitted(once, 'b1', '2026-06-25', () => 222);
  assert.equal(twice.timeline.length, 1);
  assert.equal(twice.timeline[0].id, 111);
});

test('markBriefPending: 연결된 진행경과 항목 제거 + 서면 필드 비움', () => {
  const submitted = markBriefSubmitted(
    { id: 'c1', briefs: [{ id: 'b1', title: '답변서', status: 'pending', submittedDate: '' }], timeline: [{ id: 'keep', date: '2026-06-01', content: '기존 기록' }] },
    'b1', '2026-06-24', () => 555,
  );
  const out = markBriefPending(submitted, 'b1');
  const b = out.briefs.find(x => x.id === 'b1');
  assert.equal(b.status, 'pending');
  assert.equal(b.submittedDate, '');
  assert.equal(b.submitTimelineId, '');
  assert.deepEqual(out.timeline.map(t => t.id), ['keep']);
});

test('markBriefPending: submitTimelineId 없으면 timeline 변경 없음', () => {
  const c = { id: 'c1', briefs: [{ id: 'b1', title: 'x', status: 'submitted', submittedDate: '2026-06-24' }], timeline: [{ id: 't1', date: '2026-06-01', content: 'a' }] };
  const out = markBriefPending(c, 'b1');
  assert.deepEqual(out.timeline.map(t => t.id), ['t1']);
});

test('mark* : 없는 briefId면 원본 그대로', () => {
  const c = { id: 'c1', briefs: [], timeline: [] };
  assert.equal(markBriefSubmitted(c, 'nope', '2026-06-24'), c);
  assert.equal(markBriefPending(c, 'nope'), c);
});

test('markTodoDone: 할 일 완료 체크 시 진행경과에 자동 기록하고 todo에 연결 id를 보관', () => {
  const c = {
    id: 'c1',
    todos: [{ id: 'todo1', text: '준비서면 초안 작성', details: '쟁점별 증거 정리', done: false }],
    timeline: [{ id: 'keep', date: '2026-06-01', content: '기존 기록' }],
  };

  const out = markTodoDone(c, 'todo1', '2026-06-24', () => 777);
  const todo = out.todos.find(x => x.id === 'todo1');

  assert.equal(todo.done, true);
  assert.equal(todo.completedDate, '2026-06-24');
  assert.equal(todo.completedTimelineId, 777);
  assert.deepEqual(out.timeline.map(t => t.id), ['keep', 777]);
  assert.deepEqual(out.timeline[1], {
    id: 777,
    date: '2026-06-24',
    content: '할 일 완료: 준비서면 초안 작성',
    detail: '쟁점별 증거 정리',
  });
});

test('markTodoDone: 이미 연결된 완료 진행경과가 있으면 중복 생성하지 않음', () => {
  const c = {
    id: 'c1',
    todos: [{ id: 'todo1', text: '답변서 제출', done: true, completedTimelineId: 111 }],
    timeline: [{ id: 111, date: '2026-06-20', content: '할 일 완료: 답변서 제출' }],
  };

  const out = markTodoDone(c, 'todo1', '2026-06-24', () => 222);

  assert.equal(out, c);
  assert.equal(out.timeline.length, 1);
});

test('markTodoPending: 완료 체크 취소 시 연결된 진행경과 항목 제거', () => {
  const c = {
    id: 'c1',
    todos: [{ id: 'todo1', text: '자료 제출', done: true, completedDate: '2026-06-24', completedTimelineId: 999 }],
    timeline: [
      { id: 'keep', date: '2026-06-01', content: '기존 기록' },
      { id: 999, date: '2026-06-24', content: '할 일 완료: 자료 제출' },
    ],
  };

  const out = markTodoPending(c, 'todo1');
  const todo = out.todos.find(x => x.id === 'todo1');

  assert.equal(todo.done, false);
  assert.equal(todo.completedDate, '');
  assert.equal(todo.completedTimelineId, '');
  assert.deepEqual(out.timeline.map(t => t.id), ['keep']);
});
