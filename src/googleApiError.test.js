import assert from "node:assert/strict";
import test from "node:test";

import { formatGoogleApiError } from "./googleApiError.js";

test("formatGoogleApiError includes the nested Google API message when response body is JSON", () => {
  const body = JSON.stringify({ error: { message: "Invalid values[0][1]: struct_value" } });

  assert.equal(
    formatGoogleApiError("데이터 입력 실패", 400, "Bad Request", body),
    "데이터 입력 실패: 400 Bad Request — Invalid values[0][1]: struct_value"
  );
});

test("formatGoogleApiError falls back to compact text body", () => {
  assert.equal(
    formatGoogleApiError("시트 생성 실패", 500, "Internal Server Error", "backend unavailable"),
    "시트 생성 실패: 500 Internal Server Error — backend unavailable"
  );
});
