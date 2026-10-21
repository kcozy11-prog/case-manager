import test from 'node:test';
import assert from 'node:assert/strict';
import { dueBadge, dateKeyDiff, addDaysToKey, splitDelegatedForDisplay, frequentAssignees, DEFAULT_ASSIGNEE } from './journalView.js';

const J = (v) => JSON.stringify(v);

test('위임 업무 배지는 확인일 기준이다(위임일부터 지난 날수가 아님)', () => {
  // 10-14 위임, 확인일 10-28 → 10-21 에는 D-7 (예전 화면은 D+7)
  assert.deepEqual(dueBadge('2026-10-28', '2026-10-21'), { text: 'D-7', tone: 'slate' });
  assert.deepEqual(dueBadge('2026-10-22', '2026-10-21'), { text: 'D-1', tone: 'amber' });
  assert.deepEqual(dueBadge('2026-10-21', '2026-10-21'), { text: '오늘', tone: 'amber' });
  assert.deepEqual(dueBadge('2026-10-18', '2026-10-21'), { text: '3일 지남', tone: 'red' });
  assert.deepEqual(dueBadge('', '2026-10-21'), { text: '확인일 없음', tone: 'slate' });
});

test('날짜 키 계산은 월말·연말을 넘어도 맞다', () => {
  assert.equal(dateKeyDiff('2026-10-31', '2026-11-01'), 1);
  assert.equal(dateKeyDiff('2026-12-31', '2027-01-02'), 2);
  assert.equal(addDaysToKey('2026-10-31', 1), '2026-11-01');
  assert.equal(addDaysToKey('2026-03-01', -1), '2026-02-28');
  assert.equal(dateKeyDiff('', '2026-11-01'), null);
});

test('위임 업무는 미완료(확인일 빠른 순, 없는 것은 뒤)와 완료로 나눈다', () => {
  const { pending, done } = splitDelegatedForDisplay([
    { id: 'a', text: '송달 신청', dueDate: '2026-10-28' },
    { id: 'b', text: '기록 복사', dueDate: '' },
    { id: 'c', text: '인지대 납부', dueDate: '2026-10-22' },
    { id: 'd', text: '끝난 일', done: true },
    { id: 'e', text: '' },
  ]);
  assert.deepEqual(pending.map((i) => i.id), ['c', 'a', 'b']);
  assert.deepEqual(done.map((i) => i.id), ['d']);
});

test('자주 쓴 담당자: 기본 담당자가 첫째, 나머지는 많이 쓴 순', () => {
  const entries = {
    '2026-10-01': { delegatedItems: J([{ text: 'a', assignee: '사무장' }, { text: 'b', assignee: '정실장' }]) },
    '2026-10-02': { delegatedItems: J([{ text: 'c', assignee: '사무장' }, { text: 'd', assignee: ' 김주임 ' }, { text: 'e', assignee: '' }]) },
    '2026-10-03': { delegatedItems: 'not json' },
  };
  assert.deepEqual(frequentAssignees(entries), [DEFAULT_ASSIGNEE, '사무장', '김주임']);
  assert.deepEqual(frequentAssignees({}), ['정실장']);
  assert.deepEqual(frequentAssignees(entries, { limit: 2 }), ['정실장', '사무장']);
});
