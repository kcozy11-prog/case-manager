// ─────────────────────────────────────────────────────────────────────────────
//  업무일지 저장 병합 (순수 함수)
//  하루치 일지는 문서 하나다. 예전에는 저장 때 화면 내용으로 문서 전체를 덮어써, 그 사이 다른 기기가
//  저장한 내용이 사라질 수 있었다. 이제 저장 직전에 서버 판본(theirs)을 다시 읽어,
//  이 화면이 출발한 판본(base) · 이 화면의 내용(mine)과 3자 비교로 합친다.
//   - 목록 필드(할 일·서면·위임 업무·기록 등): 항목 id 단위로 합친다. 한쪽만 바꾼 항목은 그쪽을 따르고,
//     양쪽이 같은 항목을 서로 다르게 바꿨을 때만 '충돌'로 돌려준다(사용자가 고른다).
//   - 완료 기록 필드: 충돌 없이 합집합으로 합친다(완료 기록은 많을수록 안전 — 처리한 항목이 되살아나지 않음).
//   - 글 필드(오늘 업무·메모 등): 한쪽만 바꿨으면 그쪽, 양쪽이 다르게 바꿨으면 충돌.
//   - 목록에서 만들어지는 요약 글(pendingDocs·delegated·learned)은 비교하지 않는다(저장 때 다시 만든다).
// ─────────────────────────────────────────────────────────────────────────────
import { itemKey, stableStringify } from "./caseMerge.js";

export const JOURNAL_LIST_FIELDS = [
  "todayTasks", "tomorrowTasks", "pendingDocItems", "delegatedItems", "learnedItems",
  "caseProgressItems", "callLogItems",
];
export const JOURNAL_COMPLETION_FIELDS = ["todayTaskCompletions", "pendingDocCompletions", "delegatedCompletions"];
export const JOURNAL_TEXT_FIELDS = ["arrivalTime", "leaveTime", "todayWork", "callNotes", "writtenDocs", "etc"];
export const JOURNAL_DERIVED_FIELDS = ["pendingDocs", "delegated", "learned"];
const SKIP_FIELDS = new Set(["_savedAt", "entryDate", ...JOURNAL_DERIVED_FIELDS]);

export const JOURNAL_FIELD_LABELS = {
  arrivalTime: "출근 시각", leaveTime: "퇴근 시각", todayWork: "오늘 업무", callNotes: "통화·상담 메모",
  writtenDocs: "작성 서면", etc: "기타", todayTasks: "오늘 할 일", tomorrowTasks: "내일 할 일",
  pendingDocItems: "제출 예정 서면", delegatedItems: "위임 업무", learnedItems: "배운 점",
  caseProgressItems: "사건 진행 기록", callLogItems: "통화 상담 기록", submittedDocItems: "제출한 서면",
  eventMemos: "일정 메모", todayTaskCompletions: "오늘 할 일 완료 기록",
  pendingDocCompletions: "제출 예정 서면 완료 기록", delegatedCompletions: "위임 업무 완료 기록",
};

// 값 → 목록 (빈 값은 빈 목록, 목록이 아니면 null)
function asList(v) {
  if (v === undefined || v === null || v === "") return [];
  if (Array.isArray(v)) return v;
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t.startsWith("[")) return null;
  try {
    const parsed = JSON.parse(t);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const textOf = (v) => (v === undefined || v === null ? "" : String(v));

const completionKey = (r) => `${r?.id || ""}|${r?.text || ""}|${r?.dueDate || ""}|${r?.sourceDate || ""}`;

function groupBy(list, keyFn) {
  const map = new Map();
  const order = [];
  for (const item of list) {
    const k = keyFn(item);
    if (!map.has(k)) { map.set(k, []); order.push(k); }
    map.get(k).push(item);
  }
  return { map, order };
}

export function describeJournalItem(item) {
  if (!item || typeof item !== "object") return String(item ?? "");
  const text = item.text || item.title || item.content || item.detail || "";
  const extra = item.assignee ? `${item.assignee}: ` : "";
  const due = item.dueDate ? ` (~${item.dueDate})` : "";
  return `${extra}${text}${due}`.trim() || JSON.stringify(item).slice(0, 80);
}

// 항목 단위 3자 병합. 반환: { list, conflicts: [{ key, mine, theirs, base }] }
function mergeLists(baseList, mineList, theirsList, { keyFn = itemKey, field, choices, union = false }) {
  const b = groupBy(baseList, keyFn);
  const m = groupBy(mineList, keyFn);
  const t = groupBy(theirsList, keyFn);
  const sig = (g) => (g === undefined ? undefined : stableStringify(g));
  const resolved = new Map();
  const conflicts = [];
  const keys = [...new Set([...t.order, ...m.order, ...b.order])];
  for (const k of keys) {
    const bk = b.map.get(k);
    const mk = m.map.get(k);
    const tk = t.map.get(k);
    if (sig(mk) === sig(tk)) { resolved.set(k, mk); continue; }
    if (sig(mk) === sig(bk)) { resolved.set(k, tk); continue; } // 다른 기기만 바꿈(추가·수정·삭제)
    if (sig(tk) === sig(bk)) { resolved.set(k, mk); continue; } // 이 화면만 바꿈
    if (union) { resolved.set(k, tk || mk); continue; } // 완료 기록: 둘 다 있으면 서버 것, 한쪽만 있으면 그것
    const id = `${field}|${k}`;
    const choice = choices?.[id];
    conflicts.push({
      id, field, kind: "item", label: JOURNAL_FIELD_LABELS[field] || field,
      base: bk ? bk.map(describeJournalItem).join(" / ") : "",
      mine: mk ? mk.map(describeJournalItem).join(" / ") : "(이 화면에서 지움)",
      theirs: tk ? tk.map(describeJournalItem).join(" / ") : "(다른 기기에서 지움)",
      resolved: !!choice,
    });
    resolved.set(k, choice === "theirs" ? tk : mk); // 고르지 않았으면 우선 이 화면 것(미리보기용)
  }
  // 순서: 서버 판본 순서를 따르고, 이 화면에만 있는 항목은 이 화면의 순서대로 뒤에 붙인다
  const out = [];
  const placed = new Set();
  for (const k of [...t.order, ...m.order]) {
    if (placed.has(k)) continue;
    placed.add(k);
    const g = resolved.get(k);
    if (g) out.push(...g);
  }
  return { list: out, conflicts };
}

// base: 이 화면이 출발한 서버 판본(없으면 null) · mine: 이 화면 내용 · theirs: 지금 서버 판본(없으면 null)
// choices: { [충돌 id]: "mine" | "theirs" }
// 반환: { merged, conflicts(고르지 않은 것만 unresolved 표시), otherChanged: 다른 기기 변경을 받아들였는지 }
export function mergeJournalEntries(base, mine, theirs, choices = {}) {
  const B = base || {};
  const M = mine || {};
  const T = theirs || {};
  const merged = { ...T, ...M };
  const conflicts = [];
  let otherChanged = false;
  const fields = [...new Set([...Object.keys(B), ...Object.keys(M), ...Object.keys(T)])].filter((f) => !SKIP_FIELDS.has(f));
  for (const f of fields) {
    const isCompletion = JOURNAL_COMPLETION_FIELDS.includes(f);
    const isText = JOURNAL_TEXT_FIELDS.includes(f);
    const lists = isText ? null : [asList(B[f]), asList(M[f]), asList(T[f])];
    if (lists && lists.every(Boolean)) {
      const [bl, ml, tl] = lists;
      if (stableStringify(ml) === stableStringify(tl)) { merged[f] = M[f] ?? T[f] ?? ""; continue; }
      const r = mergeLists(bl, ml, tl, { field: f, choices, union: isCompletion, keyFn: isCompletion ? completionKey : itemKey });
      conflicts.push(...r.conflicts);
      if (stableStringify(r.list) !== stableStringify(ml)) otherChanged = true;
      merged[f] = JSON.stringify(r.list);
      continue;
    }
    const b = textOf(B[f]);
    const m = textOf(M[f]);
    const t = textOf(T[f]);
    if (m === t || t === b) { merged[f] = M[f] ?? ""; continue; }
    if (m === b) { merged[f] = T[f] ?? ""; otherChanged = true; continue; }
    const id = f;
    const choice = choices?.[id];
    conflicts.push({ id, field: f, kind: "text", label: JOURNAL_FIELD_LABELS[f] || f, base: b, mine: m, theirs: t, resolved: !!choice });
    merged[f] = choice === "theirs" ? (T[f] ?? "") : (M[f] ?? "");
    if (choice === "theirs") otherChanged = true;
  }
  return { merged, conflicts, unresolved: conflicts.filter((c) => !c.resolved), otherChanged };
}
