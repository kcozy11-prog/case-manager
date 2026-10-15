import test from 'node:test';
import assert from 'node:assert/strict';
import { journalPendingTasks } from './journalTasks.js';
import { buildPendingTodos } from './statsTodos.js';

const J = (v) => JSON.stringify(v);

test('오늘 일지가 있으면 그 일지의 미완료 오늘 할 일·내일 할 일을 센다', () => {
  const entries = {
    '2026-10-15': {
      todayTasks: J([{ id: 'a', text: '기록 열람', dueDate: '2026-10-14' }, { id: 'b', text: '끝낸 일', done: true }]),
      tomorrowTasks: J([{ id: 'c', text: '준비서면 초안', cmCaseId: 'c1', cmCaseTitle: '강남연립' }, { id: 'd', text: '' }]),
    },
  };
  const tasks = journalPendingTasks(entries, '2026-10-15');
  assert.deepEqual(tasks.map((t) => [t.text, t.journalList]), [['기록 열람', 'today'], ['준비서면 초안', 'tomorrow']]);
  assert.equal(tasks[1].cmCaseId, 'c1');
});

test('오늘 일지가 없으면 직전 일지의 내일 할 일이 오늘 할 일로 이월된 것을 센다(업무일지 화면과 같은 기준)', () => {
  const entries = {
    '2026-10-13': { tomorrowTasks: J([{ id: 'x', text: '옛 일지 할 일' }]) },
    '2026-10-14': {
      todayTasks: J([{ id: 'y', text: '어제 오늘 할 일' }]),
      tomorrowTasks: J([{ id: 'z', text: '오늘로 이월될 일' }, { id: 'w', text: '완료한 내일 일', done: true }]),
    },
  };
  assert.deepEqual(journalPendingTasks(entries, '2026-10-15').map((t) => [t.text, t.journalList]), [['오늘로 이월될 일', 'today']]);
  assert.deepEqual(journalPendingTasks({}, '2026-10-15'), []);
});

test('앞선 날짜에 완료 기록이 있는(되살아난) 오늘 할 일은 세지 않는다', () => {
  const entries = {
    '2026-10-10': { todayTaskCompletions: J([{ id: 't1', text: '기록 열람', completedAt: '2026-10-10T01:00:00Z' }]) },
    '2026-10-15': { todayTasks: J([{ id: 't1', text: '기록 열람' }, { id: 't2', text: '새 할 일' }]) },
  };
  assert.deepEqual(journalPendingTasks(entries, '2026-10-15').map((t) => t.text), ['새 할 일']);
});

test('사건 화면 미완료 할 일에 업무일지 할 일이 함께 들어간다(기한순, 사건 연결 표시)', () => {
  const cases = [{ id: 'c1', title: '강남연립 손해배상', status: '진행중', todos: [{ id: 1, text: '사건 할 일', dueDate: '2026-10-20', done: false }] }];
  const journal = journalPendingTasks({
    '2026-10-15': {
      todayTasks: J([{ id: 'a', text: '일지 할 일', dueDate: '2026-10-14' }]),
      tomorrowTasks: J([{ id: 'b', text: '사건 연결 일지 할 일', cmCaseId: 'c1' }]),
    },
  }, '2026-10-15');
  const list = buildPendingTodos(cases, new Date('2026-10-15T09:00:00'), [], journal);
  assert.equal(list.length, 3);
  assert.deepEqual(list.map((t) => t.text), ['일지 할 일', '사건 할 일', '사건 연결 일지 할 일']);
  assert.equal(list[0].overdue, true);
  assert.equal(list[0].caseTitle, ''); // 사건이 없는 일지 할 일은 표시(sourceLabel)만 단다
  assert.equal(list[0].sourceLabel, '업무일지 · 오늘 할 일');
  assert.equal(list[2].caseTitle, '강남연립 손해배상');
  assert.equal(list[2].journal, true);
  // 업무일지 할 일을 넘기지 않으면 예전과 같다
  assert.equal(buildPendingTodos(cases, new Date('2026-10-15T09:00:00')).length, 1);
});
