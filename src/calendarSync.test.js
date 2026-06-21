import test from "node:test";
import assert from "node:assert/strict";
import { parseLboxEvent, syncEventsWithCases, isLboxEvent } from "./calendarSync.js";

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
  const { updates, newHearingCount, newCaseCount } = syncEventsWithCases(events, cases);
  assert.equal(newCaseCount, 0, "기존 사건에 매칭되어 신규 생성 없어야 함");
  assert.equal(newHearingCount, 1);
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
