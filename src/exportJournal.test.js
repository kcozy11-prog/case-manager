import assert from "node:assert/strict";
import test from "node:test";

import { buildExportBatchUpdateData, buildJournalRows } from "./exportSheet.js";

test("buildJournalRows returns a header then one row per date, newest first", () => {
  const entries = {
    "2026-06-20": { arrivalTime: "09:00", leaveTime: "18:00", todayWork: "소장 작성", callNotes: "의뢰인 통화" },
    "2026-06-21": { todayWork: "준비서면 초안" },
  };
  const rows = buildJournalRows(entries);

  assert.equal(rows[0][0], "날짜");
  assert.equal(rows[1][0], "2026-06-21");
  assert.equal(rows[2][0], "2026-06-20");
  assert.equal(rows[2][3], "소장 작성"); // 오늘 업무
});

test("buildJournalRows flattens checklist JSON fields into readable text", () => {
  const entries = {
    "2026-06-20": {
      todayTasks: JSON.stringify([
        { text: "서면 작성", done: true, cmCaseTitle: "사건A" },
        { text: "전화", done: false },
      ]),
    },
  };
  const rows = buildJournalRows(entries);
  assert.match(rows[1][4], /서면 작성/); // 오늘 할 일
  assert.match(rows[1][4], /사건A/);
  assert.match(rows[1][4], /전화/);
});

test("buildExportBatchUpdateData includes 서면 and 업무일지 ranges with data", () => {
  const cases = [{ title: "사건A", briefs: [{ id: 1, title: "준비서면 2호", status: "pending", preparedDate: "2026-06-20", submittedDate: "" }] }];
  const journal = { "2026-06-20": { todayWork: "x" } };
  const data = buildExportBatchUpdateData(cases, journal);
  const ranges = data.map((d) => d.range);

  assert.ok(ranges.includes("'서면'!A1"), "서면 시트 포함");
  assert.ok(ranges.includes("'업무일지'!A1"), "업무일지 시트 포함");

  const briefSheet = data.find((d) => d.range === "'서면'!A1");
  assert.equal(briefSheet.values[1][0], "사건A");
  assert.equal(briefSheet.values[1][1], "준비서면 2호");
});

test("buildExportBatchUpdateData works without journal entries (header-only journal sheet)", () => {
  const data = buildExportBatchUpdateData([{ title: "A" }]);
  const journalSheet = data.find((d) => d.range === "'업무일지'!A1");
  assert.ok(journalSheet);
  assert.equal(journalSheet.values.length, 1); // 헤더만
});
