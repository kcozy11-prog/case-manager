import test from 'node:test';
import assert from 'node:assert/strict';
import { syncEventsWithCases, mergeCalendarEventIntoCase } from './calendarSync.js';
import {
  CONSULT_KEYWORDS, isConsultSummary, consultFromEvent, consultPatch, consultsForDate,
  caseTitleFromConsult, buildCaseFromConsult,
} from './consultations.js';

const lbox = (over) => ({ _src: 'LBOX', start: { dateTime: '2026-10-23T14:00:00+09:00' }, ...over });

test('상담 낱말은 「상담」·「미팅」 두 개다(2026. 10. 21. 변호사 확정, 「식사」 등은 넣지 않음)', () => {
  assert.deepEqual(CONSULT_KEYWORDS, ['상담', '미팅']);
  assert.equal(isConsultSummary('홍길동 상담'), true);
  assert.equal(isConsultSummary('홍길동 미팅'), true);
  assert.equal(isConsultSummary('홍길동 식사'), false);
  assert.equal(isConsultSummary('홍길동 식사', ['식사']), true);
});

test('사건번호 없는 상담 일정은 수동 확인 목록 대신 상담 일정으로 돌려준다', () => {
  const events = [
    lbox({ id: 'ev-c1', summary: '홍길동 상담', location: '사무실' }),
    lbox({ id: 'ev-m1', summary: '김영희 식사' }),
  ];
  const r = syncEventsWithCases(events, [], { today: '2026-10-21' });
  assert.deepEqual(r.consultEvents.map((c) => c.id), ['ev-c1']);
  assert.deepEqual(r.unmatchedEvents.map((e) => e.id), ['ev-m1']);
  assert.equal(r.consultEvents[0].date, '2026-10-23');
  assert.equal(r.consultEvents[0].time, '14:00');
  assert.equal(r.consultEvents[0].location, '사무실');
  assert.equal(r.updates.size, 0);
});

test('사건번호가 있는 일정은 제목에 상담이 있어도 상담 일정으로 빼지 않는다', () => {
  const events = [lbox({ id: 'ev-x', summary: '박제군, 변론, 수원지방법원-2026가단999999 상담실' })];
  const r = syncEventsWithCases(events, [], { today: '2026-10-21' });
  assert.equal(r.consultEvents.length, 0);
  assert.equal(r.unmatchedEvents.length, 1);
});

test('「상담(사건 없음)으로 두기」로 고른 일정은 다음 동기화부터 상담 일정으로 간다', () => {
  const events = [lbox({ id: 'ev-m1', summary: '김영희 식사' })];
  const r = syncEventsWithCases(events, [], { today: '2026-10-21', consultEventIds: new Set(['ev-m1']) });
  assert.deepEqual(r.consultEvents.map((c) => c.id), ['ev-m1']);
  assert.equal(r.unmatchedEvents.length, 0);
});

test('사건에 연결된 일정과 다시 보지 않기 일정은 상담으로 잡지 않는다', () => {
  const cases = [{ id: 'c1', title: '홍길동 사건', caseNumber: '', hearings: [{ id: 1, date: '2026-10-23', type: '기일', calendarEventId: 'ev-c1' }], memos: [], timeline: [] }];
  const events = [lbox({ id: 'ev-c1', summary: '홍길동 상담' }), lbox({ id: 'ev-c2', summary: '이몽룡 상담' })];
  const r = syncEventsWithCases(events, cases, { today: '2026-10-21', ignoredEventIds: new Set(['ev-c2']) });
  assert.equal(r.consultEvents.length, 0);
  assert.equal(r.unmatchedEvents.length, 0);
  assert.equal(r.ignoredCount, 1);
});

test('id 없는 일정은 상담으로 두지 못하므로 수동 확인 목록에 남는다', () => {
  assert.equal(consultFromEvent({ summary: '홍길동 상담' }), null);
  const r = syncEventsWithCases([lbox({ summary: '홍길동 상담' })], [], { today: '2026-10-21' });
  assert.equal(r.consultEvents.length, 0);
  assert.equal(r.unmatchedEvents.length, 1);
});

test('동기화 patch 는 새 일정은 통째로, 있던 일정은 바뀐 일정 칸만 넣고 메모·연결 사건은 건드리지 않는다', () => {
  const now = '2026-10-21T00:00:00.000Z';
  const existing = {
    a: { id: 'a', summary: '홍길동 상담', date: '2026-10-23', time: '14:00', location: '', start: { dateTime: '2026-10-23T14:00:00+09:00' }, memo: '메모', caseId: 'c9', source: 'auto' },
    b: { id: 'b', summary: '이몽룡 상담', date: '2026-10-24', time: '', location: '', start: { date: '2026-10-24' }, source: 'auto' },
  };
  const incoming = [
    { id: 'a', summary: '홍길동 상담', date: '2026-10-23', time: '15:00', location: '', start: { dateTime: '2026-10-23T15:00:00+09:00' } },
    { id: 'b', summary: '이몽룡 상담', date: '2026-10-24', time: '', location: '', start: { date: '2026-10-24' } },
    { id: 'c', summary: '성춘향 상담', date: '2026-10-25', time: '', location: '', start: { date: '2026-10-25' } },
  ];
  const patch = consultPatch(existing, incoming, { now });
  assert.deepEqual(Object.keys(patch).sort(), ['a', 'c']);
  assert.deepEqual(patch.a, { time: '15:00', start: { dateTime: '2026-10-23T15:00:00+09:00' }, updatedAt: now });
  assert.equal(patch.c.source, 'auto');
  assert.equal(patch.c.createdAt, now);
  assert.equal('memo' in patch.a, false);
  assert.equal('caseId' in patch.a, false);
  // 수동으로 고르면 source 를 manual 로 바꾼다
  assert.deepEqual(consultPatch(existing, [incoming[1]], { now, source: 'manual' }), { b: { source: 'manual', updatedAt: now } });
});

test('그 날짜 상담 일정은 시각 순(시각 없는 것은 뒤)', () => {
  const items = {
    a: { id: 'a', summary: 'A 상담', date: '2026-10-23', time: '' },
    b: { id: 'b', summary: 'B 상담', date: '2026-10-23', time: '09:30' },
    c: { id: 'c', summary: 'C 상담', date: '2026-10-24', time: '10:00' },
    d: { id: 'd', summary: 'D 상담', date: '2026-10-23', time: '13:00', dismissed: true },
  };
  assert.deepEqual(consultsForDate(items, '2026-10-23').map((c) => c.id), ['b', 'a']);
  assert.deepEqual(consultsForDate(null, '2026-10-23'), []);
});

test('사건 만들기: 제목은 상담 낱말을 걷고, 메모는 진행경과로, 앞날 상담은 기일로 연결한다', () => {
  assert.equal(caseTitleFromConsult('홍길동 상담'), '홍길동');
  assert.equal(caseTitleFromConsult('홍길동 미팅'), '홍길동');
  assert.equal(caseTitleFromConsult('[상담]'), '[상담]');
  const baseCase = { id: 'cNew', title: '', hearings: [], timeline: [], memos: [] };
  let n = 0;
  const makeId = () => ++n;
  const future = buildCaseFromConsult(
    { id: 'ev-c1', summary: '홍길동 상담', date: '2026-10-23', time: '14:00', start: { dateTime: '2026-10-23T14:00:00+09:00' }, memo: '임대차 보증금 반환 문의' },
    { baseCase, today: '2026-10-21', makeId, mergeEvent: mergeCalendarEventIntoCase },
  );
  assert.equal(future.id, 'cNew');
  assert.equal(future.title, '홍길동');
  assert.equal(future.timeline[0].content, '상담 14:00: 홍길동 상담');
  assert.equal(future.timeline[0].detail, '임대차 보증금 반환 문의');
  assert.equal(future.timeline[0].activityType, 'meeting');
  assert.equal(future.hearings.length, 1);
  assert.equal(future.hearings[0].calendarEventId, 'ev-c1');
  assert.equal(future.hearings[0].date, '2026-10-23');
  // 다음 동기화 때 같은 일정은 이 사건에 연결된 것으로 보고 상담으로 다시 잡지 않는다
  const r = syncEventsWithCases([lbox({ id: 'ev-c1', summary: '홍길동 상담' })], [future], { today: '2026-10-21' });
  assert.equal(r.consultEvents.length, 0);
  assert.equal(r.unmatchedEvents.length, 0);

  const past = buildCaseFromConsult({ id: 'ev-c2', summary: '이몽룡 상담', date: '2026-10-20', start: { date: '2026-10-20' } },
    { baseCase, today: '2026-10-21', makeId, mergeEvent: mergeCalendarEventIntoCase });
  assert.equal(past.hearings.length, 0);
  assert.equal(past.timeline.length, 1);
  assert.equal('detail' in past.timeline[0], false);
  assert.equal(baseCase.timeline.length, 0); // 원본 불변
});
