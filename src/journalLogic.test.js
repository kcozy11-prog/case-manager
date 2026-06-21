import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseChecklistItems,
  serializeChecklistItems,
  carryForwardTomorrowTasks,
  carryForwardPendingDocs,
  sortDelegatedTasks,
  buildLearnedTopicGroups,
  filterLearnedItemsByTopic,
  searchLearnedItems,
  buildLearnedArchiveStats,
  chooseNewerEntry,
  mergeEntryMapsBySavedAt,
  createSubmittedDocItem,
  normalizeSubmittedDocItem,
  collectVisibleSubmittedDocs,
  buildSubmittedDocProgressContent,
} from './journalLogic.js';

test('carryForwardTomorrowTasks moves unchecked tomorrow tasks into today tasks', () => {
  const entries = {
    '2026-04-14': {
      tomorrowTasks: JSON.stringify([
        { id: 'a', text: '준비서면 검토', done: false },
        { id: 'b', text: '의뢰인 통화', done: true },
      ]),
      todayTasks: JSON.stringify([]),
    },
    '2026-04-15': {
      todayTasks: JSON.stringify([{ id: 'c', text: '기존 오늘 할 일', done: false }]),
    },
  };

  const merged = carryForwardTomorrowTasks(entries, '2026-04-15');

  assert.deepEqual(merged.map((item) => item.text), ['기존 오늘 할 일', '준비서면 검토']);
  assert.equal(merged[1].sourceDate, '2026-04-14');
});

test('submitted docs stay visible only on submitted date and the next day', () => {
  const submitted = createSubmittedDocItem(
    { id: 'p1', text: '2026가단1234 준비서면 제출', dueDate: '2026-04-15', sourceDate: '2026-04-14' },
    '2026-04-15',
    '2026-04-15T10:00:00.000Z'
  );
  const entries = {
    '2026-04-15': {
      submittedDocItems: JSON.stringify([submitted]),
    },
    '2026-04-16': {
      submittedDocItems: JSON.stringify([]),
    },
    '2026-04-17': {
      submittedDocItems: JSON.stringify([]),
    },
  };

  assert.deepEqual(collectVisibleSubmittedDocs(entries, '2026-04-15').map((item) => item.text), ['2026가단1234 준비서면 제출']);
  assert.deepEqual(collectVisibleSubmittedDocs(entries, '2026-04-16').map((item) => item.text), ['2026가단1234 준비서면 제출']);
  assert.deepEqual(collectVisibleSubmittedDocs(entries, '2026-04-17').map((item) => item.text), []);
  assert.equal(submitted.submittedDate, '2026-04-15');
  assert.equal(submitted.sourceDate, '2026-04-14');
});

test('submitted docs keep a stable id when normalized repeatedly', () => {
  const submitted = createSubmittedDocItem(
    { id: 'pending_123', text: '2026가단1234 준비서면 제출', dueDate: '2026-04-15', sourceDate: '2026-04-14' },
    '2026-04-15',
    '2026-04-15T10:00:00.000Z'
  );

  const normalizedOnce = normalizeSubmittedDocItem(submitted, '2026-04-15', '2026-04-15');
  const normalizedTwice = normalizeSubmittedDocItem(normalizedOnce, '2026-04-15', '2026-04-15');

  assert.equal(normalizedOnce.id, submitted.id);
  assert.equal(normalizedTwice.id, submitted.id);
  assert.equal(normalizedTwice.pendingId, submitted.pendingId);
});

test('buildSubmittedDocProgressContent formats case-manager progress text', () => {
  assert.equal(
    buildSubmittedDocProgressContent('2026-04-15', '홍길동 손해배상 사건', '2026가단1234 준비서면 제출'),
    '4월 15일 홍길동 손해배상 사건 준비서면 제출'
  );
  assert.equal(
    buildSubmittedDocProgressContent('2026-04-15', '보험설계사 환수금', '항소이유서'),
    '4월 15일 보험설계사 환수금 항소이유서 제출'
  );
});

test('carryForwardPendingDocs moves unchecked pending docs into next day pending docs', () => {
  const entries = {
    '2026-04-14': {
      pendingDocItems: JSON.stringify([
        { id: 'a', text: '준비서면 제출', dueDate: '2026-04-15', done: false },
        { id: 'b', text: '의견서 제출', dueDate: '2026-04-14', done: true },
      ]),
    },
    '2026-04-15': {
      pendingDocItems: JSON.stringify([{ id: 'c', text: '기존 서면', dueDate: '', done: false }]),
    },
  };

  const merged = carryForwardPendingDocs(entries, '2026-04-15');

  assert.deepEqual(merged.map((item) => item.text), ['준비서면 제출', '기존 서면']);
  assert.equal(merged[0].sourceDate, '2026-04-14');
});

test('carryForwardPendingDocs does not revive pending docs already checked on a later entry', () => {
  const entries = {
    '2026-04-14': {
      pendingDocItems: JSON.stringify([
        { id: 'a', text: '준비서면 제출', dueDate: '2026-04-15', done: false },
      ]),
    },
    '2026-04-15': {
      pendingDocItems: JSON.stringify([]),
      pendingDocCompletions: JSON.stringify([
        { id: 'a', text: '준비서면 제출', dueDate: '2026-04-15', sourceDate: '2026-04-14', completedAt: '2026-04-15T10:00:00.000Z' },
      ]),
    },
    '2026-04-16': {
      pendingDocItems: JSON.stringify([]),
    },
  };

  assert.deepEqual(carryForwardPendingDocs(entries, '2026-04-15').map((item) => item.text), []);
  assert.deepEqual(carryForwardPendingDocs(entries, '2026-04-16').map((item) => item.text), []);
});

test('carryForwardPendingDocs matches checked legacy pending docs without stable ids by text and source date', () => {
  const entries = {
    '2026-04-14': {
      pendingDocItems: JSON.stringify([
        { text: '레거시 준비서면 제출', dueDate: '2026-04-15', done: false },
      ]),
    },
    '2026-04-15': {
      pendingDocItems: JSON.stringify([]),
      pendingDocCompletions: JSON.stringify([
        { id: 'generated-at-check-time', text: '레거시 준비서면 제출', dueDate: '2026-04-15', sourceDate: '2026-04-14', completedAt: '2026-04-15T10:00:00.000Z' },
      ]),
    },
  };

  assert.deepEqual(carryForwardPendingDocs(entries, '2026-04-15').map((item) => item.text), []);
});

test('carryForwardPendingDocs keeps distinct pending docs with the same text but different due dates', () => {
  const entries = {
    '2026-04-14': {
      pendingDocItems: JSON.stringify([
        { id: 'a', text: '준비서면 제출', dueDate: '2026-04-15', done: false },
        { id: 'b', text: '준비서면 제출', dueDate: '2026-04-16', done: false },
      ]),
    },
    '2026-04-15': {
      pendingDocItems: JSON.stringify([]),
    },
  };

  const merged = carryForwardPendingDocs(entries, '2026-04-15');

  assert.deepEqual(merged.map((item) => item.dueDate), ['2026-04-15', '2026-04-16']);
});

test('sortDelegatedTasks orders by nearest due date and pushes undated items last', () => {
  const tasks = [
    { id: '1', assignee: '이사무', text: '판례 조사', dueDate: '' },
    { id: '2', assignee: '김실장', text: '초안 검토', dueDate: '2026-04-18' },
    { id: '3', assignee: '박대리', text: '등본 발급', dueDate: '2026-04-16' },
  ];

  const sorted = sortDelegatedTasks(tasks);

  assert.deepEqual(sorted.map((item) => item.id), ['3', '2', '1']);
});

test('buildLearnedTopicGroups groups learned notes by topic and keeps date labels', () => {
  const entries = {
    '2026-04-14': {
      learnedItems: JSON.stringify([
        { id: 'l1', topic: '법리·판례', subtopic: '증거법', title: '전자문서 제출', content: '원본성 주장 정리' },
      ]),
    },
    '2026-04-15': {
      learnedItems: JSON.stringify([
        { id: 'l2', topic: '법리·판례', subtopic: '증거법', title: '문자 캡처 증거', content: '대화 맥락 포함 필요' },
        { id: 'l3', topic: '실무 팁', subtopic: '', title: '기일 전 체크', content: '전날 송달 확인' },
      ]),
    },
  };

  const groups = buildLearnedTopicGroups(entries);

  assert.deepEqual(groups.map((group) => group.topic), ['법리·판례', '실무 팁']);
  assert.equal(groups[0].items[0].date, '2026-04-15');
  assert.equal(groups[0].items[1].date, '2026-04-14');
});

test('filterLearnedItemsByTopic can exclude the current entry from same-topic hints', () => {
  const entries = {
    '2026-04-14': {
      learnedItems: JSON.stringify([
        { id: 'l1', topic: '실무 팁', subtopic: '', title: '과거 메모', content: '기존 기록' },
      ]),
    },
    '2026-04-15': {
      learnedItems: JSON.stringify([
        { id: 'l2', topic: '실무 팁', subtopic: '', title: '오늘 추가한 메모', content: '현재 입력 중인 기록' },
      ]),
    },
  };

  const results = filterLearnedItemsByTopic(entries, '실무 팁', { excludeDate: '2026-04-15' });

  assert.deepEqual(results.map((item) => item.title), ['과거 메모']);
});

test('searchLearnedItems filters by query across title and content', () => {
  const entries = {
    '2026-04-14': {
      learnedItems: JSON.stringify([
        { id: 'l1', topic: '법리·판례', subtopic: '증거법', title: '전자문서 제출', content: '원본성 주장 정리' },
      ]),
    },
    '2026-04-15': {
      learnedItems: JSON.stringify([
        { id: 'l2', topic: '실무 팁', subtopic: '', title: '기일 전 체크', content: '전날 송달 확인' },
      ]),
    },
  };

  const results = searchLearnedItems(entries, '송달');

  assert.equal(results.length, 1);
  assert.equal(results[0].title, '기일 전 체크');
});

test('buildLearnedArchiveStats returns counts for items and topics', () => {
  const entries = {
    '2026-04-14': {
      learnedItems: JSON.stringify([
        { id: 'l1', topic: '법리·판례', subtopic: '증거법', title: '전자문서 제출', content: '원본성 주장 정리' },
      ]),
    },
    '2026-04-15': {
      learnedItems: JSON.stringify([
        { id: 'l2', topic: '실무 팁', subtopic: '', title: '기일 전 체크', content: '전날 송달 확인' },
        { id: 'l3', topic: '실무 팁', subtopic: '송달', title: '보정명령 대응', content: '기한 관리' },
      ]),
    },
  };

  const stats = buildLearnedArchiveStats(entries, '2026-04');

  assert.equal(stats.totalItems, 3);
  assert.equal(stats.totalTopics, 2);
  assert.equal(stats.monthItems, 3);
});

test('parseChecklistItems and serializeChecklistItems keep checkbox state', () => {
  const items = parseChecklistItems('[ ] 초안 작성\n[x] 판례 확인');

  assert.deepEqual(items, [
    { id: null, text: '초안 작성', done: false },
    { id: null, text: '판례 확인', done: true },
  ]);

  assert.equal(
    serializeChecklistItems(items),
    '[ ] 초안 작성\n[x] 판례 확인'
  );
});

test('chooseNewerEntry preserves local edits when they are newer than Firebase data', () => {
  const local = { todayWork: '로컬 최신', _savedAt: '2026-04-15T12:00:00.000Z' };
  const remote = { todayWork: '원격 과거', _savedAt: '2026-04-15T11:00:00.000Z' };

  assert.equal(chooseNewerEntry(local, remote), local);
  assert.equal(chooseNewerEntry(remote, local), local);
});

test('chooseNewerEntry prefers Firebase data when saved timestamps are tied or missing', () => {
  const localMissing = { todayWork: '로컬 레거시' };
  const remoteMissing = { todayWork: '원격 레거시' };
  const localEqual = { todayWork: '로컬 동률', _savedAt: '2026-04-15T12:00:00.000Z' };
  const remoteEqual = { todayWork: '원격 동률', _savedAt: '2026-04-15T12:00:00.000Z' };

  assert.equal(chooseNewerEntry(localMissing, remoteMissing), remoteMissing);
  assert.equal(chooseNewerEntry(localEqual, remoteEqual), remoteEqual);
});

test('mergeEntryMapsBySavedAt keeps newer local entries and identifies Firebase write-backs', () => {
  const local = {
    '2026-04-15': { todayWork: '로컬 최신', _savedAt: '2026-04-15T12:00:00.000Z' },
    '2026-04-17': { todayWork: '로컬만 있음', _savedAt: '2026-04-17T09:00:00.000Z' },
  };
  const remote = {
    '2026-04-15': { todayWork: '원격 과거', _savedAt: '2026-04-15T11:00:00.000Z' },
    '2026-04-16': { todayWork: '원격 최신', _savedAt: '2026-04-16T12:00:00.000Z' },
  };

  const result = mergeEntryMapsBySavedAt(local, remote);

  assert.equal(result.entries['2026-04-15'], local['2026-04-15']);
  assert.equal(result.entries['2026-04-16'], remote['2026-04-16']);
  assert.equal(result.entries['2026-04-17'], local['2026-04-17']);
  assert.deepEqual(result.localWins, ['2026-04-15', '2026-04-17']);
  assert.deepEqual(result.remoteWins, ['2026-04-16']);
});
