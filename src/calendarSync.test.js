import test from "node:test";
import assert from "node:assert/strict";
import { parseLboxEvent, syncEventsWithCases, isLboxEvent, scoreLboxCaseMatch, mergeCalendarEventIntoCase, findCaseLinkedToEvent, calendarSyncTimeMin, calendarSyncTimeMax } from "./calendarSync.js";

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

test("LBOX 기일은 사건번호만 일치하면 법원명·당사자가 달라도 자동 반영", () => {
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

  assert.equal(newHearingCount, 1);
  assert.equal(skippedCount, 0);
  assert.equal(unmatchedEvents.length, 0);
  assert.ok(updates.get("c1"));
});

test("LBOX 기일은 법원명·당사자가 맞아도 사건번호가 다르면 자동 반영하지 않음", () => {
  const cases = [{
    id: "wrong-case-number", title: "박제군 별도 사건", client: "박제군", opponent: "",
    caseNumber: "2026가단999999", court: "안양지원",
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
  assert.match(unmatchedEvents[0].reason, /사건번호/);
});

test("LBOX 기일은 안양지원만 맞고 사건번호가 없으면 자동 반영하지 않음", () => {
  const cases = [{
    id: "same-court-only", title: "안양지원 사건", client: "박제군", opponent: "",
    caseNumber: "2026가단100527", court: "수원지방법원 안양지원",
    hearings: [], memos: [], timeline: [],
  }];
  const events = [{
    id: "ev-court-only",
    _src: "LBOX",
    summary: "박제군, 변론, 수원지방법원 안양지원 제406호 법정 11:20",
    start: { date: "2026-07-01" },
  }];

  const { updates, newHearingCount, unmatchedEvents, skippedCount } = syncEventsWithCases(events, cases);

  assert.equal(updates.size, 0);
  assert.equal(newHearingCount, 0);
  assert.equal(skippedCount, 1);
  assert.equal(unmatchedEvents.length, 1);
  assert.match(unmatchedEvents[0].reason, /사건번호를 찾을 수 없음/);
});

test("LBOX 기일은 사건번호 숫자 1이 ㅂ으로 들어온 경우에도 같은 사건으로 본다", () => {
  const cases = [
    {
      id: "target", title: "안양지원 대여금", client: "김철수", opponent: "",
      caseNumber: "2026가단100527", court: "수원지방법원 안양지원",
      hearings: [], memos: [], timeline: [],
    },
    {
      id: "same-court-wrong-number", title: "다른 안양지원 사건", client: "박제군", opponent: "",
      caseNumber: "2026가단999999", court: "안양지원",
      hearings: [], memos: [], timeline: [],
    },
  ];
  const events = [{
    id: "ev-ocr-typo",
    summary: "박제군, 변론, 수원지방법원 안양지원-2026가단ㅂ00527 제406호 법정 11:20",
    start: { date: "2026-07-01" },
  }];

  const { updates, newHearingCount, unmatchedEvents } = syncEventsWithCases(events, cases);

  assert.equal(newHearingCount, 1);
  assert.equal(unmatchedEvents.length, 0);
  assert.ok(updates.get("target"), "정규화된 사건번호가 일치하는 사건에 반영되어야 함");
  assert.equal(updates.has("same-court-wrong-number"), false, "안양지원 법원명만 같은 사건에는 반영하면 안 됨");
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

test("LBOX 기일은 종결 여부와 무관하게 사건번호가 일치하면 자동 반영", () => {
  const cases = [{
    id: "closed-case", title: "종결 사건", client: "김철수", opponent: "",
    caseNumber: "2026가단100906", court: "서울중앙지방법원", status: "종결",
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
  assert.ok(updates.get("closed-case"));
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
  assert.equal(result.caseObj.timeline[0].activityType, "hearing");
});

test("조회 구간은 한국시간 기준 오늘 0시부터 시작 (지난 일정은 다시 가져오지 않음)", () => {
  // UTC 2026-09-20 16:30 = KST 2026-09-21 01:30 → KST 9/21 0시(UTC 9/20 15:00)부터
  const now = new Date("2026-09-20T16:30:00Z");
  assert.equal(calendarSyncTimeMin(now), "2026-09-20T15:00:00.000Z");
  // UTC 2026-09-21 10:00 = KST 19:00 → 같은 날 KST 0시
  assert.equal(calendarSyncTimeMin(new Date("2026-09-21T10:00:00Z")), "2026-09-20T15:00:00.000Z");
  assert.ok(new Date(calendarSyncTimeMax(now)) > now);
  assert.equal(Math.round((new Date(calendarSyncTimeMax(now)) - now) / 86400000), 60);
});

test("수동으로 사건에 넣은 일정은 다음 동기화에서 그 사건으로 인식 (수동 확인 목록에 재등장 안 함)", () => {
  const bare = {
    id: "manual", title: "사건번호 없는 자문", client: "홍길동", opponent: "",
    caseNumber: "—", court: "",
    hearings: [], memos: [], timeline: [],
  };
  const events = [{
    id: "ev-manual",
    _src: "LBOX",
    summary: "홍길동, 변론, 서울중앙지방법원 제301호 10:00",
    start: { dateTime: "2026-10-01T10:00:00+09:00" },
  }];

  // 1차 동기화: 사건번호가 없어 수동 확인 대상
  const first = syncEventsWithCases(events, [bare]);
  assert.equal(first.unmatchedEvents.length, 1);

  // 사용자가 '선택 사건에 기일 추가' → calendarEventId 가 기일에 남는다
  const linked = mergeCalendarEventIntoCase(bare, events[0], { today: "2026-09-21", makeId: () => 1 }).caseObj;
  assert.equal(linked.hearings[0].calendarEventId, "ev-manual");
  assert.equal(findCaseLinkedToEvent("ev-manual", [linked]).id, "manual");
  assert.equal(findCaseLinkedToEvent("nope", [linked]), null);

  // 2차 동기화: 같은 일정이 다시 와도 수동 확인 목록에 오르지 않고, 변경도 없다
  const { updates, unmatchedEvents, skippedCount } = syncEventsWithCases(events, [linked]);
  assert.equal(unmatchedEvents.length, 0);
  assert.equal(skippedCount, 0);
  assert.equal(updates.size, 0, "이미 같은 기일이 있으므로 변경 없음");

  // 일정이 바뀌면(시각 변경) 연결된 사건의 기일이 갱신된다
  const moved = [{ ...events[0], start: { dateTime: "2026-10-01T14:00:00+09:00" }, summary: "홍길동, 변론, 서울중앙지방법원 제301호 14:00" }];
  const r2 = syncEventsWithCases(moved, [linked]);
  assert.equal(r2.unmatchedEvents.length, 0);
  assert.equal(r2.updates.get("manual").hearings[0].time, "14:00");
  assert.equal(r2.updates.get("manual").hearings.length, 1, "기일이 중복 생성되지 않음");
});

test("'다시 보지 않기'로 무시한 일정은 수동 확인 목록에서 제외", () => {
  const cases = [{
    id: "c1", title: "다른 사건", client: "김철수", opponent: "",
    caseNumber: "2026가단100906", court: "안양지원",
    hearings: [], memos: [], timeline: [],
  }];
  const events = [
    { id: "ev-ignored", _src: "LBOX", summary: "박제군, 변론, 수원지방법원 안양지원 제406호 11:20", start: { date: "2026-10-01" } },
    { id: "ev-visible", _src: "LBOX", summary: "이몽룡, 조정, 서울가정법원 2026드단777 제1호 15:00", start: { date: "2026-10-02" } },
  ];
  const { unmatchedEvents, ignoredCount } = syncEventsWithCases(events, cases, { ignoredEventIds: new Set(["ev-ignored"]) });
  assert.equal(ignoredCount, 1);
  assert.deepEqual(unmatchedEvents.map((e) => e.id), ["ev-visible"]);
  // 무시 목록에 있어도 사건번호가 맞는 일정은 정상 반영
  const matched = [{ id: "ev-ignored", summary: "박제군, 변론, 수원지방법원 안양지원-2026가단100906 제406호 11:20", start: { date: "2026-10-01" } }];
  const r = syncEventsWithCases(matched, cases, { ignoredEventIds: ["ev-ignored"], today: "2026-09-21" });
  assert.equal(r.newHearingCount, 1);
  assert.equal(r.updates.get("c1").timeline[0].date, "2026-09-21");
});
