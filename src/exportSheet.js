export const EXPORT_SHEET_TITLES = ["사건 목록", "기일", "메모", "진행경과", "할 일"];

const MAX_SHEETS_CELL_CHARS = 50000;
const TRUNCATION_MARKER = "…[truncated]";

export function quoteSheetName(sheetName) {
  return `'${String(sheetName).replace(/'/g, "''")}'`;
}

export function a1Range(sheetName, cell = "A1") {
  return `${quoteSheetName(sheetName)}!${cell}`;
}

function truncateCellText(text) {
  if (text.length <= MAX_SHEETS_CELL_CHARS) return text;
  return text.slice(0, MAX_SHEETS_CELL_CHARS - TRUNCATION_MARKER.length) + TRUNCATION_MARKER;
}

function dateCell(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function timestampCell(value) {
  if (!value || typeof value !== "object") return null;

  if (typeof value.toDate === "function") {
    try {
      return dateCell(value.toDate());
    } catch {
      return null;
    }
  }

  const seconds = value.seconds ?? value._seconds;
  const nanoseconds = value.nanoseconds ?? value._nanoseconds ?? 0;
  if (typeof seconds === "number" && typeof nanoseconds === "number") {
    return dateCell(new Date(seconds * 1000 + Math.floor(nanoseconds / 1_000_000)));
  }

  return null;
}

function stringifyObject(value) {
  const seen = new WeakSet();
  try {
    return JSON.stringify(value, (_key, nested) => {
      if (nested instanceof Date) return dateCell(nested);
      const timestamp = timestampCell(nested);
      if (timestamp !== null) return timestamp;
      if (nested && typeof nested === "object") {
        if (seen.has(nested)) return "[Circular]";
        seen.add(nested);
      }
      return nested;
    });
  } catch {
    return String(value);
  }
}

function cell(value) {
  if (value == null) return "";
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "string") return truncateCellText(value);
  if (value instanceof Date) return truncateCellText(dateCell(value));

  const timestamp = timestampCell(value);
  if (timestamp !== null) return truncateCellText(timestamp);

  if (Array.isArray(value)) {
    return truncateCellText(value.map(item => cell(item)).join(", "));
  }

  if (typeof value === "object") {
    return truncateCellText(stringifyObject(value) || String(value));
  }

  return truncateCellText(String(value));
}

function normalizeRows(rows) {
  return rows.map(row => row.map(cell));
}

export function buildExportRows(cases = []) {
  const caseRows = [
    ["사건명", "분류", "상태", "의뢰인", "연락처", "상대방", "관할기관", "사건번호", "담당자", "소속", "수임일", "착수금", "성공보수", "성공보수금액"],
    ...cases.map(c => [
      c.title, c.type, c.status, c.client, c.clientContact, c.opponent,
      c.court, c.caseNumber, c.manager, c.managerOrg,
      c.retainer?.date, c.retainer?.amount, c.retainer?.successFee, c.retainer?.successFeeAmount,
    ]),
  ];

  const hearingRows = [
    ["사건명", "날짜", "시간", "유형", "결과/장소", "캘린더"],
    ...cases.flatMap(c =>
      (c.hearings || []).map(h => [c.title, h.date, h.time, h.type, h.result, h.fromCalendar ? "LBOX" : ""])
    ),
  ];

  const memoRows = [
    ["사건명", "카테고리", "제목", "내용", "날짜", "체크"],
    ...cases.flatMap(c =>
      (c.memos || []).map(m => [c.title, m.category, m.title, m.content, m.date, m.checked ? "Y" : ""])
    ),
  ];

  const timelineRows = [
    ["사건명", "날짜", "내용"],
    ...cases.flatMap(c =>
      (c.timeline || []).map(t => [c.title, t.date, t.content])
    ),
  ];

  const todoRows = [
    ["사건명", "할일", "완료", "우선순위", "기한"],
    ...cases.flatMap(c =>
      (c.todos || []).map(t => [c.title, t.text, t.done ? "Y" : "", t.priority, t.dueDate])
    ),
  ];

  return {
    caseRows: normalizeRows(caseRows),
    hearingRows: normalizeRows(hearingRows),
    memoRows: normalizeRows(memoRows),
    timelineRows: normalizeRows(timelineRows),
    todoRows: normalizeRows(todoRows),
  };
}

export function buildExportBatchUpdateData(cases = []) {
  const { caseRows, hearingRows, memoRows, timelineRows, todoRows } = buildExportRows(cases);

  return [
    { range: a1Range("사건 목록"), values: caseRows },
    { range: a1Range("기일"), values: hearingRows },
    { range: a1Range("메모"), values: memoRows },
    { range: a1Range("진행경과"), values: timelineRows },
    { range: a1Range("할 일"), values: todoRows },
  ];
}
