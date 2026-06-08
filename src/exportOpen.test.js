import assert from "node:assert/strict";
import test from "node:test";

import { openSpreadsheetUrl } from "./exportOpen.js";

test("openSpreadsheetUrl opens the spreadsheet in a new tab when popups are allowed", () => {
  const calls = [];
  const popup = { focus: () => calls.push(["focus"]) };
  const fakeWindow = {
    open: (...args) => {
      calls.push(["open", ...args]);
      return popup;
    },
    location: { assign: (...args) => calls.push(["assign", ...args]) },
  };

  const result = openSpreadsheetUrl("https://docs.google.com/spreadsheets/d/abc", fakeWindow);

  assert.equal(result, "new-tab");
  assert.deepEqual(calls, [
    ["open", "https://docs.google.com/spreadsheets/d/abc", "_blank", "noopener,noreferrer"],
    ["focus"],
  ]);
});

test("openSpreadsheetUrl navigates the current tab when the browser blocks the popup", () => {
  const calls = [];
  const fakeWindow = {
    open: (...args) => {
      calls.push(["open", ...args]);
      return null;
    },
    location: { assign: (...args) => calls.push(["assign", ...args]) },
  };

  const result = openSpreadsheetUrl("https://docs.google.com/spreadsheets/d/abc", fakeWindow);

  assert.equal(result, "same-tab");
  assert.deepEqual(calls, [
    ["open", "https://docs.google.com/spreadsheets/d/abc", "_blank", "noopener,noreferrer"],
    ["assign", "https://docs.google.com/spreadsheets/d/abc"],
  ]);
});
