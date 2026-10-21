import test from 'node:test';
import assert from 'node:assert/strict';
import {
  carryForwardTasks, carryForwardTomorrowTasks, findStaleCarriedTodayTasks, dropResurrectedTodayTasks,
  diffResolvedItems, createTaskCompletion, mergeCompletions, pruneCompletionsForActive,
} from './journalLogic.js';

const J = (v) => JSON.stringify(v);

test('할 일 하나로 합친 뒤: 직전 일지의 미완료 할 일과 예전 내일 할 일을 함께 이월한다', () => {
  const entries = {
    '2026-10-20': {
      todayTasks: J([
        { id: 'a', text: '의견서 초안', dueDate: '2026-10-25' },
        { id: 'b', text: '끝낸 일', done: true },
        { id: 'c', text: '기록 열람', sourceDate: '2026-10-18' },
      ]),
      tomorrowTasks: J([{ id: 'd', text: '인지 계산' }, { id: 'e', text: '의견서 초안' }]),
    },
  };
  const carried = carryForwardTasks(entries, '2026-10-21');
  assert.deepEqual(carried.map((i) => i.id), ['a', 'c', 'd']); // 기한 있는 것 먼저, 같은 문구(e)는 한 번만
  assert.equal(carried[0].sourceDate, '2026-10-20');
  assert.equal(carried[1].sourceDate, '2026-10-18'); // 처음 적은 날을 지킨다
  assert.ok(carried.every((i) => !i.done));
  // 예전 함수(내일 할 일만 이월)는 그대로
  assert.deepEqual(carryForwardTomorrowTasks(entries, '2026-10-21').map((i) => i.id), ['d', 'e']);
});

test('기한을 단 할 일은 그날까지 매일 따라오고, 체크하면 다음 날부터 따라오지 않는다', () => {
  const day1 = { todayTasks: J([{ id: 'a', text: '의견서 초안', dueDate: '2026-10-23' }]) };
  const d2Items = carryForwardTasks({ '2026-10-21': day1 }, '2026-10-22');
  assert.deepEqual(d2Items.map((i) => i.id), ['a']);
  // 10-22 에 저장(미완료) → 10-23 에도 따라온다
  const entries = { '2026-10-21': day1, '2026-10-22': { todayTasks: J(d2Items) } };
  assert.deepEqual(carryForwardTasks(entries, '2026-10-23').map((i) => i.id), ['a']);
  // 10-23 에 체크 → 10-24 에는 없다
  const resolved = diffResolvedItems(d2Items, d2Items.map((i) => ({ ...i, done: true })));
  const completions = mergeCompletions('', resolved.map((i) => createTaskCompletion(i, '2026-10-23T01:00:00Z')));
  entries['2026-10-23'] = { todayTasks: J(d2Items.map((i) => ({ ...i, done: true }))), todayTaskCompletions: completions };
  assert.deepEqual(carryForwardTasks(entries, '2026-10-24'), []);
});

test('삭제한 할 일은 완료 기록으로 막혀 되살아나지 않는다(직전 일지 목록에 다시 섞여 들어가도)', () => {
  const resolved = diffResolvedItems([{ id: 'a', text: '기록 열람' }], []);
  const entries = {
    '2026-10-19': { todayTaskCompletions: mergeCompletions('', resolved.map((i) => createTaskCompletion(i, '2026-10-19T01:00:00Z'))) },
    // 오래된 기기 사본으로 다시 섞여 저장된 직전 일지
    '2026-10-20': { todayTasks: J([{ id: 'a', text: '기록 열람' }]) },
  };
  assert.deepEqual(carryForwardTasks(entries, '2026-10-21'), []);
  // 화면 로드 때 쓰는 되살아남 정리도 그대로 거둔다
  assert.deepEqual(dropResurrectedTodayTasks(entries, '2026-10-20', [{ id: 'a', text: '기록 열람' }]).dropped.map((i) => i.id), ['a']);
});

test('같은 문구를 다시 적은 반복 할 일(새 id)은 예전 완료 기록에 막히지 않는다', () => {
  const entries = {
    '2026-10-01': { todayTaskCompletions: J([{ id: 'old', text: '주간 기록 확인', completedAt: '2026-10-01T01:00:00Z' }]) },
    '2026-10-20': { todayTasks: J([{ id: 'new', text: '주간 기록 확인' }]) },
  };
  assert.deepEqual(carryForwardTasks(entries, '2026-10-21').map((i) => i.id), ['new']);
});

test('체크를 되돌리면 완료 기록이 회수되어 다시 이월된다', () => {
  const done = J([{ id: 'a', text: '기록 열람', completedAt: 'x' }]);
  const pruned = pruneCompletionsForActive(done, [{ id: 'a', text: '기록 열람', done: false }]);
  const entries = { '2026-10-20': { todayTasks: J([{ id: 'a', text: '기록 열람' }]), todayTaskCompletions: pruned } };
  assert.deepEqual(carryForwardTasks(entries, '2026-10-21').map((i) => i.id), ['a']);
});

test('그날 일지에 이미 있는 할 일은 다시 받지 않는다', () => {
  const entries = {
    '2026-10-20': { todayTasks: J([{ id: 'a', text: '기록 열람' }, { id: 'b', text: '새 일' }]) },
    '2026-10-21': { todayTasks: J([{ id: 'a', text: '기록 열람' }]) },
  };
  assert.deepEqual(carryForwardTasks(entries, '2026-10-21').map((i) => i.id), ['a', 'b']);
  assert.deepEqual(carryForwardTasks({}, '2026-10-21'), []);
});

test('매일 이월된 할 일은 옛 항목(되살아난 것)으로 보지 않고, 직전 일지에 없던 옛 항목만 알린다', () => {
  const entries = {
    '2026-10-20': { todayTasks: J([{ id: 'a', text: '의견서 초안', sourceDate: '2026-10-15' }]) },
  };
  const items = [
    { id: 'a', text: '의견서 초안', sourceDate: '2026-10-15' },
    { id: 'z', text: '석 달 전 할 일', sourceDate: '2026-07-01' },
  ];
  assert.deepEqual(findStaleCarriedTodayTasks(entries, '2026-10-21', items).map((i) => i.id), ['z']);
});
