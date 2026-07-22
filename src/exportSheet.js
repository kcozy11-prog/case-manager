export const EXPORT_SHEET_TITLES = ["사건 목록", "기일", "메모", "진행경과", "할 일", "서면", "업무일지"];

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

// ── 업무일지 직렬화 헬퍼 ───────────────────────────────────────────────
function parseArr(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function joinChecklist(raw) {
  return parseArr(raw)
    .filter(it => it && String(it.text || "").trim())
    .map(it => {
      const mark = it.done ? "[완료] " : "";
      const cse = it.cmCaseTitle ? ` (${it.cmCaseTitle})` : "";
      const due = it.dueDate ? ` ~${it.dueDate}` : "";
      return `${mark}${it.text}${cse}${due}`;
    })
    .join("\n");
}

function joinDelegated(raw) {
  return parseArr(raw)
    .filter(it => it && String(it.text || "").trim())
    .map(it => `${it.assignee ? it.assignee + ": " : ""}${it.text}${it.done ? " [완료]" : ""}`)
    .join("\n");
}

function joinLearned(raw) {
  return parseArr(raw)
    .filter(it => it && (it.title || it.content))
    .map(it => `[${it.topic || "기타"}] ${it.title || ""}${it.content ? " — " + it.content : ""}`)
    .join("\n");
}

function joinCaseLog(raw) {
  return parseArr(raw)
    .filter(it => it && String(it.content || "").trim())
    .map(it => `${it.content}${it.caseTitle ? ` (${it.caseTitle})` : ""}${it.recordedAt ? " ✓기록" : ""}`)
    .join("\n");
}

function joinCallLog(raw) {
  return parseArr(raw)
    .filter(it => it && (it.title || it.detail))
    .map(it => {
      const body = it.title && it.detail ? `${it.title} — ${it.detail}` : (it.title || it.detail);
      const cse = it.caseTitle ? ` (${it.caseTitle})` : "";
      const req = it.asClientRequest ? " [의뢰인요청]" : "";
      const rec = it.recordedAt ? " ✓기록" : "";
      return `${body}${cse}${req}${rec}`;
    })
    .join("\n");
}

const JOURNAL_HEADER = ["날짜", "출근", "퇴근", "오늘 업무", "오늘 할 일", "내일 할 일", "제출 예정 서면", "위임 업무", "통화·상담 메모", "배운 점", "기타", "사건 진행 기록", "통화 상담 기록"];

export function buildJournalRows(journalEntries = {}) {
  const dates = Object.keys(journalEntries || {}).sort((a, b) => b.localeCompare(a));
  const rows = dates.map(d => {
    const e = journalEntries[d] || {};
    return [
      d,
      e.arrivalTime || "",
      e.leaveTime || "",
      e.todayWork || "",
      joinChecklist(e.todayTasks),
      joinChecklist(e.tomorrowTasks),
      joinChecklist(e.pendingDocItems) || e.pendingDocs || "",
      joinDelegated(e.delegatedItems) || e.delegated || "",
      e.callNotes || "",
      joinLearned(e.learnedItems) || e.learned || "",
      e.etc || "",
      joinCaseLog(e.caseProgressItems),
      joinCallLog(e.callLogItems),
    ];
  });
  return [JOURNAL_HEADER, ...rows];
}

export function buildExportRows(cases = [], journalEntries = {}) {
  const caseRows = [
    ["사건명", "분류", "상태", "의뢰인", "연락처", "상대방", "관할기관", "사건번호", "담당자", "소속", "수임일", "착수금", "성공보수", "성공보수금액"],
    ...cases.map(c => [
      c.title, c.type, c.status, c.client, c.clientContact, c.opponent,
      c.court, c.caseNumber, c.manager, c.managerOrg,
      c.retainer?.date, c.retainer?.amount, c.retainer?.successFee, c.retainer?.successFeeAmount,
    ]),
  ];

  const hearingRows = [
    ["사건명", "날짜", "시간", "유형", "결과/장소", "메모", "캘린더"],
    ...cases.flatMap(c =>
      (c.hearings || []).map(h => [c.title, h.date, h.time, h.type, h.result, h.memo, h.fromCalendar ? "LBOX" : ""])
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

  const briefRows = [
    ["사건명", "서면", "상태", "작성일", "제출일"],
    ...cases.flatMap(c =>
      (c.briefs || []).map(b => [c.title, b.title, b.status === "submitted" ? "제출완료" : "제출대기", b.preparedDate, b.submittedDate])
    ),
  ];

  return {
    caseRows: normalizeRows(caseRows),
    hearingRows: normalizeRows(hearingRows),
    memoRows: normalizeRows(memoRows),
    timelineRows: normalizeRows(timelineRows),
    todoRows: normalizeRows(todoRows),
    briefRows: normalizeRows(briefRows),
    journalRows: normalizeRows(buildJournalRows(journalEntries)),
  };
}

export function buildExportBatchUpdateData(cases = [], journalEntries = {}) {
  const { caseRows, hearingRows, memoRows, timelineRows, todoRows, briefRows, journalRows } = buildExportRows(cases, journalEntries);

  return [
    { range: a1Range("사건 목록"), values: caseRows },
    { range: a1Range("기일"), values: hearingRows },
    { range: a1Range("메모"), values: memoRows },
    { range: a1Range("진행경과"), values: timelineRows },
    { range: a1Range("할 일"), values: todoRows },
    { range: a1Range("서면"), values: briefRows },
    { range: a1Range("업무일지"), values: journalRows },
  ];
}
