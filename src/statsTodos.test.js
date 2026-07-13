import test from "node:test";
import assert from "node:assert/strict";
import { buildPendingTodos } from "./statsTodos.js";

test("buildPendingTodos sorts incomplete todos by due date and keeps due date label data", () => {
  const cases = [
    {
      id: "c1",
      title: "사건 A",
      status: "진행중",
      todos: [
        { id: 1, text: "기한 없음", dueDate: "", done: false, priority: "높음" },
        { id: 2, text: "늦은 기한", dueDate: "2026-04-20", done: false, priority: "보통" },
      ],
    },
    {
      id: "c2",
      title: "사건 B",
      status: "진행중",
      todos: [
        { id: 3, text: "가장 급함", dueDate: "2026-04-16", done: false, priority: "보통" },
      ],
    },
  ];

  const pendingTodos = buildPendingTodos(cases);

  assert.deepEqual(pendingTodos.map((item) => item.id), [3, 2, 1]);
  assert.equal(pendingTodos[0].displayDate, "기한 2026.04.16");
  assert.equal(pendingTodos[2].displayDate, "기한 미지정");
});

test("buildPendingTodos marks overdue incomplete todos", () => {
  const cases = [
    {
      id: "c1",
      title: "사건 A",
      status: "진행중",
      todos: [
        { id: 1, text: "연체", dueDate: "2026-04-14", done: false, priority: "보통" },
      ],
    },
  ];

  const pendingTodos = buildPendingTodos(cases, new Date("2026-04-15T00:00:00"));

  assert.equal(pendingTodos[0].overdue, true);
});

test("buildPendingTodos includes standalone todos in the same due-date order", () => {
  const cases = [
    {
      id: "c1",
      title: "사건 A",
      status: "진행중",
      todos: [
        { id: 2, text: "사건 할 일", dueDate: "2026-04-20", done: false, priority: "보통" },
      ],
    },
  ];
  const standaloneTodos = [
    { id: 1, text: "일반 할 일", dueDate: "2026-04-16", done: false, priority: "보통" },
    { id: 3, text: "완료된 일반 할 일", dueDate: "2026-04-15", done: true, priority: "높음" },
  ];

  const pendingTodos = buildPendingTodos(cases, new Date("2026-04-15T00:00:00"), standaloneTodos);

  assert.deepEqual(pendingTodos.map((item) => item.id), [1, 2]);
  assert.equal(pendingTodos[0].caseTitle, "일반 할 일");
  assert.equal(pendingTodos[0].standalone, true);
  assert.equal(pendingTodos[1].standalone, false);
});
