import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBatch, validateBatch, planBatch, planJournalItems, addDelegatedToJournalEntry, normalizeItem,
  describeItem, defaultSelectedIds, findJournalClaudeItem, buildLedgerPatch, DEFAULT_DELEGATED_ASSIGNEE,
} from './claudeInbox.js';
import { carryForwardDelegatedTasks, parseJsonArray } from './journalLogic.js';

// 시험 자료는 모두 가공 사건이다 (공개 저장소).
const TODAY = '2026-10-21';
const J = (v) => JSON.stringify(v);
const C1 = 'c1000000000001';
const cases = [
  { id: C1, title: '가나다 물품대금', status: '진행중', caseNumber: '2026가단10000', hearings: [], timeline: [], memos: [], todos: [], briefs: [] },
];
const batchOf = (items, batchId = '261021-0900-dlg') => ({ format: 'cm-update-v1', batchId, items });
const dlg = (fields = {}, extra = {}) => ({ id: 'd1', op: 'delegated', basis: '가공 근거', text: '송달 보고서 확인', ...fields, ...extra });

test('delegated: 사건 없이도 받고 담당자 기본값은 정실장', () => {
  const b = parseBatch(J(batchOf([dlg({ dueDate: '2026-10-28' })])));
  const { errors, norm } = normalizeItem(b.items[0], { today: TODAY });
  assert.deepEqual(errors, []);
  assert.equal(norm.assignee, DEFAULT_DELEGATED_ASSIGNEE);
  const report = validateBatch(b, cases, null, { today: TODAY, journalEntries: {} });
  assert.equal(report.items[0].status, 'ok');
  assert.equal(report.groups[0].key, 'journal');
  assert.equal(report.groups[0].journal, true);
  assert.deepEqual(defaultSelectedIds(report), ['d1']);
  assert.match(describeItem(norm).meta, /업무일지 위임 업무/);
});

test('delegated: 사건을 고르면 앱에 있는 사건이어야 하고 사건번호를 대조한다', () => {
  const ok = validateBatch(batchOf([dlg({ cmCaseId: C1, caseNumber: '2026가단10000' })]), cases, null, { today: TODAY, journalEntries: {} });
  assert.equal(ok.items[0].status, 'ok');
  const missing = validateBatch(batchOf([dlg({ cmCaseId: 'c-none' })]), cases, null, { today: TODAY, journalEntries: {} });
  assert.equal(missing.items[0].status, 'error');
  const mismatch = validateBatch(batchOf([dlg({ cmCaseId: C1, caseNumber: '2026가단99999' })]), cases, null, { today: TODAY, journalEntries: {} });
  assert.equal(mismatch.items[0].status, 'error');
  // 형식 검사: 알 수 없는 필드, 필수 text
  assert.equal(validateBatch(batchOf([dlg({ who: 'x' })]), cases, null, { today: TODAY }).items[0].status, 'error');
  assert.equal(validateBatch(batchOf([dlg({ text: '' })]), cases, null, { today: TODAY }).items[0].status, 'error');
  assert.equal(validateBatch(batchOf([dlg({ dueDate: '2026-13-01' })]), cases, null, { today: TODAY }).items[0].status, 'error');
});

test('delegated: 지난 확인일·같은 내용 미확인 위임 업무는 경고', () => {
  const journalEntries = { '2026-10-20': { delegatedItems: J([{ id: 'x', text: '송달 보고서 확인', assignee: '정실장' }]) } };
  const r = validateBatch(batchOf([dlg({ dueDate: '2026-10-01' })]), cases, null, { today: TODAY, journalEntries });
  assert.equal(r.items[0].status, 'warn');
  assert.ok(r.items[0].warnings.some((w) => /지났음/.test(w)));
  assert.ok(r.items[0].warnings.some((w) => /미확인 위임 업무가 이미/.test(w)));
});

test('delegated 는 사건 수정본(planBatch)에 들어가지 않고 업무일지 계획으로만 간다', () => {
  const b = batchOf([dlg({ cmCaseId: C1, caseNumber: '2026가단10000' }), { id: 'm1', op: 'memo', cmCaseId: C1, caseNumber: '2026가단10000', category: '일반메모', title: '가공 메모', basis: '가공' }]);
  const plan = planBatch(b, cases, ['d1', 'm1'], { today: TODAY, journalEntries: {} });
  assert.deepEqual(plan.flatMap((p) => p.itemIds), ['m1']);
  const jp = planJournalItems(b, cases, ['d1', 'm1'], { today: TODAY, journalEntries: {}, createdAt: '2026-10-21T00:00:00Z' });
  assert.equal(jp.dateKey, TODAY);
  assert.equal(jp.items.length, 1);
  const it = jp.items[0].item;
  assert.equal(it.id, 'cl:261021-0900-dlg:d1');
  assert.equal(it.assignee, '정실장');
  assert.equal(it.sourceDate, TODAY);
  assert.equal(it.cmCaseTitle, '가나다 물품대금');
  assert.equal(it.done, false);
  assert.deepEqual(it.claude, { batchId: '261021-0900-dlg', itemId: 'd1', fp: jp.items[0].fp });
});

test('오늘 일지가 있으면 위임 업무만 얹고, 없으면 할 일 이월을 넣어 새로 만든다', () => {
  const b = batchOf([dlg()]);
  const { items } = planJournalItems(b, cases, ['d1'], { today: TODAY, journalEntries: {} });
  const newItems = items.map((x) => x.item);

  const existing = { entryDate: TODAY, todayTasks: J([{ id: 't0', text: '오늘 적은 일' }]), delegatedItems: J([{ id: 'old', text: '기존 위임', assignee: '정실장' }]) };
  const r1 = addDelegatedToJournalEntry({ [TODAY]: existing }, TODAY, existing, newItems);
  assert.deepEqual(r1.added, ['cl:261021-0900-dlg:d1']);
  assert.deepEqual(parseJsonArray(r1.entry.delegatedItems).map((i) => i.id), ['old', 'cl:261021-0900-dlg:d1']);
  assert.equal(r1.entry.todayTasks, existing.todayTasks); // 다른 칸은 그대로
  assert.match(r1.entry.delegated, /정실장: 송달 보고서 확인/);

  const entries = { '2026-10-20': { todayTasks: J([{ id: 'a', text: '의견서 초안', dueDate: '2026-10-25' }]), tomorrowTasks: J([{ id: 'b', text: '인지 계산' }]) } };
  const r2 = addDelegatedToJournalEntry(entries, TODAY, null, newItems);
  assert.deepEqual(parseJsonArray(r2.entry.todayTasks).map((i) => i.id), ['a', 'b']);
  assert.equal(r2.entry.entryDate, TODAY);

  // 이미 있거나(같은 id) 그날 완료·취소한 항목은 다시 넣지 않는다
  assert.equal(addDelegatedToJournalEntry({}, TODAY, r1.entry, newItems).entry, null);
  const cancelled = { ...existing, delegatedCompletions: J([{ id: 'cl:261021-0900-dlg:d1', text: '송달 보고서 확인' }]) };
  assert.equal(addDelegatedToJournalEntry({}, TODAY, cancelled, newItems).entry, null);
});

test('반영한 위임 업무는 다음 날 업무일지로 따라오고, 다시 반영하면 「이미 반영됨」', () => {
  const b = batchOf([dlg({ dueDate: '2026-10-28' })]);
  const { items } = planJournalItems(b, cases, ['d1'], { today: TODAY, journalEntries: {} });
  const { entry } = addDelegatedToJournalEntry({}, TODAY, null, items.map((x) => x.item));
  const journalEntries = { [TODAY]: entry };
  const next = carryForwardDelegatedTasks(journalEntries, '2026-10-22');
  assert.deepEqual(next.map((i) => [i.text, i.sourceDate, i.dueDate]), [['송달 보고서 확인', TODAY, '2026-10-28']]);

  // 업무일지에 항목이 있으면 반영 기록이 없어도 이미 반영됨
  assert.ok(findJournalClaudeItem(journalEntries, b.batchId, 'd1'));
  assert.equal(validateBatch(b, cases, null, { today: TODAY, journalEntries }).items[0].status, 'applied');
  // 반영 기록만 있어도 이미 반영됨, 같은 id 로 다른 내용이면 오류
  const ledger = buildLedgerPatch(b.batchId, { d1: { fp: items[0].fp, caseId: `journal:${TODAY}` } }, 'x');
  assert.equal(validateBatch(b, cases, ledger, { today: TODAY, journalEntries: {} }).items[0].status, 'applied');
  const changed = batchOf([dlg({ dueDate: '2026-10-30' })]);
  assert.equal(validateBatch(changed, cases, ledger, { today: TODAY, journalEntries: {} }).items[0].status, 'error');
  // 이미 반영된 것은 계획에 넣지 않는다
  assert.equal(planJournalItems(b, cases, ['d1'], { today: TODAY, journalEntries }).items.length, 0);
});
