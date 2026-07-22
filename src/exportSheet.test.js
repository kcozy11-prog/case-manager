import assert from "node:assert/strict";
import test from "node:test";

import { buildExportBatchUpdateData, quoteSheetName } from "./exportSheet.js";

test("buildExportBatchUpdateData quotes every sheet name in A1 ranges", () => {
  const cases = [
    {
      title: "경기외고 전성오 등 형사사건",
      type: "형사(고소)",
      status: "진행중",
      client: "임효린",
      clientContact: "",
      opponent: "전성오 외 5",
      court: "의왕경찰서",
      caseNumber: "",
      manager: "최자주",
      managerOrg: "의왕경찰서 여성청소년과",
      retainer: { date: "2026-05-25", amount: "6600000", successFee: "송치 또는 기소시", successFeeAmount: "11000000" },
      hearings: [{ date: "2026-06-02", time: "", type: "조사", result: "1차 조사", memo: "조사 전 통화", fromCalendar: true }],
      memos: [{ category: "일반메모", title: "메모", content: "내용", date: "2026-06-02", checked: false }],
      timeline: [{ date: "2026-06-02", content: "가해학생들 1차 조사" }],
      todos: [{ text: "송치 의견 확인", done: false, priority: "높음", dueDate: "2026-06-10" }],
    },
  ];

  const data = buildExportBatchUpdateData(cases);

  assert.deepEqual(data.map(entry => entry.range), [
    "'사건 목록'!A1",
    "'기일'!A1",
    "'메모'!A1",
    "'진행경과'!A1",
    "'할 일'!A1",
    "'서면'!A1",
    "'업무일지'!A1",
  ]);
  assert.equal(data[0].values[1][0], "경기외고 전성오 등 형사사건");
  assert.equal(data[1].values[1][5], "조사 전 통화");
  assert.equal(data[1].values[1][6], "LBOX");
});

test("quoteSheetName escapes apostrophes for valid Google Sheets A1 notation", () => {
  assert.equal(quoteSheetName("O'Brien 사건"), "'O''Brien 사건'");
});

test("buildExportBatchUpdateData converts Firestore-like objects to Sheets-safe scalar cells", () => {
  const timestamp = { seconds: 1780883000, nanoseconds: 123000000 };
  const cases = [
    {
      title: { ko: "객체형 사건명" },
      retainer: { date: timestamp, amount: 1000 },
      hearings: [{ date: timestamp, time: new Date("2026-06-08T01:02:03.000Z"), type: ["공판", "변론"], result: { note: "결과" } }],
      memos: [{ category: "일반메모", title: "객체 메모", content: { text: "내용" }, date: timestamp }],
      timeline: [{ date: timestamp, content: ["진행", "경과"] }],
      todos: [{ text: { text: "할 일" }, done: false, priority: "보통", dueDate: timestamp }],
    },
  ];

  const data = buildExportBatchUpdateData(cases);
  const cells = data.flatMap(entry => entry.values.flat());

  assert.ok(cells.every(cell => cell === null || ["string", "number", "boolean"].includes(typeof cell)));
  assert.equal(data[0].values[1][0], '{"ko":"객체형 사건명"}');
  assert.match(data[0].values[1][10], /^2026-/);
  assert.equal(data[1].values[1][3], "공판, 변론");
  assert.equal(data[2].values[1][3], '{"text":"내용"}');
});

test("buildExportBatchUpdateData truncates cells that exceed the Google Sheets 50000 character limit", () => {
  const longMemo = "가".repeat(50100);
  const data = buildExportBatchUpdateData([
    {
      title: "긴 메모 사건",
      memos: [{ category: "일반메모", title: "긴 메모", content: longMemo, date: "2026-06-08" }],
    },
  ]);

  const memoContent = data[2].values[1][3];

  assert.equal(memoContent.length, 50000);
  assert.ok(memoContent.endsWith("…[truncated]"));
});
