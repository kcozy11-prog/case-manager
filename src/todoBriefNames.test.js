import test from 'node:test';
import assert from 'node:assert/strict';
import { hasBriefDocName, isBriefDraftingTodo, isUnrecognizedBriefTodo } from './todoBrief.js';
import { validateBatch } from './claudeInbox.js';

// 2026. 10. 21. 변경: 「서」·「장」으로 끝나는 말을 모두 서면 이름으로 보지 않고 확인된 서면 이름만 인정한다.

test('「저장」「보장」 같은 일반 낱말은 서면 이름이 아니다', () => {
  for (const t of [
    '카톡의 구역모임 녹음 m4a 2개와 사진 원본 저장',
    '보장 내용 확인', '입장 정리', '시장 조사', '현장 사진 정리', '출장 일정 수정', '주장 정리 수정',
    '법원에서 온 서류 수정', '연구소장 면담 일정 수정', '자료 받아서 정리',
  ]) {
    assert.equal(hasBriefDocName(t), false, t);
    assert.equal(isUnrecognizedBriefTodo(t), false, t);
    assert.equal(isBriefDraftingTodo(t), false, t);
  }
});

test('예전에 인식되던 서면 작성 할 일은 그대로 인식한다', () => {
  for (const t of [
    '증인 신청서 작성', '준비서면(3) 작성', '고소장 초안', '소장 수정', '위임장 작성 요청', '항소이유서 초안',
    '피고 답변서 반박 준비서면 작성', '블랙박스 영상 분석 의견서 작성', '사실확인서 작성', '탄원서 초안',
    '내용증명 작성', '참고서면 보완', '진술서 수정', '반소장 작성', '고발장 기안', '문서송부촉탁신청서 작성',
  ]) {
    assert.equal(isBriefDraftingTodo(t), true, t);
  }
  assert.equal(isUnrecognizedBriefTodo('답변서 제출'), true);
  assert.equal(isUnrecognizedBriefTodo('준비서면(3)'), true);
});

test('Claude 반영: 서면 이름이 아닌 할 일에는 「서면 작성 할 일로 인식되지 않음」 경고를 내지 않는다', () => {
  const cases = [{ id: 'c1', title: '가공 사건', status: '진행중', caseNumber: '2026가단10000', hearings: [], timeline: [], memos: [], todos: [], briefs: [] }];
  const item = (id, text) => ({ id, op: 'todo', cmCaseId: 'c1', caseNumber: '2026가단10000', basis: '가공', text });
  const r = validateBatch({ format: 'cm-update-v1', batchId: 'b-names', items: [
    item('t1', '카톡의 구역모임 녹음 m4a 2개와 사진 원본 저장'),
    item('t2', '답변서 제출'),
  ] }, cases, null, { today: '2026-10-21' });
  const warn = /서면 작성 할 일로 인식되지 않음/;
  assert.equal(r.items[0].status, 'ok');
  assert.ok(!r.items[0].warnings.some((w) => warn.test(w)));
  assert.ok(r.items[1].warnings.some((w) => warn.test(w)));
});
