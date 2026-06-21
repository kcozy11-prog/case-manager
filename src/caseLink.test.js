import test from 'node:test';
import assert from 'node:assert/strict';
import {
  upsertTimelineEntry,
  upsertCaseMemo,
  upsertBrief,
  buildCallTimelineContent,
  computeRetainerPayups,
} from './caseLink.js';

// ── upsertTimelineEntry ──────────────────────────────────────────────
test('upsertTimelineEntry appends a new entry when id is unseen', () => {
  const c = { id: 'c1', timeline: [{ id: 1, date: '2026-01-01', content: '수임' }] };
  const out = upsertTimelineEntry(c, { id: 2, date: '2026-02-01', content: '소장 접수' });
  assert.equal(out.timeline.length, 2);
  assert.deepEqual(out.timeline[1], { id: 2, date: '2026-02-01', content: '소장 접수' });
});

test('upsertTimelineEntry replaces date/content of an existing id (no duplicate)', () => {
  const c = { id: 'c1', timeline: [{ id: 7, date: '2026-01-01', content: '초안' }] };
  const out = upsertTimelineEntry(c, { id: 7, date: '2026-01-02', content: '최종본' });
  assert.equal(out.timeline.length, 1);
  assert.deepEqual(out.timeline[0], { id: 7, date: '2026-01-02', content: '최종본' });
});

test('upsertTimelineEntry handles a case with no timeline array', () => {
  const c = { id: 'c1' };
  const out = upsertTimelineEntry(c, { id: 1, date: '2026-01-01', content: 'x' });
  assert.equal(out.timeline.length, 1);
});

test('upsertTimelineEntry does not mutate the input case', () => {
  const c = { id: 'c1', timeline: [{ id: 1, date: '2026-01-01', content: 'a' }] };
  const before = JSON.stringify(c);
  upsertTimelineEntry(c, { id: 2, date: '2026-02-01', content: 'b' });
  assert.equal(JSON.stringify(c), before);
});

// ── upsertCaseMemo ───────────────────────────────────────────────────
test('upsertCaseMemo appends a new memo by id', () => {
  const c = { id: 'c1', memos: [] };
  const out = upsertCaseMemo(c, { id: 5, category: '의뢰인요청', title: '계약서', content: '원본', date: '2026-02-01' });
  assert.equal(out.memos.length, 1);
  assert.equal(out.memos[0].category, '의뢰인요청');
});

test('upsertCaseMemo replaces an existing memo with the same id', () => {
  const c = { id: 'c1', memos: [{ id: 5, category: '의뢰인요청', title: '구', content: '구내용', date: '2026-02-01' }] };
  const out = upsertCaseMemo(c, { id: 5, category: '의뢰인요청', title: '신', content: '신내용', date: '2026-02-02' });
  assert.equal(out.memos.length, 1);
  assert.equal(out.memos[0].title, '신');
  assert.equal(out.memos[0].content, '신내용');
});

// ── upsertBrief ──────────────────────────────────────────────────────
test('upsertBrief appends a pending brief when id is unseen', () => {
  const c = { id: 'c1', briefs: [] };
  const out = upsertBrief(c, { id: 9, title: '준비서면 2호', preparedDate: '2026-03-01' });
  assert.equal(out.briefs.length, 1);
  assert.deepEqual(out.briefs[0], { id: 9, title: '준비서면 2호', status: 'pending', preparedDate: '2026-03-01', submittedDate: '' });
});

test('upsertBrief updates title but preserves submitted status on re-send', () => {
  const c = { id: 'c1', briefs: [{ id: 9, title: '준비서면 2호', status: 'submitted', preparedDate: '2026-03-01', submittedDate: '2026-03-05' }] };
  const out = upsertBrief(c, { id: 9, title: '준비서면 2호(수정)', preparedDate: '2026-03-01' });
  assert.equal(out.briefs.length, 1);
  assert.equal(out.briefs[0].title, '준비서면 2호(수정)');
  assert.equal(out.briefs[0].status, 'submitted');
  assert.equal(out.briefs[0].submittedDate, '2026-03-05');
});

// ── buildCallTimelineContent ─────────────────────────────────────────
test('buildCallTimelineContent joins title and detail with a dash', () => {
  assert.equal(buildCallTimelineContent({ title: '의뢰인 통화', detail: '합의 의향 확인' }), '[통화/상담] 의뢰인 통화 — 합의 의향 확인');
});

test('buildCallTimelineContent omits the dash when there is no detail', () => {
  assert.equal(buildCallTimelineContent({ title: '의뢰인 통화', detail: '' }), '[통화/상담] 의뢰인 통화');
});

test('buildCallTimelineContent uses detail alone when there is no title', () => {
  assert.equal(buildCallTimelineContent({ title: '', detail: '상대방 연락' }), '[통화/상담] 상대방 연락');
});

// ── computeRetainerPayups ────────────────────────────────────────────
test('computeRetainerPayups marks unpaid cases as fully paid', () => {
  const cases = [{ id: 'c1', retainer: { amount: 3000000, paidAmount: '' } }];
  const out = computeRetainerPayups(cases);
  assert.equal(out.length, 1);
  assert.equal(out[0].retainer.paidAmount, 3000000);
});

test('computeRetainerPayups coerces string amounts and fills partial payments', () => {
  const cases = [{ id: 'c1', retainer: { amount: '5000000', paidAmount: 2000000 } }];
  const out = computeRetainerPayups(cases);
  assert.equal(out.length, 1);
  assert.equal(out[0].retainer.paidAmount, '5000000');
});

test('computeRetainerPayups skips fully paid and zero/empty amount cases', () => {
  const cases = [
    { id: 'c1', retainer: { amount: 3000000, paidAmount: 3000000 } }, // 완납
    { id: 'c2', retainer: { amount: '', paidAmount: '' } },           // 약정 없음
    { id: 'c3', retainer: { amount: 0, paidAmount: 0 } },             // 0원
  ];
  assert.equal(computeRetainerPayups(cases).length, 0);
});

test('computeRetainerPayups returns only changed cases and does not mutate input', () => {
  const cases = [
    { id: 'c1', retainer: { amount: 3000000, paidAmount: '' } },
    { id: 'c2', retainer: { amount: 2000000, paidAmount: 2000000 } },
  ];
  const before = JSON.stringify(cases);
  const out = computeRetainerPayups(cases);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'c1');
  assert.equal(JSON.stringify(cases), before);
});

test('computeRetainerPayups preserves other retainer fields', () => {
  const cases = [{ id: 'c1', retainer: { amount: 3000000, paidAmount: '', date: '2026-01-15', successFee: '10%' } }];
  const out = computeRetainerPayups(cases);
  assert.equal(out[0].retainer.date, '2026-01-15');
  assert.equal(out[0].retainer.successFee, '10%');
});
