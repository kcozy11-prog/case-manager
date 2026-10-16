import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBatch,
  validateBatch,
  planBatch,
  applyItem,
  normalizeItem,
  defaultSelectedIds,
  buildBindingCode,
  compareCaseNumber,
  caseHasClaudeItem,
  describeItem,
  isValidDate,
  isValidTime,
  itemFingerprint,
  buildLedgerPatch,
  ledgerBatchesToPrune,
  MAX_TEXT_LENGTH,
} from './claudeInbox.js';
import { diffCase, applyCaseDiff } from './caseMerge.js';

// 시험 자료는 모두 가공 사건이다 (공개 저장소).
const TODAY = '2026-10-17';

function makeCases() {
  return [
    {
      id: 'c1000000000001', title: '가나다 물품대금', type: '민사', status: '진행중',
      client: '가나다', opponent: '라마바', court: '가상지방법원', caseNumber: '2026가단10000',
      hearings: [{ id: 11, date: '2026-11-05', time: '10:00', type: '변론기일', result: '' }],
      timeline: [{ id: 21, date: '2026-10-01', content: '소장 부본 수령', activityType: 'receipt' }],
      memos: [{ id: 31, category: '일반메모', title: '기존 메모', content: '보존', date: '2026-10-01' }],
      documents: [],
      todos: [{ id: 41, text: '증거목록 정리', details: '', priority: '보통', dueDate: '', done: false }],
      briefs: [{ id: 51, title: '준비서면 (2)', status: 'pending', preparedDate: '2026-10-10', submittedDate: '' }],
    },
    {
      id: 'c1000000000002', title: '사바아 손해배상', type: '민사', status: '진행중',
      client: '사바아', opponent: '자차카', court: '가상지방법원', caseNumber: '2026가합20000',
      hearings: [], timeline: [], memos: [], documents: [], todos: [], briefs: [],
    },
    {
      id: 'c1000000000003', title: '타파하 자문', type: '자문', status: '종결',
      client: '타파하', court: '—', caseNumber: '—',
      hearings: [], timeline: [], memos: [], documents: [], todos: [], briefs: [],
    },
  ];
}

const C1 = 'c1000000000001';
const C2 = 'c1000000000002';
const C3 = 'c1000000000003';

function item(op, fields, extra = {}) {
  return { id: extra.id || `t-${op.replace('.', '-')}`, cmCaseId: C1, caseNumber: '2026가단10000', op, basis: '가공 근거', ...fields, ...extra };
}

function batchOf(items, batchId = '261017-1432-test') {
  return { format: 'cm-update-v1', batchId, createdAt: '2026-10-17T14:32:00+09:00', source: { folder: '가공 폴더', pc: '사무실' }, items };
}

function markOf(b, id) {
  const { fp } = normalizeItem(b.items.find((i) => i.id === id), { today: TODAY });
  return { batchId: b.batchId, itemId: id, fp };
}

function statusOf(report, id) {
  return report.items.find((r) => r.id === id);
}

// ── parseBatch ───────────────────────────────────────────────────────
test('parseBatch reads a plain cm-update-v1 JSON', () => {
  const b = parseBatch(JSON.stringify(batchOf([item('todo', { text: '가공 할 일' })])));
  assert.equal(b.batchId, '261017-1432-test');
  assert.equal(b.items.length, 1);
  assert.deepEqual(b.source, { folder: '가공 폴더', pc: '사무실' });
});

test('parseBatch accepts a fenced code block with surrounding chat text and a BOM', () => {
  const text = `﻿아래 블록을 붙여넣으세요.\n\`\`\`json\n${JSON.stringify(batchOf([item('todo', { text: 'x' })]))}\n\`\`\`\n끝`;
  assert.equal(parseBatch(text).items.length, 1);
});

test('parseBatch rejects empty text, broken JSON and wrong formats', () => {
  assert.throws(() => parseBatch('   '), /붙여넣은 내용이 없습니다/);
  assert.throws(() => parseBatch('{ 이건 JSON이 아님'), /읽지 못했습니다/);
  assert.throws(() => parseBatch(JSON.stringify({ ...batchOf([item('todo', { text: 'x' })]), format: 'cm-update-v0' })), /형식이 cm-update-v1이 아닙니다/);
  assert.throws(() => parseBatch(JSON.stringify({ format: 'cm-binding-v1', cmCaseId: C1 })), /연결 코드/);
});

test('parseBatch rejects unknown top-level fields, bad batchId, empty or oversized items', () => {
  assert.throws(() => parseBatch(JSON.stringify({ ...batchOf([item('todo', { text: 'x' })]), extra: 1 })), /알 수 없는 필드.*extra/);
  assert.throws(() => parseBatch(JSON.stringify({ ...batchOf([item('todo', { text: 'x' })]), batchId: 'a.b' })), /batchId/);
  assert.throws(() => parseBatch(JSON.stringify({ ...batchOf([item('todo', { text: 'x' })]), batchId: '' })), /batchId/);
  assert.throws(() => parseBatch(JSON.stringify(batchOf([]))), /비어 있습니다/);
  const many = Array.from({ length: 201 }, (_, i) => item('todo', { text: `x${i}` }, { id: `t${i}` }));
  assert.throws(() => parseBatch(JSON.stringify(batchOf(many))), /너무 많습니다/);
  assert.throws(() => parseBatch(JSON.stringify({ ...batchOf([item('todo', { text: 'x' })]), source: { folder: 'a', secret: 'b' } })), /source.*secret/);
});

// ── 날짜·시각 ────────────────────────────────────────────────────────
test('isValidDate and isValidTime are strict', () => {
  assert.equal(isValidDate('2026-10-17'), true);
  assert.equal(isValidDate('2026-02-30'), false);
  assert.equal(isValidDate('2026-10-7'), false);
  assert.equal(isValidDate('2026.10.17'), false);
  assert.equal(isValidDate('0226-10-17'), false);
  assert.equal(isValidTime('09:30'), true);
  assert.equal(isValidTime('9:30'), false);
  assert.equal(isValidTime('24:00'), false);
});

// ── 사건 연결 ────────────────────────────────────────────────────────
test('compareCaseNumber compares normalized numbers exactly, including multi-number fields', () => {
  assert.equal(compareCaseNumber('2026가단 10000', { caseNumber: '2026가단10000' }), 'match');
  assert.equal(compareCaseNumber('2026가단1000', { caseNumber: '2026가단10000' }), 'mismatch'); // 포함 비교 안 함
  assert.equal(compareCaseNumber('2026가단2', { caseNumber: '2026가단1, 2026가단2' }), 'match');
  assert.equal(compareCaseNumber('', { caseNumber: '2026가단10000' }), 'missing');
  assert.equal(compareCaseNumber('2026가단10000', { caseNumber: '—' }), 'app-empty');
  assert.equal(compareCaseNumber('', { caseNumber: '' }), 'none');
});

test('validateBatch never guesses a case from names or case numbers when cmCaseId is missing', () => {
  const noId = item('todo', { text: '가나다 사건 할 일' }, { cmCaseId: undefined });
  delete noId.cmCaseId;
  const report = validateBatch(batchOf([noId]), makeCases(), null, { today: TODAY });
  const r = report.items[0];
  assert.equal(r.status, 'error');
  assert.equal(r.caseObj, null);
  assert.match(r.errors.join(' '), /cmCaseId 없음/);
});

test('validateBatch errors on unknown case id and on case number mismatch', () => {
  const report = validateBatch(batchOf([
    item('todo', { text: 'a' }, { id: 'a1', cmCaseId: 'c9999' }),
    item('todo', { text: 'b' }, { id: 'a2', caseNumber: '2026가단99999' }),
  ]), makeCases(), null, { today: TODAY });
  assert.equal(statusOf(report, 'a1').status, 'error');
  assert.match(statusOf(report, 'a1').errors.join(' '), /앱에 없는 사건/);
  assert.equal(statusOf(report, 'a2').status, 'error');
  assert.match(statusOf(report, 'a2').errors.join(' '), /사건번호 불일치/);
});

test('validateBatch warns when the case number cannot be cross-checked', () => {
  const report = validateBatch(batchOf([
    item('todo', { text: 'a' }, { id: 'n1', caseNumber: undefined }),
    item('memo', { category: '일반메모', title: '자문 메모' }, { id: 'n2', cmCaseId: C3, caseNumber: '2026가단1' }),
  ]), makeCases(), null, { today: TODAY });
  assert.equal(statusOf(report, 'n1').status, 'warn');
  assert.match(statusOf(report, 'n1').warnings.join(' '), /파일에 사건번호가 없어/);
  assert.equal(statusOf(report, 'n2').status, 'warn');
  assert.match(statusOf(report, 'n2').warnings.join(' '), /앱 사건에 사건번호가 없어/);
  assert.match(statusOf(report, 'n2').warnings.join(' '), /종결 사건/);
});

// ── 형식 오류 ────────────────────────────────────────────────────────
test('validateBatch rejects unknown ops, unknown fields and bad values', () => {
  const long = 'x'.repeat(MAX_TEXT_LENGTH + 1);
  const report = validateBatch(batchOf([
    item('payment', { amount: '100' }, { id: 'e1' }),
    item('todo', { text: 'a', owner: '나' }, { id: 'e2' }),
    item('deadline', { title: '기한', date: '2026-02-30' }, { id: 'e3' }),
    item('hearing', { date: '2026-11-20', type: '변론기일', time: '24:00' }, { id: 'e4' }),
    item('progress', { date: '2026-10-17', content: long }, { id: 'e5' }),
    item('todo', { text: 'a', priority: '낮음' }, { id: 'e6' }),
    item('progress', { date: '2026-10-17', content: 'a', activityType: 'email' }, { id: 'e7' }),
    item('memo', { category: '불변기간', title: '기한' }, { id: 'e8' }),
    item('call', { date: '2026-10-17', title: '통화', asClientRequest: 'yes' }, { id: 'e9' }),
    item('todo', {}, { id: 'e10' }),
    item('todo', { text: 'a' }, { id: 'bad id!' }),
    item('todo', { text: 1 }, { id: 'e12' }),
  ]), makeCases(), null, { today: TODAY });
  const msg = (id) => statusOf(report, id).errors.join(' ');
  for (const r of report.items) assert.equal(r.status, 'error', `${r.id} should be error`);
  assert.match(msg('e1'), /알 수 없는 op: payment/);
  assert.match(msg('e2'), /알 수 없는 필드: owner/);
  assert.match(msg('e3'), /날짜 형식 오류/);
  assert.match(msg('e4'), /시각 형식 오류/);
  assert.match(msg('e5'), /글자 수 초과/);
  assert.match(msg('e6'), /priority/);
  assert.match(msg('e7'), /activityType/);
  assert.match(msg('e8'), /deadline/);
  assert.match(msg('e9'), /true\/false/);
  assert.match(msg('e10'), /필수 값 없음: text/);
  assert.match(report.items[10].errors.join(' '), /항목 id/);
  assert.match(msg('e12'), /문자열/);
});

test('validateBatch errors on a repeated item id inside one batch', () => {
  const report = validateBatch(batchOf([
    item('todo', { text: 'a' }, { id: 'same' }),
    item('todo', { text: 'b' }, { id: 'same' }),
  ]), makeCases(), null, { today: TODAY });
  assert.equal(report.items[0].status, 'ok');
  assert.equal(report.items[1].status, 'error');
});

test('validateBatch rejects an item that is not an object', () => {
  const report = validateBatch(batchOf(['문자열 항목']), makeCases(), null, { today: TODAY });
  assert.equal(report.items[0].status, 'error');
});

// ── 정상·경고 ────────────────────────────────────────────────────────
test('validateBatch marks clean items of every op as ok and only those are selected by default', () => {
  const report = validateBatch(batchOf([
    item('brief.submitted', { title: '준비서면(2)', date: '2026-10-17' }, { id: 'o1' }),
    item('brief.pending', { title: '준비서면(3)' }, { id: 'o2' }),
    item('deadline', { title: '반박서면 제출 기한', date: '2026-10-31' }, { id: 'o3' }),
    item('todo', { text: '증인 신청서 작성', priority: '높음', dueDate: '2026-10-25' }, { id: 'o4' }),
    item('hearing', { date: '2026-11-20', type: '조사기일', time: '14:00', place: '가상경찰서 101호' }, { id: 'o5' }),
    item('progress', { date: '2026-10-17', content: '의뢰인 보고서 송부', activityType: 'other' }, { id: 'o6' }),
    item('call', { date: '2026-10-16', title: '의뢰인 통화', detail: '증거 추가 요청', asClientRequest: true }, { id: 'o7' }),
    item('memo', { category: '일반메모', title: '검토 결과', content: '가공 내용' }, { id: 'o8' }),
    item('todo', { text: '경고 할 일', dueDate: '2026-10-01' }, { id: 'w1' }),
  ]), makeCases(), null, { today: TODAY });
  for (const id of ['o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7', 'o8']) {
    assert.equal(statusOf(report, id).status, 'ok', `${id}: ${statusOf(report, id).warnings.join(', ')}`);
  }
  assert.equal(statusOf(report, 'w1').status, 'warn');
  assert.deepEqual(defaultSelectedIds(report), ['o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7', 'o8']);
  assert.deepEqual(report.counts, { total: 9, ok: 8, warn: 1, error: 0, applied: 0 });
});

test('validateBatch warns on past deadlines and hearings, future progress, missing basis and closed cases', () => {
  const report = validateBatch(batchOf([
    item('deadline', { title: '지난 기한', date: '2026-10-01' }, { id: 'p1' }),
    item('hearing', { date: '2026-10-02', type: '변론기일' }, { id: 'p2' }),
    item('progress', { date: '2026-10-20', content: '미래 기록' }, { id: 'p3' }),
    item('todo', { text: '근거 없음' }, { id: 'p4', basis: undefined }),
    item('brief.submitted', { title: '준비서면(2)', date: '2026-10-18' }, { id: 'p5' }),
  ]), makeCases(), null, { today: TODAY });
  assert.match(statusOf(report, 'p1').warnings.join(' '), /기한이 이미 지났음/);
  assert.match(statusOf(report, 'p2').warnings.join(' '), /지난 기일/);
  assert.match(statusOf(report, 'p3').warnings.join(' '), /오늘 이후/);
  assert.match(statusOf(report, 'p4').warnings.join(' '), /근거\(basis\) 없음/);
  assert.match(statusOf(report, 'p5').warnings.join(' '), /제출일이 오늘 이후/);
  for (const r of report.items) assert.equal(r.status, 'warn');
});

test('validateBatch warns when the same content already exists in the case', () => {
  const report = validateBatch(batchOf([
    item('progress', { date: '2026-10-01', content: '소장 부본  수령' }, { id: 'd1' }),
    item('hearing', { date: '2026-11-05', type: '변론기일', time: '10:00' }, { id: 'd2' }),
    item('hearing', { date: '2026-11-05', type: '조정기일', time: '15:00' }, { id: 'd3' }),
    item('todo', { text: '증거목록정리' }, { id: 'd4' }),
    item('brief.pending', { title: '준비서면(2)' }, { id: 'd5' }),
    item('memo', { category: '일반메모', title: '기존 메모', date: '2026-10-01' }, { id: 'd6' }),
  ]), makeCases(), null, { today: TODAY });
  assert.match(statusOf(report, 'd1').warnings.join(' '), /같은 날짜·내용의 진행경과/);
  assert.match(statusOf(report, 'd2').warnings.join(' '), /같은 날짜·종류·시각의 기일/);
  assert.match(statusOf(report, 'd3').warnings.join(' '), /같은 날짜에 다른 기일/);
  assert.match(statusOf(report, 'd4').warnings.join(' '), /미완료 할 일이 이미 있음/);
  assert.match(statusOf(report, 'd5').warnings.join(' '), /같은 제목 서면이 이미 있음/);
  assert.match(statusOf(report, 'd6').warnings.join(' '), /같은 날짜·분류·제목의 메모/);
});

test('validateBatch warns on duplicate content inside the same batch', () => {
  const report = validateBatch(batchOf([
    item('progress', { date: '2026-10-17', content: '같은 기록' }, { id: 'b1' }),
    item('progress', { date: '2026-10-17', content: '같은  기록' }, { id: 'b2' }),
  ]), makeCases(), null, { today: TODAY });
  assert.equal(statusOf(report, 'b1').status, 'ok');
  assert.equal(statusOf(report, 'b2').status, 'warn');
  assert.match(statusOf(report, 'b2').warnings.join(' '), /같은 묶음 안에 같은 내용/);
});

test('brief.submitted warns when no pending brief has that title, but not when the same batch adds it first', () => {
  const report = validateBatch(batchOf([
    item('brief.submitted', { title: '답변서', date: '2026-10-17' }, { id: 's1' }),
    item('brief.pending', { title: '참고서면', date: '2026-10-17' }, { id: 's2' }),
    item('brief.submitted', { title: '참고서면', date: '2026-10-17' }, { id: 's3' }),
  ]), makeCases(), null, { today: TODAY });
  assert.match(statusOf(report, 's1').warnings.join(' '), /제출대기 서면이 없어 새로 만들어/);
  assert.equal(statusOf(report, 's3').status, 'ok');
});

// ── 이미 반영됨 ──────────────────────────────────────────────────────
test('validateBatch shows applied items from the ledger and from markers in the case', () => {
  const b = batchOf([
    item('todo', { text: 'a' }, { id: 'l1' }),
    item('todo', { text: 'b' }, { id: 'l2' }),
    item('todo', { text: 'c' }, { id: 'l3' }),
  ]);
  const cases = makeCases();
  cases[0].todos.push({ id: 777, text: 'b', done: false, claude: { batchId: b.batchId, itemId: 'l2' } });
  const ledger = { batches: { [b.batchId]: { items: { l1: '' } }, other: { items: { l3: '' } } } };
  const report = validateBatch(b, cases, ledger, { today: TODAY });
  assert.equal(statusOf(report, 'l1').status, 'applied');
  assert.equal(statusOf(report, 'l2').status, 'applied');
  assert.equal(statusOf(report, 'l3').status, 'ok'); // 다른 묶음의 같은 항목 id는 별개
  assert.deepEqual(defaultSelectedIds(report), ['l3']);
});

test('caseHasClaudeItem also recognizes the fixed id without a marker', () => {
  const c = { id: 'x', timeline: [{ id: 'cl:B1:i1:tl', date: '2026-10-17', content: 'a' }] };
  assert.equal(caseHasClaudeItem(c, 'B1', 'i1'), true);
  assert.equal(caseHasClaudeItem(c, 'B1', 'i'), false);
  assert.equal(caseHasClaudeItem(c, 'B2', 'i1'), false);
});

// ── 반영(planBatch / applyItem) ──────────────────────────────────────
test('brief.submitted marks the pending brief with the same title submitted and records progress', () => {
  const b = batchOf([item('brief.submitted', { title: '준비서면(2)', date: '2026-10-17' }, { id: 'x1' })]);
  const cases = makeCases();
  const plan = planBatch(b, cases, ['x1'], { today: TODAY });
  assert.equal(plan.length, 1);
  const { next, base, itemIds, caseId } = plan[0];
  assert.equal(caseId, C1);
  assert.deepEqual(itemIds, ['x1']);
  assert.equal(base, cases[0]);
  assert.equal(next.briefs.length, 1);
  assert.equal(next.briefs[0].id, 51);
  assert.equal(next.briefs[0].status, 'submitted');
  assert.equal(next.briefs[0].submittedDate, '2026-10-17');
  const tl = next.timeline.find((t) => t.id === `cl:${b.batchId}:x1:tl`);
  assert.deepEqual(tl, {
    id: `cl:${b.batchId}:x1:tl`, date: '2026-10-17', content: '준비서면 (2) 제출', activityType: 'document',
    claude: markOf(b, 'x1'),
  });
  assert.equal(next.briefs[0].submitTimelineId, tl.id);
  // 원본 불변
  assert.equal(cases[0].briefs[0].status, 'pending');
  assert.equal(cases[0].timeline.length, 1);
});

test('brief.submitted creates a new submitted brief when no pending one exists', () => {
  const b = batchOf([item('brief.submitted', { title: '답변서', date: '2026-10-16', details: '가공 메모' }, { id: 'x2', cmCaseId: C2, caseNumber: '2026가합20000' })]);
  const [{ next }] = planBatch(b, makeCases(), ['x2'], { today: TODAY });
  assert.equal(next.briefs.length, 1);
  assert.deepEqual(next.briefs[0], {
    id: `cl:${b.batchId}:x2`, title: '답변서', status: 'submitted', preparedDate: '2026-10-16', submittedDate: '2026-10-16',
    details: '가공 메모', submitTimelineId: `cl:${b.batchId}:x2:tl`, claude: markOf(b, 'x2'),
  });
  assert.equal(next.timeline.length, 1);
  assert.equal(next.timeline[0].content, '답변서 제출');
});

test('other ops create items in the same shape as the app input screens', () => {
  const b = batchOf([
    item('brief.pending', { title: '준비서면(3)' }, { id: 'y1' }),
    item('deadline', { title: '반박서면 제출 기한', date: '2026-10-31' }, { id: 'y2' }),
    item('todo', { text: '증인 신청서 작성' }, { id: 'y3' }),
    item('hearing', { date: '2026-11-20', type: '조사기일', time: '14:00', place: '가상경찰서 101호' }, { id: 'y4' }),
    item('progress', { date: '2026-10-17', content: '의뢰인 보고서 송부', detail: '가공 상세' }, { id: 'y5' }),
    item('call', { date: '2026-10-16', title: '의뢰인 통화', detail: '증거 추가 요청', asClientRequest: true }, { id: 'y6' }),
    item('memo', { category: '공식결과메모', title: '검토 결과', content: '가공 내용' }, { id: 'y7' }),
  ]);
  const [{ next, itemIds }] = planBatch(b, makeCases(), ['y1', 'y2', 'y3', 'y4', 'y5', 'y6', 'y7'], { today: TODAY });
  const id = (s) => `cl:${b.batchId}:${s}`;
  const mark = (s) => markOf(b, s);
  assert.deepEqual(itemIds, ['y1', 'y2', 'y3', 'y4', 'y5', 'y6', 'y7']);
  assert.deepEqual(next.briefs.find((x) => x.id === id('y1')), {
    id: id('y1'), title: '준비서면(3)', status: 'pending', preparedDate: TODAY, submittedDate: '', claude: mark('y1'),
  });
  assert.deepEqual(next.memos.find((x) => x.id === id('y2')), {
    id: id('y2'), category: '불변기간', title: '반박서면 제출 기한', content: '', date: '2026-10-31', checked: false, claude: mark('y2'),
  });
  assert.deepEqual(next.todos.find((x) => x.id === id('y3')), {
    id: id('y3'), done: false, text: '증인 신청서 작성', details: '', priority: '보통', dueDate: '', claude: mark('y3'),
  });
  assert.deepEqual(next.hearings.find((x) => x.id === id('y4')), {
    id: id('y4'), date: '2026-11-20', time: '14:00', type: '조사기일', result: '가상경찰서 101호', claude: mark('y4'),
  });
  assert.deepEqual(next.timeline.find((x) => x.id === id('y5')), {
    id: id('y5'), date: '2026-10-17', content: '의뢰인 보고서 송부', detail: '가공 상세', activityType: 'other', claude: mark('y5'),
  });
  assert.deepEqual(next.timeline.find((x) => x.id === id('y6')), {
    id: id('y6'), date: '2026-10-16', content: '[통화/상담] 의뢰인 통화 — 증거 추가 요청', activityType: 'call', claude: mark('y6'),
  });
  assert.deepEqual(next.memos.find((x) => x.id === `${id('y6')}:memo`), {
    id: `${id('y6')}:memo`, category: '의뢰인요청', title: '의뢰인 통화', content: '증거 추가 요청', date: '2026-10-16', claude: mark('y6'),
  });
  assert.deepEqual(next.memos.find((x) => x.id === id('y7')), {
    id: id('y7'), category: '공식결과메모', title: '검토 결과', content: '가공 내용', date: TODAY, claude: mark('y7'),
  });
});

test('call without asClientRequest adds only the progress entry', () => {
  const b = batchOf([item('call', { date: '2026-10-16', title: '상대방 대리인 통화' }, { id: 'z1' })]);
  const [{ next }] = planBatch(b, makeCases(), ['z1'], { today: TODAY });
  assert.equal(next.memos.length, 1);
  assert.equal(next.timeline.at(-1).content, '[통화/상담] 상대방 대리인 통화');
});

test('planBatch keeps existing data and only adds new ids (no overwrite, no removal)', () => {
  const b = batchOf([
    item('todo', { text: '새 할 일' }, { id: 'k1' }),
    item('memo', { category: '일반메모', title: '새 메모' }, { id: 'k2' }),
  ]);
  const cases = makeCases();
  const [{ base, next }] = planBatch(b, cases, ['k1', 'k2'], { today: TODAY });
  const diff = diffCase(base, next);
  assert.deepEqual(diff.set, {});
  assert.deepEqual(Object.keys(diff.arrays).sort(), ['memos', 'todos']);
  assert.deepEqual(diff.arrays.todos.removed, []);
  assert.deepEqual(diff.arrays.memos.removed, []);
  assert.deepEqual(diff.arrays.todos.upserts.map((u) => u.key), [`id:cl:${b.batchId}:k1`]);
  assert.deepEqual(diff.arrays.memos.upserts.map((u) => u.key), [`id:cl:${b.batchId}:k2`]);
  // 서버에서 그 사이 다른 기기가 고친 내용 위에 얹어도 그 내용이 남는다
  const serverLatest = { ...cases[0], memos: [...cases[0].memos, { id: 99, category: '일반메모', title: '다른 기기', content: '', date: TODAY }], title: '다른 기기에서 바꾼 사건명' };
  const merged = applyCaseDiff(serverLatest, diff);
  assert.equal(merged.title, '다른 기기에서 바꾼 사건명');
  assert.ok(merged.memos.some((m) => m.id === 99));
  assert.ok(merged.memos.some((m) => m.id === 31));
  assert.ok(merged.todos.some((t) => t.id === 41));
});

test('applying the same diff twice does not duplicate items (fixed ids)', () => {
  const b = batchOf([item('progress', { date: '2026-10-17', content: '한 번만' }, { id: 'q1' })]);
  const cases = makeCases();
  const [{ base, next }] = planBatch(b, cases, ['q1'], { today: TODAY });
  const diff = diffCase(base, next);
  const once = applyCaseDiff(cases[0], diff);
  const twice = applyCaseDiff(once, diff);
  assert.equal(twice.timeline.filter((t) => t.content === '한 번만').length, 1);
});

test('after applying, the same batch shows as applied and planBatch adds nothing', () => {
  const b = batchOf([
    item('todo', { text: '새 할 일' }, { id: 'r1' }),
    item('brief.submitted', { title: '준비서면(2)', date: '2026-10-17' }, { id: 'r2' }),
    item('call', { date: '2026-10-16', title: '통화', asClientRequest: true }, { id: 'r3' }),
  ]);
  const cases = makeCases();
  const plan = planBatch(b, cases, ['r1', 'r2', 'r3'], { today: TODAY });
  const after = cases.map((c) => plan.find((p) => p.caseId === c.id)?.next || c);
  const report = validateBatch(b, after, null, { today: TODAY });
  assert.deepEqual(report.items.map((r) => r.status), ['applied', 'applied', 'applied']);
  assert.deepEqual(planBatch(b, after, ['r1', 'r2', 'r3'], { today: TODAY }), []);
});

test('planBatch skips unselected, error and applied items even if their ids are passed', () => {
  const b = batchOf([
    item('todo', { text: 'ok' }, { id: 'm1' }),
    item('todo', { text: 'not selected' }, { id: 'm2' }),
    item('todo', { text: 'err' }, { id: 'm3', caseNumber: '2026가단55555' }),
    item('todo', { text: 'done' }, { id: 'm4' }),
  ]);
  const ledger = { batches: { [b.batchId]: { items: { m4: '' } } } };
  const plan = planBatch(b, makeCases(), ['m1', 'm3', 'm4', 'not-there'], { today: TODAY, ledger });
  assert.equal(plan.length, 1);
  assert.deepEqual(plan[0].itemIds, ['m1']);
  assert.equal(plan[0].next.todos.length, 2);
});

test('planBatch groups changes per case in batch order', () => {
  const b = batchOf([
    item('todo', { text: 'c2 할 일' }, { id: 'g1', cmCaseId: C2, caseNumber: '2026가합20000' }),
    item('todo', { text: 'c1 할 일' }, { id: 'g2' }),
    item('memo', { category: '일반메모', title: 'c2 메모' }, { id: 'g3', cmCaseId: C2, caseNumber: '2026가합20000' }),
  ]);
  const plan = planBatch(b, makeCases(), ['g1', 'g2', 'g3'], { today: TODAY });
  assert.deepEqual(plan.map((p) => [p.caseId, p.itemIds]), [[C2, ['g1', 'g3']], [C1, ['g2']]]);
});

test('a warned item can still be applied when the user selects it', () => {
  const b = batchOf([item('deadline', { title: '지난 기한', date: '2026-10-01' }, { id: 'w9' })]);
  const plan = planBatch(b, makeCases(), ['w9'], { today: TODAY });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].next.memos.at(-1).title, '지난 기한');
});

test('applyItem leaves the case unchanged for an unknown op', () => {
  const c = makeCases()[0];
  assert.equal(applyItem(c, { op: 'nope', id: 'a' }, { batchId: 'B' }), c);
});

test('normalizeItem trims strings and fills defaults', () => {
  const { errors, norm } = normalizeItem(item('todo', { text: '  공백  ', details: null }), { today: TODAY });
  assert.deepEqual(errors, []);
  assert.equal(norm.text, '공백');
  assert.equal(norm.details, '');
  assert.equal(norm.priority, '보통');
});

// ── 화면 표시 · 연결 코드 ────────────────────────────────────────────
test('describeItem gives a readable one-line summary', () => {
  const { norm } = normalizeItem(item('hearing', { date: '2026-11-20', type: '조사기일', time: '14:00', place: '가상경찰서' }), { today: TODAY });
  assert.deepEqual(describeItem(norm), { title: '조사기일', meta: '2026-11-20 14:00 · 가상경찰서', body: '' });
});

test('buildBindingCode makes a one-line cm-binding-v1 JSON', () => {
  const cases = makeCases();
  const code = buildBindingCode(cases[0]);
  assert.equal(code.includes('\n'), false);
  assert.deepEqual(JSON.parse(code), { format: 'cm-binding-v1', cmCaseId: C1, caseNumber: '2026가단10000', title: '가나다 물품대금' });
  assert.equal(JSON.parse(buildBindingCode(cases[2])).caseNumber, '');
});

// ── 검토 지적 보완 ───────────────────────────────────────────────────
test('non-string or inherited op values are errors, never ok and never a crash', () => {
  const report = validateBatch(batchOf([
    item('todo', { text: 'a' }, { id: 'op1', op: ['todo'] }),
    item('todo', { text: 'a' }, { id: 'op2', op: 'constructor' }),
    item('todo', { text: 'a' }, { id: 'op3', op: '__proto__' }),
    item('todo', { text: 'a' }, { id: 'op4', op: 'toString' }),
  ]), makeCases(), null, { today: TODAY });
  for (const r of report.items) {
    assert.equal(r.status, 'error', r.id);
    assert.match(r.errors.join(' '), /알 수 없는 op/);
  }
  assert.deepEqual(planBatch(batchOf([item('todo', { text: 'a' }, { id: 'op1', op: ['todo'] })]), makeCases(), ['op1'], { today: TODAY }), []);
});

test('itemFingerprint ignores basis, case number, id and key order but not content', () => {
  const a = normalizeItem(item('todo', { text: '같은 할 일', dueDate: '2026-10-25' }, { id: 'f1', basis: '근거 1' }), { today: TODAY }).norm;
  const b = normalizeItem({ dueDate: '2026-10-25', text: '같은 할 일', op: 'todo', cmCaseId: C1, id: 'f2', basis: '근거 2' }, { today: TODAY }).norm;
  const c = normalizeItem(item('todo', { text: '다른 할 일', dueDate: '2026-10-25' }, { id: 'f1' }), { today: TODAY }).norm;
  assert.match(itemFingerprint(a), /^[0-9a-f]{8}$/);
  assert.equal(itemFingerprint(a), itemFingerprint(b));
  assert.notEqual(itemFingerprint(a), itemFingerprint(c));
});

test('a reused batchId with different content is an error, the same content stays applied', () => {
  const first = batchOf([item('todo', { text: '처음 할 일' }, { id: '01' })], 'sess');
  const cases = makeCases();
  const [{ next, fingerprints }] = planBatch(first, cases, ['01'], { today: TODAY });
  const after = [next, ...cases.slice(1)];
  const ledger = buildLedgerPatch('sess', fingerprints, '2026-10-17T10:00:00Z');
  const reused = batchOf([item('deadline', { title: '다른 내용', date: '2026-10-31' }, { id: '01' })], 'sess');
  for (const [label, cs, lg] of [['ledger', makeCases(), ledger], ['marker', after, null]]) {
    const r = validateBatch(reused, cs, lg, { today: TODAY }).items[0];
    assert.equal(r.status, 'error', label);
    assert.match(r.errors.join(' '), /묶음 id 재사용/, label);
    assert.deepEqual(planBatch(reused, cs, ['01'], { today: TODAY, ledger: lg }), [], label);
  }
  assert.equal(validateBatch(first, after, ledger, { today: TODAY }).items[0].status, 'applied');
});

test('a reused batchId pointing at another case is an error', () => {
  const first = batchOf([item('todo', { text: '할 일' }, { id: '01' })], 'sess2');
  const [{ fingerprints }] = planBatch(first, makeCases(), ['01'], { today: TODAY });
  const ledger = buildLedgerPatch('sess2', fingerprints, '2026-10-17T10:00:00Z');
  const moved = batchOf([item('todo', { text: '할 일' }, { id: '01', cmCaseId: C2, caseNumber: '2026가합20000' })], 'sess2');
  assert.equal(validateBatch(moved, makeCases(), ledger, { today: TODAY }).items[0].status, 'error');
});

test('compareCaseNumber handles separators, annotations and court prefixes without loose matching', () => {
  assert.equal(compareCaseNumber('2026가단12', { caseNumber: '2026가단1·2' }), 'mismatch');
  assert.equal(compareCaseNumber('2026가단1', { caseNumber: '2026가단1·2' }), 'match');
  assert.equal(compareCaseNumber('2026가단1', { caseNumber: '2026가단1(본소), 2026가단2(반소)' }), 'partial');
  assert.equal(compareCaseNumber('2026가단2', { caseNumber: '2026가단1(본소), 2026가단2(반소)' }), 'partial');
  assert.equal(compareCaseNumber('2026가단3', { caseNumber: '2026가단1(본소), 2026가단2(반소)' }), 'mismatch');
  assert.equal(compareCaseNumber('2026가단1(본소), 2026가단2(반소)', { caseNumber: '2026가단1(본소), 2026가단2(반소)' }), 'match');
  assert.equal(compareCaseNumber('2026가단1', { caseNumber: '2026가단1 외 1건' }), 'partial');
  assert.equal(compareCaseNumber('2026가단1', { caseNumber: '가상지방법원 2026가단1' }), 'partial');
  assert.equal(compareCaseNumber('2026가단1', { caseNumber: '2027나100 (원심 2026가단1)' }), 'partial');
  assert.equal(compareCaseNumber('2026가단10', { caseNumber: '2026가단1' }), 'mismatch');
  assert.equal(compareCaseNumber('2026-가상형사-1122', { caseNumber: '2026-가상형사-1122' }), 'match');
  assert.equal(compareCaseNumber('2026-가상형사-1123', { caseNumber: '2026-가상형사-1122' }), 'mismatch');
});

test('brief.submitted ignores a stale submit link on the pending brief and never touches other progress', () => {
  const cases = makeCases();
  cases[0].timeline.push({ id: 99, date: '2026-09-01', content: '준비서면(1) 제출', activityType: 'document' });
  cases[0].briefs[0] = { ...cases[0].briefs[0], submitTimelineId: 99, submittedDate: '2026-09-01' };
  const b = batchOf([item('brief.submitted', { title: '준비서면(2)', date: '2026-10-17', details: '가공 메모' }, { id: 's9' })]);
  const [{ next }] = planBatch(b, cases, ['s9'], { today: TODAY });
  assert.deepEqual(next.timeline.find((t) => t.id === 99), { id: 99, date: '2026-09-01', content: '준비서면(1) 제출', activityType: 'document' });
  const brief = next.briefs.find((x) => x.id === 51);
  assert.equal(brief.submittedDate, '2026-10-17');
  assert.equal(brief.submitTimelineId, `cl:${b.batchId}:s9:tl`);
  assert.equal(brief.details, '가공 메모'); // 비어 있던 메모만 채움
  assert.ok(next.timeline.some((t) => t.id === `cl:${b.batchId}:s9:tl` && t.claude?.itemId === 's9'));
});

test('brief.submitted keeps existing brief details and skips briefs without an id', () => {
  const cases = makeCases();
  cases[0].briefs = [
    { title: '준비서면(2)', status: 'pending' },
    { id: 52, title: '준비서면(2)', status: 'pending', details: '기존 메모' },
  ];
  const b = batchOf([item('brief.submitted', { title: '준비서면(2)', date: '2026-10-17', details: '새 메모' }, { id: 's10' })]);
  const [{ next }] = planBatch(b, cases, ['s10'], { today: TODAY });
  assert.equal(next.briefs[0].status, 'pending');
  assert.equal(next.briefs[1].status, 'submitted');
  assert.equal(next.briefs[1].details, '기존 메모');
});

test('a completed todo with the same text and a pending brief after its own submission are warned', () => {
  const cases = makeCases();
  cases[0].todos.push({ id: 42, text: '완료한 일', done: true, priority: '보통', dueDate: '' });
  const report = validateBatch(batchOf([
    item('todo', { text: '완료한 일' }, { id: 'v1' }),
    item('brief.submitted', { title: '의견서', date: '2026-10-17' }, { id: 'v2' }),
    item('brief.pending', { title: '의견서' }, { id: 'v3' }),
  ]), cases, null, { today: TODAY });
  assert.match(statusOf(report, 'v1').warnings.join(' '), /이미 완료되어 있음/);
  assert.match(statusOf(report, 'v3').warnings.join(' '), /제출대기 서면이 하나 더 생김/);
});

test('planBatch skips an item that turned from ok to warn after the user looked at it', () => {
  const b = batchOf([item('hearing', { date: '2026-11-20', type: '조사기일', time: '14:00' }, { id: 'h1' })]);
  const cases = makeCases();
  const seen = { h1: validateBatch(b, cases, null, { today: TODAY }).items[0].status };
  assert.equal(seen.h1, 'ok');
  cases[0].hearings.push({ id: 12, date: '2026-11-20', time: '10:00', type: '변론기일', result: '' }); // 그 사이 LBOX 기일이 들어옴
  assert.deepEqual(planBatch(b, cases, ['h1'], { today: TODAY, seen }), []);
  assert.equal(planBatch(b, cases, ['h1'], { today: TODAY, seen: { h1: 'warn' } }).length, 1);
});

test('the same batch pasted again on a later day stays applied (today defaults are not fingerprinted)', () => {
  const b = batchOf([
    item('memo', { category: '일반메모', title: '날짜 없는 메모', content: '가공' }, { id: 'd1' }),
    item('brief.pending', { title: '날짜 없는 서면' }, { id: 'd2' }),
  ]);
  const cases = makeCases();
  const plan = planBatch(b, cases, ['d1', 'd2'], { today: '2026-10-17' });
  const after = [plan[0].next, ...cases.slice(1)];
  const ledger = buildLedgerPatch(b.batchId, plan[0].fingerprints, '2026-10-17T10:00:00Z');
  for (const [cs, lg] of [[after, null], [makeCases(), ledger]]) {
    const report = validateBatch(b, cs, lg, { today: '2026-10-20' });
    assert.deepEqual(report.items.map((r) => r.status), ['applied', 'applied']);
  }
});

test('a partial case-number match is a warning, not selected by default', () => {
  const cases = makeCases();
  cases[0].caseNumber = '2027나100 (원심 2026가단10000)';
  const report = validateBatch(batchOf([item('todo', { text: 'a' }, { id: 'pc1' })]), cases, null, { today: TODAY });
  assert.equal(report.items[0].status, 'warn');
  assert.match(report.items[0].warnings.join(' '), /일부와만 일치/);
  assert.deepEqual(defaultSelectedIds(report), []);
});

test('a memo with the same category, title and content on another date is warned', () => {
  const cases = makeCases();
  const report = validateBatch(batchOf([item('memo', { category: '일반메모', title: '기존 메모', content: '보존', date: '2026-10-17' }, { id: 'mm1' })]), cases, null, { today: TODAY });
  assert.match(report.items[0].warnings.join(' '), /날짜만 다름/);
});

test('buildLedgerPatch and ledgerBatchesToPrune keep the ledger small', () => {
  assert.deepEqual(buildLedgerPatch('B1', { i1: 'aaaa0001' }, 'T1'), { batches: { B1: { at: 'T1', items: { i1: 'aaaa0001' } } }, updatedAt: 'T1' });
  const ledger = { batches: { old: { at: '2026-01-01T00:00:00Z' }, mid: { at: '2026-05-01T00:00:00Z' }, new: { at: '2026-10-01T00:00:00Z' } } };
  assert.deepEqual(ledgerBatchesToPrune(ledger, 2), ['old']);
  assert.deepEqual(ledgerBatchesToPrune(ledger, 3), []);
  assert.deepEqual(ledgerBatchesToPrune(null, 3), []);
});
