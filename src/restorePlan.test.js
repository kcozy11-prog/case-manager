import test from 'node:test';
import assert from 'node:assert/strict';
import {
  snapshotFromExportSheets, journalEntryFromExportRow, buildRestorePlan, buildJournalCrossCheck,
  applyPlanSelection, revertRestoreForCase, WORK_SUMMARY_TITLE,
} from './restorePlan.js';
import { emptyCase } from './utils.js';

// 내보내기 파일과 같은 모양의 시트
const SHEETS = {
  '사건 목록': [
    ['사건명', '분류', '상태', '의뢰인', '연락처', '상대방', '관할기관', '사건번호', '담당자', '소속', '수임일', '착수금', '성공보수', '성공보수금액'],
    ['강남연립 손해배상', '민사', '진행중', '강남연립', '', '시공사', '서울중앙지방법원', '2026가합1001', '', '', '2026-03-01', '330', '', ''],
    ['원기업 민사', '민사', '종결', '원기업', '', '전현영', '수원지방법원', '2026가단2002', '', '', '', '', '', ''],
    ['지운 사건', '민사', '진행중', '홍길동', '', '', '', '', '', '', '', '', '', ''],
  ],
  '기일': [
    ['사건명', '날짜', '시간', '유형', '결과/장소', '메모', '캘린더'],
    ['강남연립 손해배상', '2026-10-20', '14:00', '변론기일', '서관 451호', '', 'LBOX'],
  ],
  '메모': [
    ['사건명', '카테고리', '제목', '내용', '날짜', '체크'],
    ['강남연립 손해배상', '불변기간', '항소기한', '판결송달 후 2주', '2026-09-01', ''],
    ['강남연립 손해배상', '공식결과메모', WORK_SUMMARY_TITLE, '• 2026-09-01 미팅', '2026-09-20', ''],
  ],
  '진행경과': [
    ['사건명', '날짜', '내용'],
    ['강남연립 손해배상', '2026-09-01', '소장 접수'],
    ['강남연립 손해배상', '2026-09-15', '감정신청서 제출'],
    ['원기업 민사', '2026-09-10', '조정 성립'],
  ],
  '할 일': [
    ['사건명', '할일', '완료', '우선순위', '기한'],
    ['강남연립 손해배상', '준비서면 작성', 'Y', '높음', '2026-09-20'],
    ['강남연립 손해배상', '감정료 예납', '', '보통', '2026-10-01'],
  ],
  '서면': [
    ['사건명', '서면', '상태', '작성일', '제출일'],
    ['강남연립 손해배상', '준비서면(1)', '제출완료', '2026-09-18', '2026-09-19'],
    ['원기업 민사', '참고서면', '제출대기', '2026-09-05', ''],
  ],
  '업무일지': [
    ['날짜', '출근', '퇴근', '오늘 업무', '오늘 할 일', '내일 할 일', '제출 예정 서면', '위임 업무', '통화·상담 메모', '배운 점', '기타', '사건 진행 기록', '통화 상담 기록'],
    ['2026-09-20', '09:00', '', '강남연립 감정 준비', '[완료] 기록 열람 (강남연립 손해배상)', '', '준비서면 (강남연립 손해배상) ~2026-09-23', '', '', '[실무 팁] 감정 — 신청 전 예납 확인', '', '감정신청서 제출 (강남연립 손해배상) ✓기록', ''],
    ['2026-09-21', '', '', '원기업 조정', '', '', '', '', '', '', '', '', ''],
  ],
};

// 지금 서버 데이터: 강남연립은 일부 기록이 사라지고 상태가 되돌아감, 원기업은 '진행중'으로 돌아감
const currentCases = () => [
  {
    ...emptyCase(), id: 'c100', title: '강남연립 손해배상', status: '진행중', client: '강남연립', opponent: '시공사', caseNumber: '2026가합1001',
    hearings: [{ id: 1, date: '2026-10-20', time: '14:00', type: '변론기일', result: '서관 451호', fromCalendar: true }],
    timeline: [
      { id: 2, date: '2026-09-01', content: '소장 접수' },
      { id: 3, date: '2026-10-06', content: '강남연립 현장 확인(오늘 보완)' },
    ],
    memos: [],
    todos: [{ id: 4, text: '준비서면 작성', done: false, priority: '높음', dueDate: '2026-09-20' }],
    briefs: [{ id: 5, title: '준비서면(1)', status: 'pending', preparedDate: '2026-09-18', submittedDate: '' }],
  },
  {
    // 제목이 바뀌었지만 사건번호로 같은 사건임을 알아본다
    ...emptyCase(), id: 'c200', title: '원기업 민사(본안)', status: '진행중', client: '원기업', opponent: '전현영', caseNumber: '2026가단 2002',
    timeline: [{ id: 6, date: '2026-09-10', content: '조정 성립' }, { id: 7, date: '2026-10-06', content: '원기업 진행경과 보완' }],
  },
];

const ids = (list) => list.map((i) => i.kind + ':' + i.field + ':' + i.text);

test('내보내기 시트를 사건별 사본으로 읽는다', () => {
  const snap = snapshotFromExportSheets(SHEETS, { label: '9. 21. 내보내기' });
  assert.equal(snap.source, 'export');
  const gn = snap.cases.find((c) => c.title === '강남연립 손해배상');
  assert.equal(gn.caseNumber, '2026가합1001');
  assert.equal(gn.retainer.amount, '330');
  assert.deepEqual(gn.hearings[0], { date: '2026-10-20', time: '14:00', type: '변론기일', result: '서관 451호', fromCalendar: true });
  assert.equal(gn.todos[0].done, true);
  assert.equal(gn.briefs[0].status, 'submitted');
  assert.equal(snap.cases.find((c) => c.title === '원기업 민사').status, '종결');
  assert.deepEqual(Object.keys(snap.journal), ['2026-09-20', '2026-09-21']);
});

test('없어진 기록·되돌아간 상태만 후보로 만들고, 지금 있는 기록은 건드리지 않는다', () => {
  const snap = snapshotFromExportSheets(SHEETS);
  const plan = buildRestorePlan(snap, { cases: currentCases(), journal: { '2026-09-21': { todayWork: 'x' } } });
  const gn = plan.cases.find((p) => p.targetId === 'c100');
  assert.deepEqual(ids(gn.items).sort(), [
    'add:memos:항소기한 — 판결송달 후 2주',
    'add:timeline:감정신청서 제출',
    'add:todos:감정료 예납',
    'status:briefs:준비서면(1) — 그때 제출완료 → 지금 제출대기',
    'status:todos:준비서면 작성 — 그때 완료 → 지금 미완료',
  ].sort());
  assert.ok(!gn.items.some((i) => i.text.includes(WORK_SUMMARY_TITLE)), '캘린더 업무 요약 메모는 복원 대상이 아니다');
  const ok = plan.cases.find((p) => p.targetId === 'c200');
  assert.equal(ok.matchedBy, 'caseNumber');
  assert.deepEqual(ids(ok.items), ['info:status:그때 \'종결\' → 지금 \'진행중\'', 'add:briefs:참고서면']);
  assert.equal(ok.items[0].defaultOn, true);
  // 제출대기였던 서면이 지금 없으면 후보이되 기본 선택은 하지 않는다(이미 처리해 지운 서면이 되살아나지 않게)
  assert.equal(ok.items[1].defaultOn, false);
  // 제출완료였던 서면은 기록이므로 기본 선택
  assert.equal(gn.items.find((i) => i.kind === 'status' && i.field === 'briefs').defaultOn, true);
});

test('사건이 통째로 없으면 후보로 보이되 기본 선택은 하지 않는다', () => {
  const plan = buildRestorePlan(snapshotFromExportSheets(SHEETS), { cases: currentCases(), journal: {} });
  const gone = plan.cases.find((p) => !p.targetId);
  assert.equal(gone.title, '지운 사건');
  assert.equal(gone.items[0].kind, 'createCase');
  assert.equal(gone.items[0].defaultOn, false);
  // 예시 사건처럼 제외 목록에 있으면 아예 빼는다
  const plan2 = buildRestorePlan(snapshotFromExportSheets(SHEETS), { cases: currentCases(), journal: {} }, { ignoreTitles: ['지운 사건'] });
  assert.ok(!plan2.cases.some((p) => !p.targetId));
});

test('날짜만 고친 진행경과는 같은 기록으로 본다', () => {
  const cases = currentCases();
  cases[0].timeline.push({ id: 9, date: '2026-09-16', content: '감정신청서 제출' });
  const plan = buildRestorePlan(snapshotFromExportSheets(SHEETS), { cases, journal: {} });
  const gn = plan.cases.find((p) => p.targetId === 'c100');
  assert.ok(!gn.items.some((i) => i.field === 'timeline'));
});

test('업무일지에만 남은 진행 기록은 같은 id 로 되살리고, 내보내기 비교에서 중복 후보를 만들지 않는다', () => {
  const journal = {
    '2026-09-15': {
      caseProgressItems: JSON.stringify([{ id: 'p1', caseId: 'c100', content: '감정신청서 제출', date: '2026-09-15', timelineId: 777, recordedAt: '2026-09-15T05:00:00Z', activityType: 'document' }]),
      callLogItems: JSON.stringify([{ id: 'k1', caseId: 'c200', title: '의뢰인 통화', detail: '조정안 수용', date: '2026-09-09', timelineId: 888, memoId: 889, asClientRequest: true, recordedAt: 'x' }]),
    },
  };
  const cross = buildJournalCrossCheck(journal, currentCases());
  assert.deepEqual(cross.get('c100').map((c) => [c.field, c.item.id, c.item.activityType]), [['timeline', 777, 'document']]);
  assert.deepEqual(cross.get('c200').map((c) => [c.field, c.item.id]), [['timeline', 888], ['memos', 889]]);
  const plan = buildRestorePlan(snapshotFromExportSheets(SHEETS), { cases: currentCases(), journal });
  const gnTimeline = plan.cases.find((p) => p.targetId === 'c100').items.filter((i) => i.field === 'timeline');
  assert.equal(gnTimeline.length, 1, '내보내기 쪽 같은 기록은 후보에서 빠진다');
  assert.equal(gnTimeline[0].keepId, true);
});

test('업무일지 날짜가 통째로 없으면 복원 후보, 있으면 건드리지 않는다', () => {
  const plan = buildRestorePlan(snapshotFromExportSheets(SHEETS), { cases: currentCases(), journal: { '2026-09-21': { todayWork: '지금 판본' } } });
  assert.deepEqual(plan.journal.map((j) => j.date), ['2026-09-20']);
});

test('복원 일지: 이월되는 목록은 기타에 글로만 남기고, 진행 기록은 기록됨으로 둔다', () => {
  const header = SHEETS['업무일지'][0];
  const row = Object.fromEntries(header.map((h, i) => [h, SHEETS['업무일지'][1][i]]));
  const e = journalEntryFromExportRow(row, '2026-09-20', '9. 21. 내보내기');
  assert.equal(e.pendingDocItems, '[]');
  assert.equal(e.todayTasks, '[]');
  assert.match(e.etc, /9\. 21\. 내보내기에서 복원한 목록/);
  assert.match(e.etc, /■ 제출 예정 서면\n준비서면 \(강남연립 손해배상\) ~2026-09-23/);
  const learned = JSON.parse(e.learnedItems);
  assert.deepEqual([learned[0].topic, learned[0].title, learned[0].content], ['실무 팁', '감정', '신청 전 예납 확인']);
  const progress = JSON.parse(e.caseProgressItems);
  assert.deepEqual([progress[0].content, progress[0].caseTitle, !!progress[0].recordedAt], ['감정신청서 제출', '강남연립 손해배상', true]);
});

test('선택한 후보만 사건에 더하고, 되돌리기 기록대로 정확히 걷어낸다', () => {
  const cases = currentCases();
  const plan = buildRestorePlan(snapshotFromExportSheets(SHEETS), { cases, journal: {} });
  const selected = plan.cases.flatMap((p) => p.items).filter((i) => i.defaultOn).map((i) => i.id).concat(plan.journal.map((j) => j.id));
  let n = 5000;
  const { changes, journal } = applyPlanSelection(plan, selected, cases, { makeId: () => ++n, now: '2026-10-06T12:00:00Z', label: '9. 21. 내보내기', emptyCase });
  const gn = changes.find((c) => c.caseId === 'c100');
  assert.deepEqual(gn.next.timeline.map((t) => t.content), ['소장 접수', '강남연립 현장 확인(오늘 보완)', '감정신청서 제출']);
  const restored = gn.next.timeline[2];
  assert.equal(restored.restoredFrom, '9. 21. 내보내기');
  assert.ok(restored.id > 5000);
  assert.equal(gn.next.todos.find((t) => t.id === 4).done, true);
  assert.equal(gn.next.briefs[0].status, 'submitted');
  assert.equal(gn.next.briefs[0].submittedDate, '2026-09-19');
  assert.deepEqual(gn.base, cases[0], '기준 판본은 그대로');
  const ok = changes.find((c) => c.caseId === 'c200');
  assert.equal(ok.next.status, '종결');
  assert.equal(journal.length, 2);
  assert.equal(journal[0].entry._restoredFrom, '9. 21. 내보내기');

  // 복원 뒤 사용자가 같은 사건에 새 기록을 더해도, 되돌리기는 복원분만 걷어낸다
  const later = { ...gn.next, timeline: [...gn.next.timeline, { id: 9999, date: '2026-10-07', content: '새 기록' }] };
  const reverted = revertRestoreForCase(later, gn.log);
  assert.deepEqual(reverted.timeline.map((t) => t.content), ['소장 접수', '강남연립 현장 확인(오늘 보완)', '새 기록']);
  assert.equal(reverted.todos.find((t) => t.id === 4).done, false);
  assert.equal(reverted.briefs[0].status, 'pending');
  // 복원 뒤 사용자가 상태를 다시 바꿨으면 그 값은 지킨다
  const changedAgain = { ...ok.next, status: '진행중(재개)' };
  assert.equal(revertRestoreForCase(changedAgain, ok.log).status, '진행중(재개)');
  assert.equal(revertRestoreForCase(ok.next, ok.log).status, '진행중');
});

test('없는 사건을 고르면 빈 사건 틀에 그때 기록을 담아 새로 만든다', () => {
  const plan = buildRestorePlan(snapshotFromExportSheets(SHEETS), { cases: currentCases(), journal: {} });
  const createId = plan.cases.find((p) => !p.targetId).items[0].id;
  let n = 1;
  const { changes } = applyPlanSelection(plan, [createId], currentCases(), { makeId: () => ++n, emptyCase });
  assert.equal(changes.length, 1);
  assert.equal(changes[0].created, true);
  assert.equal(changes[0].next.title, '지운 사건');
  assert.equal(changes[0].next.client, '홍길동');
  assert.ok(Array.isArray(changes[0].next.briefs));
});

test('원본 백업(항목 id 포함)과 비교하면 id 로 정확히 짝짓는다', () => {
  const cases = currentCases();
  const snap = { source: 'raw', cases: [{ ...cases[0], timeline: [...cases[0].timeline, { id: 50, date: '2026-09-30', content: '사라진 기록' }], todos: [{ ...cases[0].todos[0], text: '준비서면 작성(제목 고침 전)', done: false }] }], journal: {} };
  const plan = buildRestorePlan(snap, { cases, journal: {} });
  const items = plan.cases.find((p) => p.targetId === 'c100').items;
  assert.deepEqual(ids(items), ['add:timeline:사라진 기록'], '제목만 바뀐 할 일은 id 가 같으므로 후보가 아니다');
  let n = 0;
  const { changes } = applyPlanSelection(plan, items.map((i) => i.id), cases, { makeId: () => ++n, emptyCase });
  assert.equal(changes[0].next.timeline.find((t) => t.content === '사라진 기록').id, 50, '원래 id 그대로');
});

test('같은 이름 사건이 여럿이면 없어진 항목은 대상 사건을 고르게 하고, 상태 되돌림은 그 사건에 바로 붙인다', () => {
  const sheets = {
    '사건 목록': [
      ['사건명', '분류', '상태', '의뢰인', '연락처', '상대방', '관할기관', '사건번호'],
      ['손해배상(기)', '민사', '진행중', '유순상', '', '대한민국', '', '2025가단103087'],
      ['손해배상(기)', '민사', '종결', '이계원', '', '이에스엘', '', '2025가단99078'],
    ],
    '진행경과': [['사건명', '날짜', '내용'], ['손해배상(기)', '2026-09-01', '변론종결'], ['손해배상(기)', '2026-09-02', '사라진 기록']],
    '할 일': [['사건명', '할일', '완료', '우선순위', '기한'], ['손해배상(기)', '판결문 송부', 'Y', '보통', '']],
  };
  const snap = snapshotFromExportSheets(sheets);
  assert.equal(snap.cases.length, 1);
  assert.equal(snap.cases[0].ambiguous, true);
  const cases = [
    { id: 'a', title: '손해배상(기)', client: '유순상', caseNumber: '2025가단103087', status: '진행중', timeline: [{ id: 1, date: '2026-09-01', content: '변론종결' }], todos: [] },
    { id: 'b', title: '손해배상(기)', client: '이계원', caseNumber: '2025가단99078', status: '종결', timeline: [], todos: [{ id: 2, text: '판결문 송부', done: false }] },
  ];
  const plan = buildRestorePlan(snap, { cases, journal: {} });
  const group = plan.cases.find((p) => p.targetChoices);
  assert.deepEqual(group.items.map((i) => [i.text, i.defaultOn, i.needsTarget]), [['사라진 기록', false, true]]);
  assert.deepEqual(group.targetChoices.map((c) => c.id), ['a', 'b']);
  const owner = plan.cases.find((p) => p.targetId === 'b');
  assert.deepEqual(owner.items.map((i) => i.kind + ':' + i.targetItemId), ['status:2']);
  // 대상 사건을 고르지 않으면 넣지 않는다
  const allIds = plan.cases.flatMap((p) => p.items).map((i) => i.id);
  let n = 100;
  assert.equal(applyPlanSelection(plan, allIds, cases, { makeId: () => ++n, emptyCase }).changes.filter((c) => c.caseId === 'a').length, 0);
  // 고르면 그 사건에 넣는다
  const { changes } = applyPlanSelection(plan, allIds, cases, { makeId: () => ++n, emptyCase, targetFor: { [group.key]: 'a' } });
  assert.deepEqual(changes.find((c) => c.caseId === 'a').next.timeline.map((t) => t.content), ['변론종결', '사라진 기록']);
  assert.equal(changes.find((c) => c.caseId === 'b').next.todos[0].done, true);
});
