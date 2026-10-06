import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRawBackupRows, parseRawBackupRows, splitForCells, RAW_FORMAT } from './rawBackup.js';

test('원본 백업은 사건·업무일지·설정 문서를 그대로 되살린다', () => {
  const data = {
    cases: [
      { id: 'c1', title: '강남연립 손해배상', timeline: [{ id: 1, date: '2026-10-06', content: '현장 확인', detail: '상세 메모' }], todos: [{ id: 2, text: 'x', done: true }] },
      { id: 'c2', title: '원기업 민사', briefs: [{ id: 3, title: '준비서면', status: 'submitted' }] },
    ],
    journal: { '2026-10-06': { entryDate: '2026-10-06', pendingDocItems: '[{"id":"d1","text":"소장"}]', _savedAt: '2026-10-06T01:00:00Z' } },
    meta: { taskSync: { ignoredTaskIds: ['t1'] }, empty: null },
  };
  const rows = buildRawBackupRows(data, { createdAt: '2026-10-06T10:00:00Z', appBuild: 'b1' });
  assert.deepEqual(rows[0], ['경로', '조각', '내용']);
  const parsed = parseRawBackupRows(rows);
  assert.equal(parsed.info.format, RAW_FORMAT);
  assert.equal(parsed.info.createdAt, '2026-10-06T10:00:00Z');
  assert.deepEqual(parsed.info.counts, { cases: 2, journal: 1, meta: 2 });
  assert.deepEqual(parsed.cases, data.cases);
  assert.deepEqual(parsed.journal, data.journal);
  assert.deepEqual(parsed.meta, { taskSync: { ignoredTaskIds: ['t1'] } });
  assert.deepEqual(parsed.errors, []);
});

test('큰 문서는 칸 한도(5만 자) 안으로 나눠 담고 순서대로 다시 잇는다', () => {
  const big = { id: 'c1', memos: Array.from({ length: 3000 }, (_, i) => ({ id: i, content: `메모 ${i} `.repeat(5) })) };
  const rows = buildRawBackupRows({ cases: [big] });
  const pieces = rows.filter((r) => r[0] === 'cases/c1');
  assert.ok(pieces.length > 1);
  assert.ok(pieces.every((r) => r[2].length <= 40000));
  // 시트에서 읽을 때 순서가 섞여도 조각 번호로 다시 잇는다
  const shuffled = [rows[0], rows[1], ...pieces.reverse()];
  assert.deepEqual(parseRawBackupRows(shuffled).cases[0], big);
});

test('이모지 같은 두 글자짜리 문자가 조각 경계에서 깨지지 않는다', () => {
  const text = 'a'.repeat(9) + '😀' + 'b'.repeat(5);
  const parts = splitForCells(text, 10);
  assert.equal(parts.join(''), text);
  assert.ok(parts.every((p) => !/[\uD800-\uDBFF]$/.test(p)));
});

test('원본 백업 시트가 아니면 null', () => {
  assert.equal(parseRawBackupRows([['사건명', '분류']]), null);
  assert.equal(parseRawBackupRows([['경로', '조각', '내용'], ['#info', '0', '{"format":"other"}']]), null);
  assert.equal(parseRawBackupRows(null), null);
});

test('손상된 조각은 건너뛰고 알려 준다', () => {
  const rows = [['경로', '조각', '내용'], ['#info', '0', JSON.stringify({ format: RAW_FORMAT })], ['cases/c1', '0', '{"id":"c1"'], ['cases/c2', '0', '{"id":"c2"}']];
  const parsed = parseRawBackupRows(rows);
  assert.deepEqual(parsed.cases, [{ id: 'c2' }]);
  assert.deepEqual(parsed.errors, ['cases/c1']);
});
