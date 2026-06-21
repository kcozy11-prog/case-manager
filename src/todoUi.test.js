import test from "node:test";
import assert from "node:assert/strict";
import { getDueDateLabel, getTodoCardTone, isOverdueTodo } from "./todoUi.js";

test("isOverdueTodo returns true only for incomplete todos past due date", () => {
  const overdueTodo = { dueDate: "2026-04-14", done: false };
  const doneTodo = { dueDate: "2026-04-14", done: true };
  const futureTodo = { dueDate: "2026-04-16", done: false };

  assert.equal(isOverdueTodo(overdueTodo, new Date("2026-04-15T00:00:00")), true);
  assert.equal(isOverdueTodo(doneTodo, new Date("2026-04-15T00:00:00")), false);
  assert.equal(isOverdueTodo(futureTodo, new Date("2026-04-15T00:00:00")), false);
});

test("getTodoCardTone makes overdue todos stand out visually", () => {
  const overdueTodo = { dueDate: "2026-04-14", done: false };
  const normalTodo = { dueDate: "2026-04-16", done: false };

  assert.equal(getTodoCardTone(overdueTodo, new Date("2026-04-15T00:00:00")), "bg-rose-50 border-rose-300 shadow-md shadow-rose-100 hover:border-rose-400");
  assert.equal(getTodoCardTone(normalTodo, new Date("2026-04-15T00:00:00")), "bg-white border-slate-100 hover:border-slate-200 shadow-sm");
});

test("getDueDateLabel prefixes the visible due date text", () => {
  assert.equal(getDueDateLabel({ dueDate: "2026-04-15" }), "기한 2026.04.15");
});
