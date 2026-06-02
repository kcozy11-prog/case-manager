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
      hearings: [{ date: "2026-06-02", time: "", type: "조사", result: "1차 조사", fromCalendar: true }],
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
  ]);
  assert.equal(data[0].values[1][0], "경기외고 전성오 등 형사사건");
  assert.equal(data[1].values[1][5], "LBOX");
});

test("quoteSheetName escapes apostrophes for valid Google Sheets A1 notation", () => {
  assert.equal(quoteSheetName("O'Brien 사건"), "'O''Brien 사건'");
});
