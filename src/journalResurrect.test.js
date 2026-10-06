import test from 'node:test';
import assert from 'node:assert/strict';
import {
  carryForwardPendingDocs,
  createPendingDocCompletion,
  createDelegatedCompletion,
  createTaskCompletion,
  dropResurrectedPendingDocs,
  dropResurrectedDelegatedTasks,
  dropResurrectedTodayTasks,
} from './journalLogic.js';

const J = (v) => JSON.stringify(v);

// 실제 사례 재현: 7월에 적은 '기문물산 준비서면'을 8. 20. 삭제(완료 기록) →
// 오래된 캐시(8. 19.까지)만 가진 기기가 10. 6. 이월을 계산 → 되살아난 항목이 10. 6. 일지에 저장됨
const KIMUN = { id: 'd1', text: '기문물산 민사준비서면 초안', dueDate: '2026-06-29', done: false };
const fullEntries = () => ({
  '2026-07-21': { pendingDocItems: J([KIMUN]) },
  '2026-08-19': { pendingDocItems: J([{ ...KIMUN, sourceDate: '2026-07-21' }]) },
  '2026-08-20': {
    pendingDocItems: J([]),
    pendingDocCompletions: J([createPendingDocCompletion({ ...KIMUN, sourceDate: '2026-07-21' }, '2026-08-20T01:00:00Z', '2026-07-21')]),
  },
});

test('오래된 캐시로 계산하면 이미 처리한 서면이 되살아난다 (문제 재현)', () => {
  const stale = { '2026-07-21': fullEntries()['2026-07-21'], '2026-08-19': fullEntries()['2026-08-19'] };
  assert.deepEqual(carryForwardPendingDocs(stale, '2026-10-06').map((i) => i.text), ['기문물산 민사준비서면 초안']);
  // 서버 판본(완료 기록 포함)으로 계산하면 되살아나지 않는다
  assert.deepEqual(carryForwardPendingDocs(fullEntries(), '2026-10-06'), []);
});

test('되살아나 저장된 서면은 앞선 날짜의 완료 기록으로 거둔다', () => {
  const entries = {
    ...fullEntries(),
    '2026-10-06': { pendingDocItems: J([{ ...KIMUN, sourceDate: '2026-07-21' }, { id: 'n1', text: '고무순 소장', dueDate: '2026-10-09' }]) },
  };
  const items = JSON.parse(entries['2026-10-06'].pendingDocItems);
  const { items: kept, dropped } = dropResurrectedPendingDocs(entries, '2026-10-06', items);
  assert.deepEqual(kept.map((i) => i.id), ['n1']);
  assert.deepEqual(dropped.map((i) => i.id), ['d1']);
});

test('id 가 바뀐 채 이월된 옛 항목도 내용·기한·출처일로 알아본다', () => {
  const entries = fullEntries();
  const items = [{ id: 'random-new-id', text: '기문물산 민사준비서면 초안', dueDate: '2026-06-29', sourceDate: '2026-07-21' }];
  assert.equal(dropResurrectedPendingDocs(entries, '2026-10-06', items).dropped.length, 1);
});

test('그날 새로 만든 같은 이름의 서면, 완료 기록이 그날 이후인 항목은 건드리지 않는다', () => {
  const entries = fullEntries();
  // 같은 이름이라도 출처일(그날)이 다르면 새 항목
  const fresh = [{ id: 'x', text: '기문물산 민사준비서면 초안', dueDate: '2026-06-29' }];
  assert.equal(dropResurrectedPendingDocs(entries, '2026-10-06', fresh).dropped.length, 0);
  // 8. 20. 완료 기록은 8. 19. 목록에는 적용하지 않는다(그날보다 앞선 기록만)
  const aug19 = [{ ...KIMUN, sourceDate: '2026-07-21' }];
  assert.equal(dropResurrectedPendingDocs(entries, '2026-08-19', aug19).dropped.length, 0);
  // 이미 체크(완료)된 항목은 그대로 둔다
  const done = [{ ...KIMUN, sourceDate: '2026-07-21', done: true }];
  assert.equal(dropResurrectedPendingDocs(entries, '2026-10-06', done).dropped.length, 0);
});

test('완료 기록이 하나도 없으면 목록을 그대로 돌려준다', () => {
  const items = [{ id: 'a', text: 'x' }];
  assert.deepEqual(dropResurrectedPendingDocs({}, '2026-10-06', items), { items, dropped: [] });
  assert.deepEqual(dropResurrectedPendingDocs({}, '2026-10-06', undefined), { items: [], dropped: [] });
});

test('위임 업무도 출처일까지 같은 완료 기록이 있을 때만 거둔다', () => {
  const task = { id: 'g1', text: '등기부 발급', assignee: '김주임', dueDate: '2026-09-10', sourceDate: '2026-09-01' };
  const entries = {
    '2026-09-05': { delegatedCompletions: J([createDelegatedCompletion(task, '2026-09-05T01:00:00Z', '2026-09-01')]) },
  };
  assert.equal(dropResurrectedDelegatedTasks(entries, '2026-10-06', [task]).dropped.length, 1);
  // 같은 내용이라도 새로 맡긴 업무(출처일 다름)는 둔다
  const again = { ...task, id: 'g2', sourceDate: '2026-10-06' };
  assert.equal(dropResurrectedDelegatedTasks(entries, '2026-10-06', [again]).dropped.length, 0);
});

test('오늘 할 일은 id 와 내용이 모두 같을 때만 거둔다 (반복 업무 보호)', () => {
  const entries = {
    '2026-09-10': { todayTaskCompletions: J([createTaskCompletion({ id: 't1', text: '기록 열람' }, '2026-09-10T01:00:00Z')]) },
  };
  const items = [
    { id: 't1', text: '기록 열람', sourceDate: '2026-09-09' }, // 되살아난 항목
    { id: 't9', text: '기록 열람' }, // 같은 이름의 새 업무
  ];
  const { items: kept, dropped } = dropResurrectedTodayTasks(entries, '2026-10-06', items);
  assert.deepEqual(dropped.map((i) => i.id), ['t1']);
  assert.deepEqual(kept.map((i) => i.id), ['t9']);
});

// 9. 4. 이후 실제 데이터 모양: 새 날짜에 이월이 안 되던 동안 날마다 그날 서면만 적었다.
// 9. 14. 예다인 → 9. 15. 목록에 없음(완료 기록도 없음) … 이런 항목이 나중에 한꺼번에 되살아나면 안 된다.
import { carryForwardTomorrowTasks, latestEntryDateBefore, findStaleCarriedPendingDocs, findStaleCarriedTodayTasks } from './journalLogic.js';

const SEPT = {
  '2026-09-14': { pendingDocItems: J([{ id: 'y1', text: '예다인디앤씨 준비서면', dueDate: '2026-09-15' }]) },
  '2026-09-15': { pendingDocItems: J([{ id: 'm1', text: '마케팅 용역비 준비서면', dueDate: '2026-09-16' }]) },
  '2026-09-21': { pendingDocItems: J([{ id: 'g1', text: '고무순 소장', dueDate: '2026-10-09' }]), tomorrowTasks: J([{ id: 'tt', text: '기록 복사 신청' }]) },
};

test('이월은 가장 최근에 저장한 일지에서만 받는다 (그 전 목록에서 빠진 항목은 되살리지 않음)', () => {
  assert.equal(latestEntryDateBefore(SEPT, '2026-10-06'), '2026-09-21');
  assert.equal(latestEntryDateBefore(SEPT, '2026-09-14'), null);
  assert.deepEqual(carryForwardPendingDocs(SEPT, '2026-10-06').map((i) => i.text), ['고무순 소장']);
  assert.equal(carryForwardPendingDocs(SEPT, '2026-10-06')[0].sourceDate, '2026-09-21');
  assert.deepEqual(carryForwardTomorrowTasks(SEPT, '2026-10-06').map((i) => i.text), ['기록 복사 신청']);
});

test('저장된 일지에 섞여 든 옛 항목(직전 일지에 없던 것)을 찾아 보여 준다', () => {
  const entries = {
    ...SEPT,
    // 예전 방식으로 9. 14.·9. 15. 항목이 되살아나 저장된 오늘 일지
    '2026-10-06': { pendingDocItems: J([
      { id: 'y1', text: '예다인디앤씨 준비서면', dueDate: '2026-09-15', sourceDate: '2026-09-14' },
      { id: 'm1', text: '마케팅 용역비 준비서면', dueDate: '2026-09-16', sourceDate: '2026-09-15' },
      { id: 'g1', text: '고무순 소장', dueDate: '2026-10-09', sourceDate: '2026-09-21' },
      { id: 'n9', text: '오늘 새로 적은 서면' },
    ]) },
  };
  const items = JSON.parse(entries['2026-10-06'].pendingDocItems);
  assert.deepEqual(findStaleCarriedPendingDocs(entries, '2026-10-06', items).map((i) => i.id), ['y1', 'm1']);
  // 직전 일지에서 정상으로 이어받은 것, 오늘 적은 것, 이미 체크한 것은 대상이 아니다
  assert.deepEqual(findStaleCarriedPendingDocs(entries, '2026-10-06', [{ ...items[0], done: true }]), []);
  assert.deepEqual(findStaleCarriedPendingDocs({}, '2026-10-06', items), []);
  const tasks = [{ id: 'a', text: '옛 할 일', sourceDate: '2026-09-10' }, { id: 'b', text: '어제 적은 할 일', sourceDate: '2026-09-21' }];
  assert.deepEqual(findStaleCarriedTodayTasks(entries, '2026-10-06', tasks).map((t) => t.id), ['a']);
});
