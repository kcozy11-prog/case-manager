import { fmtDate } from "./utils.js";
import { sortPendingTodos } from "./todoSort.js";
import { isOverdueTodo } from "./todoUi.js";
import { STANDALONE_TODOS_CASE_ID, STANDALONE_TODOS_TITLE } from "./standaloneTodos.js";
import { JOURNAL_TASK_LABELS } from "./journalTasks.js";

// journalTasks: 업무일지의 미완료 오늘 할 일·내일 할 일 (journalPendingTasks 결과)
export function buildPendingTodos(cases, today = new Date(), standaloneTodos = [], journalTasks = []) {
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

  const journalTodos = (journalTasks || [])
    .filter((t) => t && !t.done && t.text)
    .map((t) => {
      const linked = t.cmCaseId ? (cases || []).find((c) => c.id === t.cmCaseId) : null;
      return {
        ...t,
        caseId: linked ? linked.id : "",
        caseTitle: linked ? linked.title : (t.cmCaseTitle || ""),
        standalone: false,
        journal: true,
        sourceLabel: JOURNAL_TASK_LABELS[t.journalList] || "업무일지",
      };
    });

  return sortPendingTodos([...caseTodos, ...unlinkedTodos, ...journalTodos]).map((t) => ({
    ...t,
    displayDate: t.dueDate ? `기한 ${fmtDate(t.dueDate)}` : "기한 미지정",
    overdue: isOverdueTodo(t, today),
  }));
}
