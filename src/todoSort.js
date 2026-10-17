const PRIO_ORDER = { "높음": 0, "보통": 1 };

function normalizeDueDate(dueDate) {
  if (!dueDate) return Number.POSITIVE_INFINITY;

  const timestamp = new Date(`${dueDate}T00:00:00`).getTime();
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

// 숫자 id(Date.now())는 크기순, 문자 id(Claude 반영 "cl:…", 업무일지 등)는 숫자 id 뒤에 글자순
function compareIds(a, b) {
  const an = typeof a === "number" && Number.isFinite(a);
  const bn = typeof b === "number" && Number.isFinite(b);
  if (an && bn) return a - b;
  if (an !== bn) return an ? -1 : 1;
  const as = String(a ?? "");
  const bs = String(b ?? "");
  return as < bs ? -1 : as > bs ? 1 : 0;
}

export function sortPendingTodos(todos) {
  return [...todos].sort((a, b) => {
    const da = normalizeDueDate(a.dueDate);
    const db = normalizeDueDate(b.dueDate);
    // 둘 다 마감일이 없으면(Infinity - Infinity = NaN) 같은 것으로 보고 우선순위로 넘어간다
    const dueCompare = da === db ? 0 : da - db;
    if (dueCompare !== 0) return dueCompare;

    const priorityCompare = (PRIO_ORDER[a.priority] ?? 1) - (PRIO_ORDER[b.priority] ?? 1);
    if (priorityCompare !== 0) return priorityCompare;

    return compareIds(a.id, b.id);
  });
}
