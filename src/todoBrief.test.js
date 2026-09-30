import test from 'node:test';
import assert from 'node:assert/strict';
import { isBriefDraftingTodo, briefTitleFromTodoText, moveTodoToBrief } from './todoBrief.js';
import { markTodoPending, markBriefSubmitted } from './caseLink.js';

test('isBriefDraftingTodo: 서면류 + 작성 계열 동사가 함께 있을 때만 참', () => {
  assert.equal(isBriefDraftingTodo('피고 답변서 반박 준비서면 작성'), true);
  assert.equal(isBriefDraftingTodo('항소이유서 초안'), true);
  assert.equal(isBriefDraftingTodo('블랙박스 영상 분석 의견서 작성'), true);
  assert.equal(isBriefDraftingTodo('소장 수정'), true);
  assert.equal(isBriefDraftingTodo('위임장 작성 요청'), true);
  // 서면이 아니거나, 작성이 아닌 항목
  assert.equal(isBriefDraftingTodo('계약서 원본 수령'), false);
  assert.equal(isBriefDraftingTodo('피고 답변서 검토'), false);
  assert.equal(isBriefDraftingTodo('증거목록 정리'), false);
  assert.equal(isBriefDraftingTodo('증인 신청 여부 결정'), false);
  assert.equal(isBriefDraftingTodo('의뢰인 서명 받기'), false);
  assert.equal(isBriefDraftingTodo(''), false);
  assert.equal(isBriefDraftingTodo(undefined), false);
});

test('briefTitleFromTodoText: 끝의 작성 동사만 떼어 서면 제목을 만든다', () => {
  assert.equal(briefTitleFromTodoText('피고 답변서 반박 준비서면 작성'), '피고 답변서 반박 준비서면');
  assert.equal(briefTitleFromTodoText('항소이유서 초안 작성'), '항소이유서');
  assert.equal(briefTitleFromTodoText('의견서 작성하기'), '의견서');
  assert.equal(briefTitleFromTodoText('준비서면 2호 작성 완료'), '준비서면 2호');
  assert.equal(briefTitleFromTodoText('  소장   수정 '), '소장');
  // 동사가 끝에 없으면 원문 유지
  assert.equal(briefTitleFromTodoText('작성 중인 준비서면 검토'), '작성 중인 준비서면 검토');
  assert.equal(briefTitleFromTodoText(''), '');
});

const baseCase = () => ({
  id: 'c1', title: '아파트 분양대금 반환 청구',
  todos: [
    { id: 1, text: '피고 답변서 반박 준비서면 작성', details: '쟁점: 하자 여부', done: false, priority: '높음', dueDate: '2026-10-02' },
    { id: 2, text: '계약서 원본 수령', done: false, priority: '보통', dueDate: '' },
  ],
  briefs: [],
  timeline: [],
});

test('moveTodoToBrief: 할 일 완료 처리 + 제출대기 서면 생성 + 상호 연결', () => {
  let id = 100;
  const { caseObj, brief, created } = moveTodoToBrief(baseCase(), 1, '2026-09-30', () => id++);
  assert.equal(created, true);
  const todo = caseObj.todos.find((t) => t.id === 1);
  assert.equal(todo.done, true);
  assert.equal(todo.completedDate, '2026-09-30');
  assert.ok(todo.completedTimelineId, '완료 진행경과 id 보관');
  assert.equal(todo.briefId, brief.id);
  assert.equal(caseObj.briefs.length, 1);
  assert.equal(brief.title, '피고 답변서 반박 준비서면');
  assert.equal(brief.status, 'pending');
  assert.equal(brief.preparedDate, '2026-09-30');
  assert.equal(brief.submittedDate, '');
  assert.equal(brief.details, '쟁점: 하자 여부');
  assert.equal(brief.fromTodoId, 1);
  assert.ok(caseObj.timeline.some((t) => /할 일 완료: 피고 답변서 반박 준비서면 작성/.test(t.content)));
  // 다른 할 일은 그대로
  assert.equal(caseObj.todos.find((t) => t.id === 2).done, false);
});

test('moveTodoToBrief: 원본 불변, 없는 할 일은 무변경', () => {
  const src = baseCase();
  moveTodoToBrief(src, 1, '2026-09-30', () => 1);
  assert.equal(src.todos[0].done, false);
  assert.equal(src.briefs.length, 0);
  const r = moveTodoToBrief(src, 999, '2026-09-30', () => 1);
  assert.equal(r.created, false);
  assert.equal(r.brief, null);
  assert.equal(r.caseObj, src);
});

test('moveTodoToBrief: 같은 할 일을 다시 옮겨도 서면이 중복되지 않는다', () => {
  let id = 100;
  const first = moveTodoToBrief(baseCase(), 1, '2026-09-30', () => id++).caseObj;
  const second = moveTodoToBrief(first, 1, '2026-10-01', () => id++);
  assert.equal(second.created, false);
  assert.equal(second.caseObj.briefs.length, 1);
  assert.equal(second.brief.id, first.briefs[0].id);
  assert.equal(second.caseObj.timeline.length, first.timeline.length, '완료 진행경과도 중복 없음');
});

test('markTodoPending: 되돌리면 아직 제출 전인 연결 서면만 제거하고 제출된 서면은 남긴다', () => {
  let id = 100;
  const moved = moveTodoToBrief(baseCase(), 1, '2026-09-30', () => id++).caseObj;
  const reverted = markTodoPending(moved, 1);
  assert.equal(reverted.todos.find((t) => t.id === 1).done, false);
  assert.equal(reverted.todos.find((t) => t.id === 1).briefId, '');
  assert.equal(reverted.briefs.length, 0, '미제출 서면은 제거');
  assert.equal(reverted.timeline.length, 0, '완료 진행경과도 제거');

  const submitted = markBriefSubmitted(moved, moved.briefs[0].id, '2026-10-03', () => id++);
  const revertedAfterSubmit = markTodoPending(submitted, 1);
  assert.equal(revertedAfterSubmit.briefs.length, 1, '제출된 서면은 보존');
  assert.equal(revertedAfterSubmit.briefs[0].status, 'submitted');
});
