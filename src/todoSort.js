const PRIO_ORDER = { "높음": 0, "보통": 1 };

function normalizeDueDate(dueDate) {
  if (!dueDate) return Number.POSITIVE_INFINITY;

  const timestamp = new Date(`${dueDate}T00:00:00`).getTime();
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

export function sortPendingTodos(todos) {
  return [...todos].sort((a, b) => {
    const da = normalizeDueDate(a.dueDate);
    const db = normalizeDueDate(b.dueDate);
    // 둘 다 마감일이 없으면 Infinity - Infinity = NaN이 되므로 같음(0)으로 보고 우선순위로 넘긴다.
    const dueCompare = da === db ? 0 : da - db;
    if (dueCompare !== 0) return dueCompare;

    const priorityCompare = (PRIO_ORDER[a.priority] ?? 1) - (PRIO_ORDER[b.priority] ?? 1);
    if (priorityCompare !== 0) return priorityCompare;

    return (a.id ?? 0) - (b.id ?? 0);
  });
}
