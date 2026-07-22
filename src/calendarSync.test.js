import test from "node:test";
import assert from "node:assert/strict";
import { parseLboxEvent, syncEventsWithCases, isLboxEvent, scoreLboxCaseMatch, mergeCalendarEventIntoCase } from "./calendarSync.js";

test("isLboxEvent — 키워드/출처로 식별", () => {
  assert.equal(isLboxEvent({ _src: "LBOX", summary: "아무거나" }), true);
  assert.equal(isLboxEvent({ summary: "엘박스 변론기일 2026가단100906" }), true);
  assert.equal(isLboxEvent({ description: "via LBOX", summary: "기일" }), true);
  assert.equal(isLboxEvent({ summary: "팀 점심" }), false);
});

test("대괄호 형식 파싱", () => {
  const r = parseLboxEvent("[이계원] 변론 서울중앙지방법원 2025가단99078 동관452호 10:40");
  assert.equal(r.client, "이계원");
  assert.equal(r.hearingType, "변론");
  assert.equal(r.court, "서울중앙지방법원");
  assert.equal(r.caseNumber, "2025가단99078");
  assert.equal(r.location, "동관452호");
  assert.equal(r.time, "10:40");
});

test("콤마 형식 파싱 (지원 + 하이픈 결합)", () => {
  const r = parseLboxEvent("박제군, 변론, 수원지방법원 안양지원-2026가단100906 제406호 법정 11:20");
  assert.equal(r.client, "박제군");
  assert.equal(r.hearingType, "변론");
  assert.equal(r.court, "수원지방법원 안양지원");
  assert.equal(r.caseNumber, "2026가단100906");
  assert.equal(r.location, "제406호 법정");
  assert.equal(r.time, "11:20");
});

test("콤마 형식 — 형사 공판/검찰청 변형", () => {
  const r = parseLboxEvent("김갑동, 공판, 서울중앙지방법원 2025고단1234 형사312호 14:00");
  assert.equal(r.client, "김갑동");
  assert.equal(r.hearingType, "공판");
  assert.equal(r.caseNumber, "2025고단1234");
  assert.equal(r.location, "형사312호");
  assert.equal(r.time, "14:00");
});

test("사건번호 없으면 null", () => {
  assert.equal(parseLboxEvent("점심 회식 12:00"), null);
});

test("콤마 형식 기일이 사건번호로 관련 사건에 반영", () => {
  const cases = [{
    id: "c1", title: "박제군 대여금", client: "박제군", opponent: "",
    caseNumber: "2026가단100906", court: "수원지방법원 안양지원",
    hearings: [], memos: [], timeline: [],
  }];
  const events = [{
    id: "ev1",
    summary: "박제군, 변론, 수원지방법원 안양지원-2026가단100906 제406호 법정 11:20",
    start: { date: "2026-07-01" },
  }];
  const { updates, newHearingCount, newCaseCount, unmatchedEvents } = syncEventsWithCases(events, cases);
  assert.equal(newCaseCount, 0, "기존 사건에 매칭되어 신규 생성 없어야 함");
  assert.equal(newHearingCount, 1);
  assert.equal(unmatchedEvents.length, 0);
  const updated = updates.get("c1");
  assert.ok(updated, "c1 사건이 갱신되어야 함");
  const h = updated.hearings[0];
  assert.equal(h.date, "2026-07-01");
  assert.equal(h.time, "11:20");
  assert.equal(h.type, "변론기일");
  assert.match(h.result, /수원지방법원 안양지원/);
  assert.match(h.result, /제406호 법정/);
  // 기일메모 / 진행경과 자동 생성 확인
  assert.ok(updated.memos.some((m) => m.category === "기일메모"));
  assert.ok(updated.timeline.some((t) => /변론기일/.test(t.content)));
});

test("LBOX 자동매칭 점수는 법원명·사건번호·당사자 3개 기준으로 계산", () => {
  const lbox = parseLboxEvent("박제군, 변론, 수원지방법원 안양지원-2026가단100906 제406호 법정 11:20");
  const score = scoreLboxCaseMatch(lbox, "", {
    title: "박제군 대여금", client: "박제군", opponent: "",
    caseNumber: "2026가단100906", court: "수원지법 안양지원",
  });

  assert.equal(score.score, 3);
  assert.equal(score.courtMatch, true);
  assert.equal(score.caseNumberMatch, true);
  assert.equal(score.partyMatch, true);
});

test("LBOX 법원명은 수원지방법원 안양지원 중 안양지원만 같아도 일치", () => {
  const lbox = parseLboxEvent("박제군, 변론, 수원지방법원 안양지원-2026가단100906 제406호 법정 11:20");
  const score = scoreLboxCaseMatch(lbox, "", {
    title: "다른 의뢰인 사건", client: "김철수", opponent: "",
    caseNumber: "2026가단100906", court: "안양지원",
  });

  assert.equal(score.courtMatch, true);
  assert.equal(score.caseNumberMatch, true);
  assert.equal(score.partyMatch, false);
  assert.equal(score.score, 2);
});

test("LBOX 지원 일정은 본원명만 같은 사건을 법원명 일치로 보지 않음", () => {
  const lbox = parseLboxEvent("박제군, 변론, 수원지방법원 안양지원-2026가단100906 제406호 법정 11:20");
  const score = scoreLboxCaseMatch(lbox, "", {
    title: "다른 의뢰인 사건", client: "김철수", opponent: "",
    caseNumber: "2026가단100906", court: "수원지방법원",
  });

  assert.equal(score.courtMatch, false);
  assert.equal(score.caseNumberMatch, true);
  assert.equal(score.partyMatch, false);
  assert.equal(score.score, 1);
});

test("LBOX 기일은 사건번호와 지원명만 일치해도 자동 반영", () => {
  const cases = [{
    id: "c1", title: "다른 의뢰인 사건", client: "김철수", opponent: "",
    caseNumber: "2026가단100906", court: "안양지원",
    hearings: [], memos: [], timeline: [],
  }];
  const events = [{
    id: "ev1",
    summary: "박제군, 변론, 수원지방법원 안양지원-2026가단100906 제406호 법정 11:20",
    start: { date: "2026-07-01" },
  }];

  const { updates, newHearingCount, unmatchedEvents } = syncEventsWithCases(events, cases);

  assert.equal(newHearingCount, 1);
  assert.equal(unmatchedEvents.length, 0);
  assert.ok(updates.get("c1"));
});

test("LBOX 기일은 2개 이상 일치할 때만 자동 반영하고, 사건번호만 일치하면 수동 확인으로 보냄", () => {
  const cases = [{
    id: "c1", title: "다른 의뢰인 사건", client: "김철수", opponent: "",
    caseNumber: "2026가단100906", court: "서울중앙지방법원",
    hearings: [], memos: [], timeline: [],
  }];
  const events = [{
    id: "ev1",
    summary: "박제군, 변론, 수원지방법원 안양지원-2026가단100906 제406호 법정 11:20",
    start: { date: "2026-07-01" },
  }];

  const { updates, newHearingCount, unmatchedEvents, skippedCount } = syncEventsWithCases(events, cases);

  assert.equal(updates.size, 0);
  assert.equal(newHearingCount, 0);
  assert.equal(skippedCount, 1);
  assert.equal(unmatchedEvents.length, 1);
  assert.equal(unmatchedEvents[0].caseNumber, "2026가단100906");
  assert.equal(unmatchedEvents[0].party, "박제군");
  assert.match(unmatchedEvents[0].reason, /2개 이상/);
});

test("LBOX 기일 후보가 여러 건이면 사건번호 일치 사건을 우선 자동 반영", () => {
  const cases = [
    {
      id: "wrong-party-court",
      title: "박제군 별도 사건", client: "박제군", opponent: "",
      caseNumber: "2026가단999999", court: "안양지원",
      hearings: [], memos: [], timeline: [],
    },
    {
      id: "case-number-match",
      title: "김철수 대여금", client: "김철수", opponent: "",
      caseNumber: "2026가단100906", court: "안양지원",
      hearings: [], memos: [], timeline: [],
    },
  ];
  const events = [{
    id: "ev1",
    summary: "박제군, 변론, 수원지방법원 안양지원-2026가단100906 제406호 법정 11:20",
    start: { date: "2026-07-01" },
  }];

  const { updates, newHearingCount, unmatchedEvents } = syncEventsWithCases(events, cases);

  assert.equal(newHearingCount, 1);
  assert.equal(unmatchedEvents.length, 0);
  assert.equal(updates.has("wrong-party-court"), false);
  assert.ok(updates.get("case-number-match"), "사건번호가 일치하는 사건에 기일이 반영되어야 함");
});

test("mergeCalendarEventIntoCase: 수동 선택된 LBOX 일정을 사건 기일·메모·진행경과로 병합", () => {
  let id = 100;
  const c = { id: "c1", title: "박제군 대여금", hearings: [], memos: [], timeline: [] };
  const ev = {
    id: "ev1",
    summary: "박제군, 변론, 수원지방법원 안양지원-2026가단100906 제406호 법정 11:20",
    start: { date: "2026-07-01" },
  };

  const result = mergeCalendarEventIntoCase(c, ev, { today: "2026-06-24", makeId: () => id++ });

  assert.equal(result.added, true);
  assert.equal(result.caseObj.hearings[0].calendarEventId, "ev1");
  assert.equal(result.caseObj.memos[0].category, "기일메모");
  assert.match(result.caseObj.timeline[0].content, /변론기일 2026-07-01 11:20 지정/);
});
