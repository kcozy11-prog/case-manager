import assert from "node:assert/strict";
import test from "node:test";

import {
  hearingMemoText,
  setHearingMemo,
  selectUpcomingHearings,
  selectMonthHearings,
  selectWeekHearings,
  splitCaseHearings,
  upsertHearing,
} from "./hearingUtils.js";

test("setHearingMemo adds memo to any hearing type including 변론기일", () => {
  const hearings = [
    { id: "h1", type: "변론기일", date: "2026-08-01" },
    { id: "h2", type: "선고기일", date: "2026-08-15" },
  ];

  const next = setHearingMemo(hearings, "h1", "준비서면 쟁점 확인");

  assert.equal(next[0].memo, "준비서면 쟁점 확인");
  assert.equal(next[1].memo, undefined);
  assert.equal(hearings[0].memo, undefined, "원본 배열은 변경하지 않아야 함");
});

test("setHearingMemo clears memo when saved blank", () => {
  const next = setHearingMemo([
    { id: "h1", type: "변론기일", memo: "기존 메모" },
  ], "h1", "   ");

  assert.equal("memo" in next[0], false);
});

test("hearingMemoText normalizes missing memo", () => {
  assert.equal(hearingMemoText({ type: "변론기일" }), "");
  assert.equal(hearingMemoText({ memo: "메모" }), "메모");
});

// ── 기일 건수 집계 ───────────────────────────────────────────────────────────

const NOW = new Date(2026, 8, 22, 10, 30); // 2026-09-22 (화) 10:30

test("같은 기일이 두 번 저장돼 있어도 한 건으로 센다", () => {
  const cases = [{
    id: "c1", title: "고무순 가압류이의", status: "진행중", caseNumber: "2026카단1234",
    hearings: [
      // LBOX 일정이 다른 캘린더를 거쳐 일정 ID가 다른 채로 한 번 더 들어온 경우
      { id: 1, date: "2026-09-30", time: "14:40", type: "심문기일", calendarEventId: "evA" },
      { id: 2, date: "2026-09-30", time: "14:40", type: "심문기일", calendarEventId: "evB" },
      // 시각·유형을 못 읽어 덜 채워진 채로 들어온 같은 기일
      { id: 3, date: "2026-09-30", time: "", type: "기일" },
    ],
  }];

  const rows = selectUpcomingHearings(cases, NOW);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].type, "심문기일");
  assert.equal(rows[0].time, "14:40");
  assert.equal(rows[0].dday, 8);
});

test("같은 사건이 두 건으로 등록돼 있어도 기일은 한 건으로 센다", () => {
  const cases = [
    { id: "c1", title: "고무순 가압류이의", status: "진행중", caseNumber: "2026카단1234",
      hearings: [{ id: 1, date: "2026-09-30", time: "14:40", type: "심문기일" }] },
    { id: "c2", title: "고무순 가압류이의(중복 등록)", status: "진행중", caseNumber: "2026카단1234",
      hearings: [{ id: 2, date: "2026-09-30", time: "14:40", type: "심문기일" }] },
  ];

  assert.equal(selectUpcomingHearings(cases, NOW).length, 1);
});

test("같은 날이라도 시각이나 유형이 다르면 각각 센다", () => {
  const cases = [{
    id: "c1", title: "A 사건", status: "진행중", caseNumber: "2026가단1111",
    hearings: [
      { id: 1, date: "2026-09-25", time: "10:00", type: "변론기일" },
      { id: 2, date: "2026-09-25", time: "14:00", type: "변론기일" },
      { id: 3, date: "2026-09-25", time: "14:00", type: "선고기일" },
    ],
  }];

  assert.equal(selectUpcomingHearings(cases, NOW).length, 3);
});

test("종결 사건과 날짜 없는 기일은 집계에서 뺀다", () => {
  const cases = [
    { id: "c1", title: "종결 사건", status: "종결", caseNumber: "2026가단1111",
      hearings: [{ id: 1, date: "2026-09-25", type: "변론기일" }] },
    { id: "c2", title: "진행 사건", status: "진행중", caseNumber: "2026가단2222",
      hearings: [
        { id: 2, date: "", type: "변론기일" },
        { id: 3, date: "미정", type: "변론기일" },
        { id: 4, date: "2026-09-25", type: "변론기일" },
      ] },
  ];

  const rows = selectUpcomingHearings(cases, NOW);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].caseTitle, "진행 사건");
});

test("이번 달 남은 기일 / 7일 내 기일 범위", () => {
  const cases = [{
    id: "c1", title: "A 사건", status: "진행중", caseNumber: "2026가단1111",
    hearings: [
      { id: 1, date: "2026-09-10", type: "변론기일" }, // 지난 기일
      { id: 2, date: "2026-09-22", type: "선고기일" }, // 오늘 (D-day)
      { id: 3, date: "2026-09-29", type: "변론기일" }, // D-7
      { id: 4, date: "2026-09-30", type: "심문기일" }, // D-8 — 이번 달이지만 7일 밖
      { id: 5, date: "2026-10-05", type: "변론기일" }, // 다음 달
    ],
  }];

  assert.deepEqual(selectMonthHearings(cases, NOW).map(h => h.date),
    ["2026-09-22", "2026-09-29", "2026-09-30"]);
  assert.deepEqual(selectWeekHearings(cases, NOW).map(h => h.date),
    ["2026-09-22", "2026-09-29"]);
});

test("splitCaseHearings — 날짜 없는 기일은 예정이 아니라 '날짜 미정'", () => {
  const { upcoming, past, undated } = splitCaseHearings([
    { id: 1, date: "", type: "변론기일" },
    { id: 2, date: "2026-09-10", type: "변론기일" },
    { id: 3, date: "2026-09-30", type: "심문기일" },
  ], NOW);

  assert.deepEqual(upcoming.map(h => h.id), [3]);
  assert.deepEqual(past.map(h => h.id), [2]);
  assert.deepEqual(undated.map(h => h.id), [1]);
});

test("upsertHearing — 같은 기일은 덧붙이지 않고 빈 값만 채운다", () => {
  const hearings = [{ id: 1, date: "2026-09-30", time: "", type: "기일" }];

  const filled = upsertHearing(hearings, {
    id: 9, date: "2026-09-30", time: "14:40", type: "심문기일", result: "서울남부지방법원 제311호",
  });
  assert.equal(filled.added, false);
  assert.equal(filled.updated, true);
  assert.equal(filled.hearings.length, 1);
  assert.deepEqual(
    { id: filled.hearings[0].id, time: filled.hearings[0].time, type: filled.hearings[0].type },
    { id: 1, time: "14:40", type: "심문기일" },
  );

  // 시각이 빠진 일정이 나중에 들어와도 이미 아는 시각을 지우지 않는다
  const kept = upsertHearing(filled.hearings, { id: 10, date: "2026-09-30", time: "", type: "심문기일" });
  assert.equal(kept.added, false);
  assert.equal(kept.updated, false);
  assert.equal(kept.hearings[0].time, "14:40");

  // 시각이 다르면 별개 기일
  const added = upsertHearing(filled.hearings, { id: 11, date: "2026-09-30", time: "16:00", type: "심문기일" });
  assert.equal(added.added, true);
  assert.equal(added.hearings.length, 2);
});

test("사건 상세의 '중복' 표시와 통계 건수는 같은 기준을 쓴다", () => {
  const hearings = [
    { id: 1, date: "2026-09-30", time: "", type: "기일" },        // 시각·유형이 덜 들어온 줄
    { id: 2, date: "2026-09-30", time: "10:00", type: "변론기일" },
    { id: 3, date: "2026-09-30", time: "14:00", type: "변론기일" }, // 같은 날 다른 시각 — 별개 기일
  ];

  const { upcoming } = splitCaseHearings(hearings, NOW);
  assert.deepEqual(upcoming.map(h => h.isDuplicate), [false, true, false]);
  assert.equal(upcoming[0].time, "10:00", "대표 줄에 시각이 채워진다");
  assert.equal(upcoming[0].type, "변론기일");

  const counted = selectUpcomingHearings(
    [{ id: "c1", title: "A 사건", status: "진행중", caseNumber: "2026가단1111", hearings }], NOW);
  assert.equal(counted.length, upcoming.filter(h => !h.isDuplicate).length);
  assert.equal(counted.length, 2);
});
