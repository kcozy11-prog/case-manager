import test from "node:test";
import assert from "node:assert/strict";
import {
  buildStandaloneTodoCase,
  mergeGoogleTaskIntoStandaloneTodos,
  readStandaloneTodos,
  STANDALONE_TODOS_CASE_ID,
  STANDALONE_TODOS_TITLE,
} from "./standaloneTodos.js";

test("buildStandaloneTodoCase wraps unlinked todos in a TodosTab-compatible case shape", () => {
  const todos = [{ id: 1, text: "인지대 납부 확인", done: false }];

  const standaloneCase = buildStandaloneTodoCase(todos);

  assert.equal(standaloneCase.id, STANDALONE_TODOS_CASE_ID);
  assert.equal(standaloneCase.title, STANDALONE_TODOS_TITLE);
  assert.equal(standaloneCase.status, "진행중");
  assert.deepEqual(standaloneCase.todos, todos);
});

test("readStandaloneTodos returns only valid todo arrays", () => {
  assert.deepEqual(readStandaloneTodos({ todos: [{ id: 1 }] }), [{ id: 1 }]);
  assert.deepEqual(readStandaloneTodos({ todos: "bad" }), []);
  assert.deepEqual(readStandaloneTodos(null), []);
});

test("mergeGoogleTaskIntoStandaloneTodos adds a Google task as an unlinked todo", () => {
  const task = {
    id: "task-1",
    title: "사건 미지정 업무",
    notes: "상세",
    due: "2026-04-18T00:00:00.000Z",
    status: "needsAction",
    updated: "2026-04-15T01:00:00.000Z",
    _listName: "회사 업무",
  };

  const result = mergeGoogleTaskIntoStandaloneTodos([], task, () => 123);

  assert.equal(result.added, true);
  assert.equal(result.updated, false);
  assert.deepEqual(result.todos, [{
    id: 123,
    text: "사건 미지정 업무",
    details: "상세",
    priority: "보통",
    dueDate: "2026-04-18",
    done: false,
    calendarTaskId: "task-1",
    fromTasks: true,
    sourceTaskList: "회사 업무",
    sourceUpdatedAt: "2026-04-15T01:00:00.000Z",
  }]);
});

test("mergeGoogleTaskIntoStandaloneTodos updates an existing Google task and preserves local id", () => {
  const existing = [{ id: 123, text: "이전 제목", done: false, calendarTaskId: "task-1" }];
  const task = {
    id: "task-1",
    title: "수정된 제목",
    notes: "새 상세",
    due: "2026-04-20T00:00:00.000Z",
    status: "completed",
  };

  const result = mergeGoogleTaskIntoStandaloneTodos(existing, task, () => 999);

  assert.equal(result.added, false);
  assert.equal(result.updated, true);
  assert.equal(result.todos[0].id, 123);
  assert.equal(result.todos[0].text, "수정된 제목");
  assert.equal(result.todos[0].done, true);
  assert.equal(result.todos[0].dueDate, "2026-04-20");
});
