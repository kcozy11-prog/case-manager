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

test("sortPendingTodos puts high priority first when neither todo has a due date", () => {
  const todos = [
    { id: 1, text: "보통", priority: "보통", dueDate: "", done: false },
    { id: 2, text: "높음", priority: "높음", dueDate: "", done: false },
  ];

  const sorted = sortPendingTodos(todos);

  assert.deepEqual(sorted.map((todo) => todo.id), [2, 1]);
});

test("sortPendingTodos treats missing and invalid due dates alike, then sorts by priority and id", () => {
  const todos = [
    { id: 4, text: "보통 나중 id", priority: "보통", dueDate: "", done: false },
    { id: 3, text: "보통 앞 id", priority: "보통", done: false },
    { id: 2, text: "높음 날짜 오류", priority: "높음", dueDate: "날짜아님", done: false },
    { id: 1, text: "기한 있음", priority: "보통", dueDate: "2026-04-18", done: false },
  ];

  const sorted = sortPendingTodos(todos);

  assert.deepEqual(sorted.map((todo) => todo.id), [1, 2, 3, 4]);
});
