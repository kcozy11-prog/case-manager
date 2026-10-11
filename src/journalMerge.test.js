import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeJournalEntries } from './journalMerge.js';
import { saveJournalDraft, loadJournalDraft, clearJournalDraft, draftDiffersFromForm, journalDraftKey } from './journalDraft.js';
import { createMemoryStorage } from './pendingWrites.js';

const J = (v) => JSON.stringify(v);
const base = {
  entryDate: '2026-10-11', _savedAt: '2026-10-11T00:00:00Z',
  todayWork: '오전 기록 검토', callNotes: '',
  todayTasks: J([{ id: 't1', text: '기록 열람' }, { id: 't2', text: '감정료 예납' }]),
  callLogItems: J([]),
  todayTaskCompletions: J([]),
  pendingDocs: '',
};

test('다른 기기가 그사이 저장한 항목과 이 화면에서 바꾼 항목을 항목 단위로 합친다 (덮어쓰지 않음)', () => {
  // 이 화면: 할 일 t1 완료 표시 + 통화 기록 추가
  const mine = { ...base, todayTasks: J([{ id: 't1', text: '기록 열람', done: true }, { id: 't2', text: '감정료 예납' }]),
    callLogItems: J([{ id: 'k1', title: '의뢰인 통화' }]) };
  // 다른 기기: 할 일 t3 추가 + 오늘 업무 문장 수정
  const theirs = { ...base, _savedAt: '2026-10-11T01:00:00Z', todayWork: '오전 기록 검토, 오후 현장 확인',
    todayTasks: J([{ id: 't1', text: '기록 열람' }, { id: 't2', text: '감정료 예납' }, { id: 't3', text: '준비서면 초안' }]) };
  const r = mergeJournalEntries(base, mine, theirs);
  assert.equal(r.conflicts.length, 0);
  assert.equal(r.otherChanged, true);
  assert.equal(r.merged.todayWork, '오전 기록 검토, 오후 현장 확인');
  assert.deepEqual(JSON.parse(r.merged.todayTasks).map((t) => [t.id, !!t.done]), [['t1', true], ['t2', false], ['t3', false]]);
  assert.deepEqual(JSON.parse(r.merged.callLogItems).map((t) => t.id), ['k1']);
});

test('양쪽이 같은 항목·같은 글을 서로 다르게 바꾸면 충돌로 돌려주고, 고른 대로 합친다', () => {
  const mine = { ...base, todayWork: '이 기기에서 쓴 업무', todayTasks: J([{ id: 't1', text: '기록 열람(1층 민원실)' }, { id: 't2', text: '감정료 예납' }]) };
  const theirs = { ...base, todayWork: '다른 기기에서 쓴 업무', todayTasks: J([{ id: 't1', text: '기록 열람(전자소송)' }]) };
  const r = mergeJournalEntries(base, mine, theirs);
  // t1: 양쪽 수정 → 충돌, t2: 다른 기기에서 지움·이 화면은 그대로 → 지움, 오늘 업무: 충돌
  assert.deepEqual(r.unresolved.map((c) => c.id).sort(), ['todayTasks|id:t1', 'todayWork']);
  const t1 = r.conflicts.find((c) => c.id === 'todayTasks|id:t1');
  assert.equal(t1.mine, '기록 열람(1층 민원실)');
  assert.equal(t1.theirs, '기록 열람(전자소송)');
  assert.equal(t1.label, '오늘 할 일');

  const chosen = mergeJournalEntries(base, mine, theirs, { 'todayTasks|id:t1': 'theirs', todayWork: 'mine' });
  assert.equal(chosen.unresolved.length, 0);
  assert.equal(chosen.merged.todayWork, '이 기기에서 쓴 업무');
  assert.deepEqual(JSON.parse(chosen.merged.todayTasks).map((t) => t.text), ['기록 열람(전자소송)']);
});

test('한쪽에서 지운 항목을 다른 쪽에서 고쳤으면 충돌로 묻는다', () => {
  const mine = { ...base, todayTasks: J([{ id: 't2', text: '감정료 예납' }]) }; // t1 지움
  const theirs = { ...base, todayTasks: J([{ id: 't1', text: '기록 열람', done: true }, { id: 't2', text: '감정료 예납' }]) }; // t1 완료
  const r = mergeJournalEntries(base, mine, theirs);
  assert.equal(r.unresolved.length, 1);
  assert.equal(r.unresolved[0].mine, '(이 화면에서 지움)');
});

test('완료 기록은 충돌 없이 합집합으로 합친다 (처리한 항목이 되살아나지 않게)', () => {
  const rec = (id, at) => ({ id, text: id === 't1' ? '기록 열람' : '감정료 예납', completedAt: at });
  const mine = { ...base, todayTaskCompletions: J([rec('t1', '2026-10-11T02:00:00Z')]) };
  const theirs = { ...base, todayTaskCompletions: J([rec('t1', '2026-10-11T01:00:00Z'), rec('t2', '2026-10-11T01:05:00Z')]) };
  const r = mergeJournalEntries(base, mine, theirs);
  assert.equal(r.conflicts.length, 0);
  assert.deepEqual(JSON.parse(r.merged.todayTaskCompletions).map((c) => c.id), ['t1', 't2']);
});

test('서버에 아직 그날 일지가 없거나 아무도 바꾸지 않았으면 이 화면 내용 그대로다', () => {
  const mine = { ...base, todayWork: '새로 씀' };
  const r1 = mergeJournalEntries(null, mine, null);
  assert.equal(r1.conflicts.length, 0);
  assert.equal(r1.merged.todayWork, '새로 씀');
  assert.equal(r1.otherChanged, false);
  const r2 = mergeJournalEntries(base, mine, base);
  assert.equal(r2.merged.todayWork, '새로 씀');
  assert.equal(r2.otherChanged, false);
  // 빈 값과 빈 목록("[]")은 같은 것으로 본다
  const r3 = mergeJournalEntries({ ...base, callLogItems: '' }, { ...base, callLogItems: '[]' }, { ...base, callLogItems: '' });
  assert.equal(r3.conflicts.length, 0);
});

test('작성 중 초안을 날짜별로 이 기기에 보관하고, 다시 열 때 내용이 다르면 복구를 제안한다', () => {
  const storage = createMemoryStorage();
  const form = { todayWork: '저장 전에 창이 닫힌 내용', todayTasks: [{ id: 't1', text: '기록 열람' }] };
  assert.equal(saveJournalDraft('u1', '2026-10-11', { form, base, at: '2026-10-11T03:00:00Z' }, storage), true);
  const d = loadJournalDraft('u1', '2026-10-11', storage);
  assert.equal(d.form.todayWork, '저장 전에 창이 닫힌 내용');
  assert.equal(d.baseSavedAt, '2026-10-11T00:00:00Z');
  assert.equal(loadJournalDraft('u2', '2026-10-11', storage), null); // 사용자별
  assert.equal(loadJournalDraft('u1', '2026-10-12', storage), null); // 날짜별
  assert.equal(draftDiffersFromForm(d, { todayWork: '서버 판본', todayTasks: [] }), true);
  assert.equal(draftDiffersFromForm(d, form), false);
  clearJournalDraft('u1', '2026-10-11', storage);
  assert.equal(storage.getItem(journalDraftKey('u1', '2026-10-11')), null);
  // 깨진 초안은 무시
  storage.setItem(journalDraftKey('u1', '2026-10-11'), '{x');
  assert.equal(loadJournalDraft('u1', '2026-10-11', storage), null);
});

test('충돌을 고르는 사이 다른 기기가 또 저장하면, 앞서 고른 것은 그대로 두고 새로 겹친 것만 묻는다', () => {
  const mine = { ...base, todayWork: '이 기기 업무', callNotes: '이 기기 메모' };
  const theirs1 = { ...base, todayWork: '다른 기기 업무' };
  const first = mergeJournalEntries(base, mine, theirs1);
  assert.deepEqual(first.unresolved.map((c) => c.id), ['todayWork']);
  const prior = { todayWork: 'mine' };
  // 고르는 동안 다른 기기가 메모도 고쳐 저장
  const theirs2 = { ...theirs1, callNotes: '다른 기기 메모' };
  const second = mergeJournalEntries(base, mine, theirs2, prior);
  assert.deepEqual(second.unresolved.map((c) => c.id), ['callNotes']);
  const done = mergeJournalEntries(base, mine, theirs2, { ...prior, callNotes: 'theirs' });
  assert.equal(done.unresolved.length, 0);
  assert.equal(done.merged.todayWork, '이 기기 업무');
  assert.equal(done.merged.callNotes, '다른 기기 메모');
});
