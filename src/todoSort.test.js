import test from "node:test";
import assert from "node:assert/strict";
import { sortPendingTodos } from "./todoSort.js";

test("sortPendingTodos sorts incomplete todos by nearest due date first", () => {
  const todos = [
    { id: 1, text: "기한 없음", priority: "높음", dueDate: "", done: false },
    { id: 2, text: "가장 급함", priority: "보통", dueDate: "2026-04-16", done: false },
    { id: 3, text: "나중", priority: "높음", dueDate: "2026-04-20", done: false },
  ];

  const sorted = sortPendingTodos(todos);

  assert.deepEqual(sorted.map((todo) => todo.id), [2, 3, 1]);
});

test("sortPendingTodos keeps high priority first when due dates are the same", () => {
  const todos = [
    { id: 1, text: "보통", priority: "보통", dueDate: "2026-04-18", done: false },
    { id: 2, text: "높음", priority: "높음", dueDate: "2026-04-18", done: false },
  ];

  const sorted = sortPendingTodos(todos);

  assert.deepEqual(sorted.map((todo) => todo.id), [2, 1]);
});

test("sortPendingTodos orders string ids (Claude 반영, 업무일지) consistently after numeric ids", () => {
  const todos = [
    { id: 1760000005000, text: "a", priority: "보통", dueDate: "2026-10-20" },
    { id: "cl:b:2", text: "b", priority: "보통", dueDate: "2026-10-20" },
    { id: 1760000001000, text: "c", priority: "보통", dueDate: "2026-10-20" },
    { id: "cl:b:1", text: "d", priority: "보통", dueDate: "2026-10-20" },
  ];
  assert.deepEqual(sortPendingTodos(todos).map((t) => t.id), [1760000001000, 1760000005000, "cl:b:1", "cl:b:2"]);
  assert.deepEqual(sortPendingTodos([...todos].reverse()).map((t) => t.id), [1760000001000, 1760000005000, "cl:b:1", "cl:b:2"]);
});