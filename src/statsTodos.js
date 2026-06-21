import { fmtDate } from "./utils.js";
import { sortPendingTodos } from "./todoSort.js";
import { isOverdueTodo } from "./todoUi.js";

export function buildPendingTodos(cases, today = new Date()) {
  const flattened = cases
    .filter((c) => c.status === "진행중")
    .flatMap((c) =>
      (c.todos || []).filter((t) => !t.done && !t.fromCalendar).map((t) => ({
        ...t,
        caseId: c.id,
        caseTitle: c.title,
      }))
    );

  return sortPendingTodos(flattened).map((t) => ({
    ...t,
    displayDate: t.dueDate ? `기한 ${fmtDate(t.dueDate)}` : "기한 미지정",
    overdue: isOverdueTodo(t, today),
  }));
}
