import test from 'node:test';
import assert from 'node:assert/strict';
import { briefTitleFromTodoText, moveTodoToBrief } from './todoBrief.js';
import { validateBatch, planBatch } from './claudeInbox.js';

// 2026. 10. 21. 변경: 끝의 작성 계열 동사 다섯 가지(작성, 초안, 기안, 수정, 보완)를 같은 방식으로 떼고, 이어지면 모두 뗀다.

test('끝의 작성·초안·기안·수정·보완을 모두 같은 방식으로 뗀다', () => {
  assert.equal(briefTitleFromTodoText('고소장 초안'), '고소장');
  assert.equal(briefTitleFromTodoText('준비서면(2) 초안'), '준비서면(2)');
  assert.equal(briefTitleFromTodoText('답변서 기안'), '답변서');
  assert.equal(briefTitleFromTodoText('의견서 보완'), '의견서');
  assert.equal(briefTitleFromTodoText('증인 신청서 작성'), '증인 신청서');
  assert.equal(briefTitleFromTodoText('소장 수정'), '소장');
  assert.equal(briefTitleFromTodoText('고소장 초안 완료'), '고소장');
});

test('작성 계열 동사가 이어지면 모두 뗀다', () => {
  assert.equal(briefTitleFromTodoText('의견서 초안 작성'), '의견서');
  assert.equal(briefTitleFromTodoText('준비서면 수정 보완'), '준비서면');
  assert.equal(briefTitleFromTodoText('탄원서 초안 작성하기'), '탄원서');
});

test('제목 가운데 낱말과 동사만 있는 문구는 그대로 둔다', () => {
  assert.equal(briefTitleFromTodoText('답변서 수정본 검토 의견서 작성'), '답변서 수정본 검토 의견서');
  assert.equal(briefTitleFromTodoText('작성 중인 준비서면 검토'), '작성 중인 준비서면 검토');
  assert.equal(briefTitleFromTodoText('초안 작성'), '초안 작성'); // 다 떼면 빈 제목이므로 원래 문구
});

test('할 일 탭: 「고소장 초안」을 완료하면 제출대기 서면 제목은 「고소장」', () => {
  const c = { id: 'c1', todos: [{ id: 7, text: '고소장 초안', done: false }], briefs: [], timeline: [] };
  const { brief } = moveTodoToBrief(c, 7, '2026-10-21', () => 99);
  assert.equal(brief.title, '고소장');
});

test('Claude 반영: 「고소장」 제출이 「고소장 초안」 할 일과 이어진다', () => {
  const cases = [{
    id: 'c1', title: '가공 고소 사건', status: '진행중', caseNumber: '2026고소1',
    hearings: [], timeline: [], memos: [], briefs: [],
    todos: [{ id: 42, text: '고소장 초안', details: '', priority: '보통', dueDate: '', done: false }],
  }];
  const b = { format: 'cm-update-v1', batchId: 'b-title', items: [
    { id: 's1', op: 'brief.submitted', cmCaseId: 'c1', caseNumber: '2026고소1', basis: '가공', title: '고소장', date: '2026-10-21' },
  ] };
  const r = validateBatch(b, cases, null, { today: '2026-10-21' }).items[0];
  assert.deepEqual(r.notes, ['같은 제목의 서면 작성 할 일을 완료 처리하고 제출함']);
  const [{ next }] = planBatch(b, cases, ['s1'], { today: '2026-10-21' });
  const todo = next.todos.find((t) => t.id === 42);
  assert.equal(todo.done, true);
  assert.equal(todo.briefId, 'cl:b-title:s1');
  const brief = next.briefs.find((x) => x.id === 'cl:b-title:s1');
  assert.equal(brief.title, '고소장');
  assert.equal(brief.status, 'submitted');
});
