const PRIO_ORDER = { "높음": 0, "보통": 1 };

function normalizeDueDate(dueDate) {
  if (!dueDate) return Number.POSITIVE_INFINITY;

  const timestamp = new Date(`${dueDate}T00:00:00`).getTime();
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

export function sortPendingTodos(todos) {
  return [...todos].sort((a, b) => {
    const dueCompare = normalizeDueDate(a.dueDate) - normalizeDueDate(b.dueDate);
    if (dueCompare !== 0) return dueCompare;

    const priorityCompare = (PRIO_ORDER[a.priority] ?? 1) - (PRIO_ORDER[b.priority] ?? 1);
    if (priorityCompare !== 0) return priorityCompare;

    return (a.id ?? 0) - (b.id ?? 0);
  });
}
