import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTaskItem, carryForwardPendingDocs } from './journalLogic.js';

test('normalizeTaskItem preserves case link, details, and sync ids', () => {
  const out = normalizeTaskItem({
    id: 'p1', text: '준비서면 제출', done: false,
    cmCaseId: 'c1', cmCaseTitle: '사건A', details: '1차 변론용',
    googleEventId: 'g1', cmBriefId: 12345, cmBriefSyncedAt: '2026-06-20T00:00:00Z',
  }, 'pending-doc');

  assert.equal(out.cmCaseId, 'c1');
  assert.equal(out.cmCaseTitle, '사건A');
  assert.equal(out.details, '1차 변론용');
  assert.equal(out.googleEventId, 'g1');
  assert.equal(out.cmBriefId, 12345);
  assert.equal(out.cmBriefSyncedAt, '2026-06-20T00:00:00Z');
});

test('normalizeTaskItem defaults link fields to empty when absent', () => {
  const out = normalizeTaskItem({ id: 'p1', text: '서면' }, 'pending-doc');
  assert.equal(out.cmCaseId, '');
  assert.equal(out.cmCaseTitle, '');
  assert.equal(out.details, '');
});

test('carryForwardPendingDocs keeps the case link on a forwarded item', () => {
  const entries = {
    '2026-06-20': {
      pendingDocItems: JSON.stringify([
        { id: 'p1', text: '준비서면 제출', done: false, cmCaseId: 'c1', cmCaseTitle: '사건A' },
      ]),
    },
  };
  const carried = carryForwardPendingDocs(entries, '2026-06-21');
  const item = carried.find((i) => i.text === '준비서면 제출');
  assert.ok(item, '이월된 항목이 있어야 함');
  assert.equal(item.cmCaseId, 'c1');
  assert.equal(item.cmCaseTitle, '사건A');
});
