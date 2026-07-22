import assert from "node:assert/strict";
import test from "node:test";

import { hearingMemoText, setHearingMemo } from "./hearingUtils.js";

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
