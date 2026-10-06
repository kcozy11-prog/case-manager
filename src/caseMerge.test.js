import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stableStringify, itemKey, diffItems, applyItemsDiff, diffCase, applyCaseDiff, isEmptyCaseDiff,
  normalizeCaseDoc, countCaseDiffChanges,
} from './caseMerge.js';

const baseCase = () => ({
  id: 'c1', title: '강남연립 손해배상', status: '진행중', type: '민사',
  retainer: { amount: '330', paidAmount: '' },
  hearings: [{ id: 1, date: '2026-10-20', type: '변론기일' }],
  timeline: [{ id: 10, date: '2026-09-01', content: '소장 접수' }],
  memos: [],
  todos: [{ id: 100, text: '준비서면 작성', done: false }],
  briefs: [],
});

test('키 순서가 달라도 같은 값으로 본다', () => {
  assert.equal(stableStringify({ a: 1, b: [1, { y: 2, x: 1 }] }), stableStringify({ b: [1, { x: 1, y: 2 }], a: 1 }));
  assert.notEqual(stableStringify({ a: 1 }), stableStringify({ a: 2 }));
});

test('항목 키는 id 우선, id 가 없으면 내용', () => {
  assert.equal(itemKey({ id: 5, text: 'a' }), 'id:5');
  assert.equal(itemKey({ id: '5' }), 'id:5');
  assert.equal(itemKey({ text: 'a' }), itemKey({ text: 'a' }));
  assert.notEqual(itemKey({ text: 'a' }), itemKey({ text: 'b' }));
});

test('다른 기기에서 추가한 진행경과는 내 수정 저장 후에도 남는다 (덮어쓰기 방지 핵심)', () => {
  const base = baseCase();
  // 내 화면: 할 일 하나를 완료 처리
  const mine = { ...base, todos: base.todos.map((t) => ({ ...t, done: true })) };
  // 그 사이 서버: 다른 기기가 진행경과를 추가
  const server = { ...base, timeline: [...base.timeline, { id: 11, date: '2026-10-06', content: '강남연립 현장 확인' }] };
  const merged = applyCaseDiff(server, diffCase(base, mine));
  assert.equal(merged.todos[0].done, true, '내 변경 반영');
  assert.deepEqual(merged.timeline.map((t) => t.id), [10, 11], '다른 기기 변경 보존');
});

test('옛 판본으로 시작한 기기의 저장이 최신 서버 내용을 지우지 않는다', () => {
  const stale = baseCase();
  const server = {
    ...stale,
    timeline: [...stale.timeline, { id: 12, date: '2026-09-25', content: '준비서면 제출' }],
    briefs: [{ id: 200, title: '준비서면', status: 'submitted', submittedDate: '2026-09-25' }],
  };
  // 옛 캐시 화면에서 기일 메모만 고침
  const edited = { ...stale, hearings: stale.hearings.map((h) => ({ ...h, memo: '증인 확인' })) };
  const merged = applyCaseDiff(server, diffCase(stale, edited));
  assert.equal(merged.hearings[0].memo, '증인 확인');
  assert.equal(merged.timeline.length, 2);
  assert.equal(merged.briefs[0].status, 'submitted', '제출완료 상태가 제출대기로 되돌아가지 않는다');
});

test('삭제는 그 항목만 지우고, 같은 diff 를 두 번 적용해도 결과가 같다', () => {
  const base = baseCase();
  const next = { ...base, timeline: [], todos: [...base.todos, { id: 101, text: '증거 정리', done: false }] };
  const diff = diffCase(base, next);
  const server = { ...base, timeline: [...base.timeline, { id: 13, date: '2026-10-01', content: '다른 기기 기록' }] };
  const once = applyCaseDiff(server, diff);
  const twice = applyCaseDiff(once, diff);
  assert.deepEqual(once.timeline.map((t) => t.id), [13]);
  assert.deepEqual(once.todos.map((t) => t.id), [100, 101]);
  assert.equal(stableStringify(once), stableStringify(twice));
});

test('바뀐 필드만 덮어쓰고, 수정본에 없는 필드는 지우지 않는다', () => {
  const base = baseCase();
  const next = { ...base, status: '종결', retainer: { ...base.retainer, paidAmount: '330' } };
  const diff = diffCase(base, next);
  assert.deepEqual(Object.keys(diff.set).sort(), ['retainer', 'status']);
  assert.deepEqual(diff.arrays, {});
  const server = { ...base, title: '강남연립 손해배상(본소)', closeResult: '' };
  const merged = applyCaseDiff(server, diff);
  assert.equal(merged.title, '강남연립 손해배상(본소)', '다른 곳에서 고친 제목 보존');
  assert.equal(merged.status, '종결');
  // 필드가 빠진 객체로 저장해도 서버의 배열이 사라지지 않는다
  const partial = { id: 'c1', title: base.title };
  assert.ok(isEmptyCaseDiff(diffCase(base, partial)));
  assert.deepEqual(applyCaseDiff(server, diffCase(base, partial)).timeline, server.timeline);
});

test('변경이 없으면 빈 diff', () => {
  const base = baseCase();
  const copy = JSON.parse(JSON.stringify(base));
  assert.ok(isEmptyCaseDiff(diffCase(base, copy)));
  assert.equal(countCaseDiffChanges(diffCase(base, copy)), 0);
  assert.ok(isEmptyCaseDiff(null));
});

test('기존 항목 수정은 서버 배열의 제자리에서 교체되고, 새 항목은 끝에 붙는다', () => {
  const base = { id: 'c', todos: [{ id: 1, text: 'a' }, { id: 2, text: 'b' }] };
  const next = { id: 'c', todos: [{ id: 1, text: 'a2' }, { id: 2, text: 'b' }, { id: 3, text: 'c' }] };
  const server = { id: 'c', todos: [{ id: 0, text: 'z' }, { id: 1, text: 'a' }, { id: 2, text: 'b' }] };
  assert.deepEqual(applyCaseDiff(server, diffCase(base, next)).todos.map((t) => t.text), ['z', 'a2', 'b', 'c']);
});

test('id 가 중복된 옛 데이터도 묶음 단위로 안전하게 처리한다', () => {
  const base = { id: 'c', memos: [{ id: 7, title: 'x' }, { id: 7, title: 'y' }] };
  const next = { id: 'c', memos: [{ id: 7, title: 'x' }] };
  const d = diffItems(base.memos, next.memos);
  assert.equal(d.upserts.length, 1);
  assert.deepEqual(applyItemsDiff(base.memos, d), [{ id: 7, title: 'x' }]);
});

test('id 없는 항목은 내용으로 식별한다', () => {
  const base = { id: 'c', documents: [{ name: '계약서.pdf' }] };
  const next = { id: 'c', documents: [{ name: '계약서.pdf' }, { name: '내용증명.pdf' }] };
  const server = { id: 'c', documents: [{ name: '계약서.pdf' }, { name: '다른 기기.pdf' }] };
  assert.deepEqual(applyCaseDiff(server, diffCase(base, next)).documents.map((d) => d.name), ['계약서.pdf', '다른 기기.pdf', '내용증명.pdf']);
});

test('서버 문서에 배열이 없어도 diff 를 얹을 수 있다', () => {
  const base = { id: 'c', title: 't' };
  const next = { id: 'c', title: 't', briefs: [{ id: 1, title: '답변서' }] };
  assert.deepEqual(applyCaseDiff({ id: 'c', title: 't' }, diffCase(base, next)).briefs, [{ id: 1, title: '답변서' }]);
});

test('옛 memo 문자열 문서를 memos 배열로 맞춘다', () => {
  assert.deepEqual(normalizeCaseDoc({ id: 'c', memo: '옛 메모' }, '2026-10-06').memos,
    [{ id: 1, category: '일반메모', title: '메모', content: '옛 메모', date: '2026-10-06' }]);
  assert.deepEqual(normalizeCaseDoc({ id: 'c' }).memos, []);
  const withMemos = { id: 'c', memos: [{ id: 2 }] };
  assert.deepEqual(normalizeCaseDoc(withMemos).memos, [{ id: 2 }]);
});
