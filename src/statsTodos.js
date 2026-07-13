import { fmtDate } from "./utils.js";
import { sortPendingTodos } from "./todoSort.js";
import { isOverdueTodo } from "./todoUi.js";
import { STANDALONE_TODOS_CASE_ID, STANDALONE_TODOS_TITLE } from "./standaloneTodos.js";

export function buildPendingTodos(cases, today = new Date(), standaloneTodos = []) {
  const caseTodos = cases
    .filter((c) => c.status === "진행중")
    .flatMap((c) =>
      (c.todos || []).filter((t) => !t.done && !t.fromCalendar).map((t) => ({
        ...t,
        caseId: c.id,
        caseTitle: c.title,
        standalone: false,
      }))
    );

  const unlinkedTodos = (standaloneTodos || [])
    .filter((t) => !t.done && !t.fromCalendar)
    .map((t) => ({
      ...t,
      caseId: STANDALONE_TODOS_CASE_ID,
      caseTitle: STANDALONE_TODOS_TITLE,
      standalone: true,
    }));

  return sortPendingTodos([...caseTodos, ...unlinkedTodos]).map((t) => ({
    ...t,
    displayDate: t.dueDate ? `기한 ${fmtDate(t.dueDate)}` : "기한 미지정",
    overdue: isOverdueTodo(t, today),
  }));
}
