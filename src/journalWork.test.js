import test from 'node:test';
import assert from 'node:assert/strict';
import {
  workTimelineEntry, workClientRequestMemo, workActivityType, countUnrecordedWork,
  workItemExportLine, workItemFromExportLine, legacyCallAsWork, hasWorkBody,
} from './journalWork.js';
import { buildJournalRows } from './exportSheet.js';
import { journalEntryFromExportRow, buildJournalCrossCheck } from './restorePlan.js';
import { mergeJournalEntries } from './journalMerge.js';
import { buildCallTimelineContent } from './caseLink.js';

const J = (v) => JSON.stringify(v);

test('오늘 한 일 → 진행경과: 종류별 유형, 통화는 예전 통화 기록과 같은 한 줄', () => {
  assert.deepEqual(workTimelineEntry({ kind: 'progress', content: '준비서면 제출', detail: '갑 5호증 첨부', activityType: 'document', date: '2026-10-21' }),
    { date: '2026-10-21', content: '준비서면 제출', detail: '갑 5호증 첨부', activityType: 'document' });
  assert.deepEqual(workTimelineEntry({ kind: 'progress', content: '기록 검토' }, '2026-10-21'),
    { date: '2026-10-21', content: '기록 검토', detail: '', activityType: 'other' });
  assert.deepEqual(workTimelineEntry({ kind: 'call', content: '의뢰인', detail: '기일 안내' }, '2026-10-21'),
    { date: '2026-10-21', content: buildCallTimelineContent({ title: '의뢰인', detail: '기일 안내' }), activityType: 'call' });
  assert.equal(workTimelineEntry({ kind: 'meeting', content: '사무실 회의' }).activityType, 'meeting');
  assert.equal(workActivityType({ kind: 'etc', activityType: 'document' }), 'other');
  assert.equal(workActivityType({ kind: 'progress', activityType: '없는유형' }), 'other');
  // 내용 없이 상세만 있으면 상세를 내용으로
  assert.deepEqual(workTimelineEntry({ kind: 'etc', detail: '상세만' }, '2026-10-21'), { date: '2026-10-21', content: '상세만', detail: '', activityType: 'other' });
});

test('의뢰인요청 체크 항목만 의뢰인요청 메모를 만든다', () => {
  assert.equal(workClientRequestMemo({ kind: 'call', content: '의뢰인' }), null);
  assert.deepEqual(workClientRequestMemo({ kind: 'call', content: '', detail: '자료 요청', asClientRequest: true }, '2026-10-21'),
    { category: '의뢰인요청', title: '통화/상담', content: '자료 요청', date: '2026-10-21' });
  assert.equal(workClientRequestMemo({ kind: 'meeting', content: '면담', asClientRequest: true, date: '2026-10-20' }).date, '2026-10-20');
});

test('사건을 골랐는데 아직 기록하지 않은 항목만 미기록으로 센다', () => {
  assert.equal(countUnrecordedWork([
    { id: 1, content: '사건 무관 메모' },
    { id: 2, content: '진행', caseId: 'c1' },
    { id: 3, content: '기록함', caseId: 'c1', recordedAt: 'x' },
    { id: 4, content: '', detail: '', caseId: 'c1' },
  ]), 1);
  assert.equal(hasWorkBody(legacyCallAsWork({ title: '의뢰인 통화' })), true);
});

test('내보내기 한 줄과 복원이 서로 맞는다', () => {
  const it = { kind: 'call', content: '의뢰인', detail: '기일 안내', caseTitle: '강남연립', asClientRequest: true, recordedAt: 'x' };
  const line = workItemExportLine(it);
  assert.equal(line, '[통화] 의뢰인 — 기일 안내 (강남연립) [의뢰인요청] ✓기록');
  const back = workItemFromExportLine(line, '2026-10-21', 0);
  assert.equal(back.kind, 'call');
  assert.equal(back.content, '의뢰인');
  assert.equal(back.detail, '기일 안내');
  assert.equal(back.caseTitle, '강남연립');
  assert.equal(back.asClientRequest, true);
  assert.equal(back.recordedAt, '2026-10-21T00:00:00+09:00');
  const plain = workItemFromExportLine('[기타] 사건 무관 메모', '2026-10-21', 1);
  assert.equal(plain.kind, 'etc');
  assert.equal('recordedAt' in plain, false);
});

test('업무일지 내보내기에 「오늘 한 일」 열이 붙고, 그 열로 복원한다', () => {
  const rows = buildJournalRows({ '2026-10-21': { workItems: J([{ id: 'w1', kind: 'meeting', content: '사무실 회의' }, { id: 'w2', kind: 'etc', content: '' }]) } });
  const header = rows[0];
  const col = header.indexOf('오늘 한 일');
  assert.equal(col, header.length - 1);
  assert.equal(rows[1][col], '[회의] 사무실 회의');
  const row = Object.fromEntries(header.map((h, i) => [h, rows[1][i]]));
  const entry = journalEntryFromExportRow(row, '2026-10-21');
  assert.deepEqual(JSON.parse(entry.workItems).map((w) => [w.kind, w.content]), [['meeting', '사무실 회의']]);
});

test('일지 → 사건 기록 복구에 「오늘 한 일」도 들어간다(기록한 항목만)', () => {
  const journal = {
    '2026-10-21': { workItems: J([
      { id: 'w1', kind: 'call', content: '의뢰인', detail: '자료 요청', caseId: 'c1', recordedAt: 'x', timelineId: 101, memoId: 102, asClientRequest: true },
      { id: 'w2', kind: 'progress', content: '아직 안 씀', caseId: 'c1' },
    ]) },
  };
  const out = buildJournalCrossCheck(journal, [{ id: 'c1', title: '강남연립', timeline: [], memos: [] }]);
  const items = out.get('c1');
  assert.ok(items, '사건 c1 복구 항목');
  const ids = items.map((x) => x.item.id);
  assert.ok(ids.includes(101));
  assert.ok(ids.includes(102));
  assert.equal(items.length, 2);
});

test('오늘 한 일은 다른 기기와 항목 단위로 합친다', () => {
  const base = { workItems: J([{ id: 'a', content: '처음' }]) };
  const mine = { workItems: J([{ id: 'a', content: '처음' }, { id: 'b', content: '이 기기' }]) };
  const theirs = { workItems: J([{ id: 'a', content: '처음' }, { id: 'c', content: '다른 기기' }]) };
  const r = mergeJournalEntries(base, mine, theirs);
  assert.equal(r.unresolved.length, 0);
  assert.deepEqual(JSON.parse(r.merged.workItems).map((i) => i.id).sort(), ['a', 'b', 'c']);
});
