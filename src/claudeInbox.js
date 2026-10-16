// ─────────────────────────────────────────────────────────────────────────────
//  Claude 반영 검토함 (순수 함수)
//  Claude가 사건 작업 뒤 만든 반영 파일(cm-update-v1)을 읽고, 검증하고, 고른 항목만 사건별 수정본으로 만든다.
//   - 사건 연결은 cmCaseId(앱의 사건 id)로만 한다. 사건번호는 대조에만 쓰고, 이름으로 추측하지 않는다.
//   - 새로 만드는 배열 항목은 id를 `cl:<batchId>:<itemId>`로 고정하고 claude: { batchId, itemId, fp } 표시를 붙인다.
//     같은 항목을 다시 반영해도 같은 id로 덮일 뿐 늘어나지 않고(차이 병합이 id 단위), 검토함은 「이미 반영됨」으로 막는다.
//     fp 는 항목 내용의 지문이다. 같은 묶음·항목 id로 다른 내용이 오면(묶음 id 재사용) 앞 기록을 덮지 않도록 오류로 막는다.
//   - 저장은 하지 않는다. App 이 saveCase(next, { base }) 로 바뀐 부분만 서버 최신 문서에 얹는다.
// ─────────────────────────────────────────────────────────────────────────────
import { extractJsonObject, normalizeTextForCaseMatching, MIN_CASE_NUMBER_MATCH_LENGTH } from "./aiParse.js";
import { upsertBrief, markBriefSubmitted, upsertTimelineEntry, upsertCaseMemo, buildCallTimelineContent } from "./caseLink.js";
import { getTimelineActivity, DEFAULT_TIMELINE_ACTIVITY_TYPE } from "./timelineActivity.js";
import { CASE_ARRAY_FIELDS, stableStringify } from "./caseMerge.js";
import { MEMO_CATEGORIES } from "./utils.js";

export const CM_UPDATE_FORMAT = "cm-update-v1";
export const CM_BINDING_FORMAT = "cm-binding-v1";
export const MAX_TEXT_LENGTH = 2000;
export const MAX_ITEMS = 200;
// 반영 기록 문서(meta/claudeInbox)에 남겨 둘 묶음 수. 넘으면 오래된 묶음부터 지운다(사건 안 표시로 중복은 계속 막힘).
export const LEDGER_KEEP_BATCHES = 1000;
// 할 일 탭에서 실제로 고를 수 있는 우선순위 (TodosTab)
export const TODO_PRIORITIES = ["높음", "보통"];
// 일반 메모로 받을 수 있는 분류. 불변기간은 checked 상태가 필요하므로 op "deadline"으로만 받는다.
export const CLAUDE_MEMO_CATEGORIES = MEMO_CATEGORIES.filter((c) => c !== "불변기간");

const BATCH_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
const ITEM_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const BATCH_FIELDS = ["format", "batchId", "createdAt", "source", "items"];
const SOURCE_FIELDS = ["folder", "pc", "session"];
const COMMON_FIELDS = ["id", "cmCaseId", "caseNumber", "op", "basis"];

// 필드 종류: text | date | time | bool | priority | activity | memoCategory, 끝에 "!"가 붙으면 필수
export const OP_SPECS = {
  "brief.submitted": { label: "서면 제출", fields: { title: "text!", date: "date!", details: "text" } },
  "brief.pending": { label: "제출대기 서면", fields: { title: "text!", date: "date", details: "text" } },
  deadline: { label: "기한", fields: { title: "text!", date: "date!", content: "text" } },
  todo: { label: "할 일", fields: { text: "text!", details: "text", priority: "priority", dueDate: "date" } },
  hearing: { label: "기일", fields: { date: "date!", type: "text!", time: "time", place: "text" } },
  progress: { label: "진행경과", fields: { date: "date!", content: "text!", detail: "text", activityType: "activity" } },
  call: { label: "통화", fields: { date: "date!", title: "text!", detail: "text", asClientRequest: "bool" } },
  memo: { label: "메모", fields: { category: "memoCategory!", title: "text!", content: "text", date: "date" } },
};

const isPlainObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const asArray = (v) => (Array.isArray(v) ? v : []);
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const isBlank = (v) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");
const hasId = (x) => !!x && x.id !== undefined && x.id !== null && x.id !== "";
// 비교용: 공백을 모두 뺀다 ("준비서면 (2)" = "준비서면(2)")
const compact = (s) => String(s ?? "").replace(/\s+/g, "");

// 항목 내용의 지문(FNV-1a 32비트). 근거·사건번호·항목 id는 넣지 않는다(같은 내용이면 같은 지문).
export function itemFingerprint(n) {
  if (!n) return "";
  const { id: _id, basis: _basis, caseNumber: _caseNumber, ...content } = n;
  const text = stableStringify(content);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function isValidDate(s) {
  const m = DATE_RE.exec(String(s ?? ""));
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 2000 || y > 2100) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function isValidTime(s) {
  return TIME_RE.test(String(s ?? ""));
}

// ── 붙여넣은 글·파일 → 묶음 ─────────────────────────────────────────────────
// 묶음 전체에 관한 형식 오류는 여기서 던진다. 항목별 검사는 validateBatch 가 한다.
export function parseBatch(text) {
  const raw = String(text ?? "").replace(/^﻿/, "").trim();
  if (!raw) throw new Error("붙여넣은 내용이 없습니다.");
  let data;
  try {
    data = extractJsonObject(raw);
  } catch {
    throw new Error("반영 블록(JSON)을 읽지 못했습니다. Claude가 준 블록이나 .cm.json 파일 내용을 그대로 넣어 주세요.");
  }
  if (!isPlainObject(data)) throw new Error("반영 블록은 { … } 모양의 JSON이어야 합니다.");
  if (data.format === CM_BINDING_FORMAT) {
    throw new Error("연결 코드(cm-binding-v1)입니다. 연결 코드는 Claude 사건 폴더 세션에 붙여넣는 것이고, 여기에는 반영 블록(cm-update-v1)을 넣어야 합니다.");
  }
  if (data.format !== CM_UPDATE_FORMAT) {
    throw new Error(`형식이 ${CM_UPDATE_FORMAT}이 아닙니다(받은 값: ${data.format === undefined ? "없음" : String(data.format)}).`);
  }
  const unknown = Object.keys(data).filter((k) => !BATCH_FIELDS.includes(k));
  if (unknown.length) throw new Error(`묶음에 알 수 없는 필드가 있습니다: ${unknown.join(", ")}`);
  if (typeof data.batchId !== "string" || !BATCH_ID_RE.test(data.batchId)) {
    throw new Error("batchId가 없거나 형식이 맞지 않습니다(영문·숫자·-·_ 100자 이내).");
  }
  if (data.createdAt !== undefined && data.createdAt !== null && (typeof data.createdAt !== "string" || data.createdAt.length > 100)) {
    throw new Error("createdAt은 날짜·시각 문자열이어야 합니다.");
  }
  if (data.source !== undefined && data.source !== null) {
    if (!isPlainObject(data.source)) throw new Error("source는 { folder, pc } 모양이어야 합니다.");
    const unknownSource = Object.keys(data.source).filter((k) => !SOURCE_FIELDS.includes(k));
    if (unknownSource.length) throw new Error(`source에 알 수 없는 필드가 있습니다: ${unknownSource.join(", ")}`);
    for (const k of SOURCE_FIELDS) {
      const v = data.source[k];
      if (v !== undefined && v !== null && (typeof v !== "string" || v.length > MAX_TEXT_LENGTH)) {
        throw new Error(`source.${k}는 ${MAX_TEXT_LENGTH}자 이내 문자열이어야 합니다.`);
      }
    }
  }
  if (!Array.isArray(data.items) || data.items.length === 0) throw new Error("items(반영할 항목)가 비어 있습니다.");
  if (data.items.length > MAX_ITEMS) throw new Error(`항목이 너무 많습니다(${data.items.length}건, 최대 ${MAX_ITEMS}건). 묶음을 나눠 주세요.`);
  return {
    format: data.format,
    batchId: data.batchId,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
    source: isPlainObject(data.source) ? { ...data.source } : null,
    items: data.items,
  };
}

// ── 반영 기록(meta/claudeInbox) ─────────────────────────────────────────────
// 모양: { batches: { [batchId]: { at: 마지막 반영 시각, items: { [항목 id]: 지문 } } } }
// App 은 사건 저장이 서버에서 확인된 항목만 여기에 적는다.
function ledgerItems(ledger, batchId) {
  const batches = isPlainObject(ledger?.batches) ? ledger.batches : null;
  const entry = batches && hasOwn(batches, batchId) ? batches[batchId] : null;
  return isPlainObject(entry?.items) ? entry.items : {};
}

export function ledgerItemIds(ledger, batchId) {
  return new Set(Object.keys(ledgerItems(ledger, batchId)));
}

// 반영 기록 문서에 적을 내용 (setDoc merge 용)
export function buildLedgerPatch(batchId, fingerprints, at) {
  return { batches: { [batchId]: { at, items: { ...fingerprints } } }, updatedAt: at };
}

// 남겨 둘 수를 넘은 오래된 묶음 id (마지막 반영 시각 기준)
export function ledgerBatchesToPrune(ledger, keep = LEDGER_KEEP_BATCHES) {
  const batches = isPlainObject(ledger?.batches) ? ledger.batches : {};
  const ids = Object.keys(batches);
  if (ids.length <= keep) return [];
  return ids
    .sort((a, b) => String(batches[a]?.at || "").localeCompare(String(batches[b]?.at || "")))
    .slice(0, ids.length - keep);
}

export function claudeItemBaseId(batchId, itemId) {
  return `cl:${batchId}:${itemId}`;
}

// 사건 안에 이 항목으로 만든 기록이 있는지 (claude 표시나 고정 id).
// 있으면 { fp } (표시에 지문이 없으면 fp ""), 없으면 null
export function findClaudeItem(caseObj, batchId, itemId) {
  if (!caseObj) return null;
  const baseId = claudeItemBaseId(batchId, itemId);
  for (const field of CASE_ARRAY_FIELDS) {
    for (const x of asArray(caseObj[field])) {
      if (!x || typeof x !== "object") continue;
      const id = String(x.id ?? "");
      const marked = x.claude && x.claude.batchId === batchId && x.claude.itemId === itemId;
      if (marked || id === baseId || id.startsWith(`${baseId}:`)) return { fp: marked ? String(x.claude.fp || "") : "" };
    }
  }
  return null;
}

export function caseHasClaudeItem(caseObj, batchId, itemId) {
  return !!findClaudeItem(caseObj, batchId, itemId);
}

// ── 사건번호 대조 ───────────────────────────────────────────────────────────
// 포함 비교는 하지 않는다. 다음 중 하나면 일치(match)로 본다.
//  ① 공백만 뺀 전체 문자열이 같음(연결 코드는 앱 사건번호를 그대로 옮기므로 다시 연결하면 늘 맞음)
//  ② 앱 칸을 , / ; · 줄바꿈으로 나눈 번호 하나와 정규화해 같음
// ③ 파일 쪽 사건번호가 「연도+부호+번호」 하나이고 앱 칸 글 속에만 있으면("2026가단1 외 1건", "2027나1 (원심 2026가단1)")
//    같은 사건인지 단정할 수 없으므로 일부 일치(partial) — 경고로 띄워 기본 선택하지 않는다.
const CASE_NO_TOKEN_RE = /(\d{2,4})\s*([가-힣]{1,6})\s*(\d{1,8})/g;
const caseNumberTokens = (s) => [...String(s ?? "").matchAll(CASE_NO_TOKEN_RE)].map((m) => `${m[1]}${m[2]}${m[3]}`);

function usableAppCaseNumber(caseNumber) {
  const raw = String(caseNumber ?? "").trim();
  if (!raw || raw === "—") return "";
  const parts = raw.split(/[,/;\n·・]+/).map(normalizeTextForCaseMatching);
  return parts.some((p) => p.length >= MIN_CASE_NUMBER_MATCH_LENGTH) ? raw : "";
}

export function compareCaseNumber(itemCaseNumber, caseObj) {
  const raw = usableAppCaseNumber(caseObj?.caseNumber);
  const givenRaw = String(itemCaseNumber ?? "").trim();
  const given = normalizeTextForCaseMatching(givenRaw);
  if (!given) return raw ? "missing" : "none";
  if (!raw) return "app-empty";
  if (compact(givenRaw) === compact(raw)) return "match";
  const parts = raw.split(/[,/;\n·・]+/).map(normalizeTextForCaseMatching).filter((p) => p.length >= MIN_CASE_NUMBER_MATCH_LENGTH);
  if (parts.includes(given)) return "match";
  const givenTokens = caseNumberTokens(givenRaw);
  if (givenTokens.length === 1 && caseNumberTokens(raw).includes(givenTokens[0])) return "partial";
  return "mismatch";
}

// ── 항목 정규화·검사 ────────────────────────────────────────────────────────
function checkField(name, kind, value, errors) {
  const required = kind.endsWith("!");
  const type = required ? kind.slice(0, -1) : kind;
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
    if (required) errors.push(`필수 값 없음: ${name}`);
    return undefined;
  }
  if (type === "bool") {
    if (typeof value !== "boolean") { errors.push(`${name}는 true/false여야 함`); return undefined; }
    return value;
  }
  if (typeof value !== "string") { errors.push(`${name}는 문자열이어야 함`); return undefined; }
  if (value.length > MAX_TEXT_LENGTH) { errors.push(`${name} 글자 수 초과(${value.length}자, 최대 ${MAX_TEXT_LENGTH}자)`); return undefined; }
  const v = value.trim();
  if (type === "date" && !isValidDate(v)) { errors.push(`${name} 날짜 형식 오류(YYYY-MM-DD): ${v}`); return undefined; }
  if (type === "time" && !isValidTime(v)) { errors.push(`${name} 시각 형식 오류(HH:MM): ${v}`); return undefined; }
  if (type === "priority" && !TODO_PRIORITIES.includes(v)) { errors.push(`priority는 ${TODO_PRIORITIES.join("·")} 중 하나여야 함: ${v}`); return undefined; }
  if (type === "activity" && !getTimelineActivity(v)) { errors.push(`activityType 값 오류: ${v}`); return undefined; }
  if (type === "memoCategory" && !CLAUDE_MEMO_CATEGORIES.includes(v)) {
    errors.push(v === "불변기간"
      ? "불변기간은 memo가 아니라 op \"deadline\"으로 보내야 함"
      : `category는 ${CLAUDE_MEMO_CATEGORIES.join("·")} 중 하나여야 함: ${v}`);
    return undefined;
  }
  return v;
}

// 항목의 형식을 검사하고, 반영에 쓸 값(공백 정리·기본값 채움)을 만든다.
export function normalizeItem(item, { today = "" } = {}) {
  const errors = [];
  if (!isPlainObject(item)) return { errors: ["항목이 { … } 모양이 아님"], norm: null };
  const spec = typeof item.op === "string" && hasOwn(OP_SPECS, item.op) ? OP_SPECS[item.op] : null;
  if (typeof item.id !== "string" || !ITEM_ID_RE.test(item.id)) errors.push("항목 id가 없거나 형식이 맞지 않음(영문·숫자·-·_)");
  if (!spec) {
    errors.push(item.op === undefined ? "op 없음" : `알 수 없는 op: ${(typeof item.op === "string" ? item.op : JSON.stringify(item.op) ?? String(item.op)).slice(0, 60)}`);
    return { errors, norm: null };
  }
  const allowed = [...COMMON_FIELDS, ...Object.keys(spec.fields)];
  for (const key of Object.keys(item)) {
    if (!allowed.includes(key)) errors.push(`알 수 없는 필드: ${key}`);
  }
  const cmCaseId = item.cmCaseId;
  if (isBlank(cmCaseId)) errors.push("cmCaseId 없음(사건 지정 필요 — 연결 코드로 사건을 지정해 주세요)");
  else if (typeof cmCaseId !== "string" || cmCaseId.length > 200) errors.push("cmCaseId 형식 오류");
  const caseNumber = checkField("caseNumber", "text", item.caseNumber, errors);
  const basis = checkField("basis", "text", item.basis, errors);

  const norm = {
    id: typeof item.id === "string" ? item.id : "",
    op: item.op,
    cmCaseId: typeof cmCaseId === "string" ? cmCaseId.trim() : "",
    caseNumber: caseNumber || "",
    basis: basis || "",
  };
  for (const [name, kind] of Object.entries(spec.fields)) {
    const v = checkField(name, kind, item[name], errors);
    norm[name] = kind.startsWith("bool") ? v === true : (v || "");
  }
  // 지문은 파일에 적힌 값으로만 만든다(기본값의 '오늘'이 들어가면 다음 날 같은 묶음이 다른 내용으로 보인다)
  const fp = itemFingerprint(norm);
  // 기본값 (앱 입력 화면과 같게)
  if (item.op === "todo" && !norm.priority) norm.priority = "보통";
  if (item.op === "progress" && !norm.activityType) norm.activityType = DEFAULT_TIMELINE_ACTIVITY_TYPE;
  if (item.op === "memo" && !norm.date) norm.date = today;
  if (item.op === "brief.pending" && !norm.date) norm.date = today;
  return { errors, norm, fp };
}

// 같은 내용인지 견줄 열쇠 (묶음 안 중복 검사용)
function contentKey(n) {
  switch (n.op) {
    case "brief.submitted": return `brief.submitted|${compact(n.title)}`;
    case "brief.pending": return `brief|${compact(n.title)}`;
    case "deadline": return `deadline|${n.date}|${compact(n.title)}`;
    case "todo": return `todo|${compact(n.text)}`;
    case "hearing": return `hearing|${n.date}|${compact(n.type)}|${n.time}`;
    case "progress": return `progress|${n.date}|${compact(n.content)}`;
    case "call": return `call|${n.date}|${compact(buildCallTimelineContent({ title: n.title, detail: n.detail }))}`;
    case "memo": return `memo|${n.category}|${n.date}|${compact(n.title)}`;
    default: return "";
  }
}

// 사건에 이미 있는 내용과 견준 경고
function contentWarnings(n, caseObj, { today, batchPendingTitles, batchSubmittedTitles }) {
  const warns = [];
  const briefs = asArray(caseObj.briefs).filter(Boolean);
  const timeline = asArray(caseObj.timeline).filter(Boolean);
  const memos = asArray(caseObj.memos).filter(Boolean);
  const sameTitle = (b) => compact(b.title) === compact(n.title);
  const isPast = (d) => !!(today && d && d < today);
  const isFuture = (d) => !!(today && d && d > today);

  switch (n.op) {
    case "brief.submitted": {
      const pending = briefs.filter((b) => hasId(b) && b.status !== "submitted" && sameTitle(b));
      const submitted = briefs.filter((b) => b.status === "submitted" && sameTitle(b));
      if (pending.length > 1) warns.push(`같은 제목의 제출대기 서면이 ${pending.length}건 — 먼저 등록된 것을 제출 처리함`);
      if (!pending.length) {
        if (submitted.length) warns.push(`같은 제목 서면이 이미 제출 처리되어 있음(${submitted[0].submittedDate || "제출일 없음"}) — 반영하면 새 서면으로 하나 더 기록됨`);
        else if (!batchPendingTitles.has(compact(n.title))) warns.push("같은 제목의 제출대기 서면이 없어 새로 만들어 제출 처리함");
      }
      if (timeline.some((t) => t.date === n.date && compact(t.content) === compact(`${n.title} 제출`))) {
        warns.push("같은 날짜에 같은 제출 진행경과가 이미 있음");
      }
      if (isFuture(n.date)) warns.push(`제출일이 오늘 이후임(${n.date})`);
      break;
    }
    case "brief.pending": {
      const same = briefs.filter(sameTitle);
      if (same.length) warns.push(`같은 제목 서면이 이미 있음(${same[0].status === "submitted" ? "제출완료" : "제출대기"})`);
      if (batchSubmittedTitles.has(compact(n.title))) warns.push("같은 묶음 앞 항목에서 이 제목 서면을 제출 처리함 — 함께 반영하면 제출대기 서면이 하나 더 생김");
      break;
    }
    case "deadline": {
      if (memos.some((m) => m.category === "불변기간" && m.date === n.date && sameTitle(m))) warns.push("같은 날짜·제목의 기한이 이미 있음");
      if (isPast(n.date)) warns.push(`기한이 이미 지났음(${n.date})`);
      break;
    }
    case "todo": {
      const sameTodos = asArray(caseObj.todos).filter((t) => t && compact(t.text) === compact(n.text));
      if (sameTodos.some((t) => !t.done)) warns.push("같은 내용의 미완료 할 일이 이미 있음");
      else if (sameTodos.length) warns.push("같은 내용의 할 일이 이미 완료되어 있음");
      if (isPast(n.dueDate)) warns.push(`마감일이 이미 지났음(${n.dueDate})`);
      break;
    }
    case "hearing": {
      const sameDay = asArray(caseObj.hearings).filter((h) => h && h.date === n.date);
      if (sameDay.some((h) => compact(h.type) === compact(n.type) && (h.time || "") === n.time)) warns.push("같은 날짜·종류·시각의 기일이 이미 있음");
      else if (sameDay.length) warns.push("같은 날짜에 다른 기일이 있음(LBOX에서 들어온 기일과 겹치는지 확인)");
      if (isPast(n.date)) warns.push(`지난 기일임(${n.date})`);
      break;
    }
    case "progress": {
      if (timeline.some((t) => t.date === n.date && compact(t.content) === compact(n.content))) warns.push("같은 날짜·내용의 진행경과가 이미 있음");
      if (isFuture(n.date)) warns.push(`진행경과 날짜가 오늘 이후임(${n.date})`);
      break;
    }
    case "call": {
      const content = buildCallTimelineContent({ title: n.title, detail: n.detail });
      if (timeline.some((t) => t.date === n.date && compact(t.content) === compact(content))) warns.push("같은 날짜·내용의 통화 기록이 이미 있음");
      if (n.asClientRequest && memos.some((m) => m.category === "의뢰인요청" && m.date === n.date && sameTitle(m))) {
        warns.push("같은 날짜·제목의 의뢰인요청 메모가 이미 있음");
      }
      if (isFuture(n.date)) warns.push(`통화 날짜가 오늘 이후임(${n.date})`);
      break;
    }
    case "memo": {
      if (memos.some((m) => m.category === n.category && m.date === n.date && sameTitle(m))) warns.push("같은 날짜·분류·제목의 메모가 이미 있음");
      else if (memos.some((m) => m.category === n.category && sameTitle(m) && compact(m.content) === compact(n.content))) {
        warns.push("같은 분류·제목·내용의 메모가 이미 있음(날짜만 다름)");
      }
      break;
    }
    default:
      break;
  }
  return warns;
}

// ── 묶음 검증 ───────────────────────────────────────────────────────────────
// 항목마다 status: ok(정상) | warn(경고, 기본 해제) | error(반영 불가) | applied(이미 반영됨)
export function validateBatch(batch, cases = [], ledger = null, { today = "" } = {}) {
  const batchId = batch?.batchId || "";
  const byId = new Map(asArray(cases).filter((c) => c && c.id !== undefined).map((c) => [String(c.id), c]));
  const ledgerMap = ledgerItems(ledger, batchId);
  const seenIds = new Set();
  const seenKeys = new Set();
  const pendingTitlesByCase = new Map();
  const submittedTitlesByCase = new Map();
  const titleSet = (map, key) => {
    if (!map.has(key)) map.set(key, new Set());
    return map.get(key);
  };

  const items = asArray(batch?.items).map((item, index) => {
    const { errors, norm, fp: normFp } = normalizeItem(item, { today });
    const warnings = [];
    const notes = [];
    const id = norm?.id || (isPlainObject(item) && typeof item.id === "string" ? item.id : "");
    if (id && seenIds.has(id)) errors.push("같은 묶음 안에 같은 항목 id가 또 있음");
    if (id) seenIds.add(id);

    const caseObj = norm?.cmCaseId ? byId.get(norm.cmCaseId) || null : null;
    const structural = errors.length > 0;

    const fp = structural ? "" : normFp;
    let applied = false;
    if (!structural) {
      const ledgerHit = hasOwn(ledgerMap, id);
      const found = findClaudeItem(caseObj, batchId, id);
      const prevFp = (ledgerHit && String(ledgerMap[id] || "")) || found?.fp || "";
      if (ledgerHit || found) {
        if (prevFp && prevFp !== fp) {
          // 같은 고정 id 로 반영하면 앞 기록을 덮어쓰므로 막는다
          errors.push("같은 묶음·항목 id로 다른 내용이 이미 반영되어 있음(묶음 id 재사용) — Claude에 새 batchId로 다시 만들어 달라고 해 주세요");
        } else {
          applied = true;
          notes.push(ledgerHit ? "이미 반영됨(반영 기록 있음)" : "이미 반영됨(사건에 이 항목 표시가 있음)");
        }
      }
    }

    if (!structural && norm.cmCaseId && !caseObj) errors.push(`앱에 없는 사건(cmCaseId ${norm.cmCaseId}) — 지워졌거나 다른 계정의 사건일 수 있음`);
    if (!structural && caseObj) {
      const cmp = compareCaseNumber(norm.caseNumber, caseObj);
      if (cmp === "mismatch") errors.push(`사건번호 불일치(파일 ${norm.caseNumber} / 앱 ${caseObj.caseNumber}) — 연결 코드를 다시 확인해 주세요`);
      else if (cmp === "partial") warnings.push(`사건번호가 앱 사건번호 칸의 일부와만 일치함(파일 ${norm.caseNumber} / 앱 ${caseObj.caseNumber}) — 같은 사건인지 확인해 주세요`);
      else if (cmp === "missing") warnings.push("파일에 사건번호가 없어 대조하지 못함");
      else if (cmp === "app-empty") warnings.push("앱 사건에 사건번호가 없어 대조하지 못함");
    }

    if (!errors.length && !applied && caseObj) {
      if (caseObj.status === "종결") warnings.push("종결 사건임");
      if (!norm.basis) warnings.push("근거(basis) 없음");
      const caseKey = String(caseObj.id);
      const batchPendingTitles = titleSet(pendingTitlesByCase, caseKey);
      const batchSubmittedTitles = titleSet(submittedTitlesByCase, caseKey);
      warnings.push(...contentWarnings(norm, caseObj, { today, batchPendingTitles, batchSubmittedTitles }));
      const key = `${caseKey}|${contentKey(norm)}`;
      if (seenKeys.has(key)) warnings.push("같은 묶음 안에 같은 내용의 항목이 또 있음");
      seenKeys.add(key);
      if (norm.op === "brief.pending") batchPendingTitles.add(compact(norm.title));
      if (norm.op === "brief.submitted") batchSubmittedTitles.add(compact(norm.title));
    }

    const status = applied ? "applied" : errors.length ? "error" : warnings.length ? "warn" : "ok";
    return {
      index, id, op: norm?.op || (isPlainObject(item) ? item.op : undefined),
      cmCaseId: norm?.cmCaseId || "", caseObj, norm, fp, raw: item,
      status, errors, warnings, notes,
    };
  });

  const groups = [];
  const groupMap = new Map();
  for (const r of items) {
    const key = r.caseObj ? `case:${r.caseObj.id}` : `none:${r.cmCaseId}`;
    if (!groupMap.has(key)) {
      const g = { key, caseObj: r.caseObj, cmCaseId: r.cmCaseId, items: [] };
      groupMap.set(key, g);
      groups.push(g);
    }
    groupMap.get(key).items.push(r);
  }
  const counts = { total: items.length, ok: 0, warn: 0, error: 0, applied: 0 };
  for (const r of items) counts[r.status]++;
  return { batchId, items, groups, counts };
}

export function isSelectableStatus(status) {
  return status === "ok" || status === "warn";
}

// 기본 선택: 정상 항목만 (경고는 사람이 보고 직접 고른다)
export function defaultSelectedIds(report) {
  return asArray(report?.items).filter((r) => r.status === "ok").map((r) => r.id);
}

// ── 반영 ────────────────────────────────────────────────────────────────────
function markNew(caseObj, field, id, mark) {
  return {
    ...caseObj,
    [field]: asArray(caseObj[field]).map((x) => (x && x.id === id ? { ...x, claude: { ...mark } } : x)),
  };
}

function upsertItem(caseObj, field, item) {
  const arr = asArray(caseObj[field]);
  const idx = arr.findIndex((x) => x && x.id === item.id);
  if (idx === -1) return { ...caseObj, [field]: [...arr, item] };
  const next = arr.slice();
  next[idx] = { ...arr[idx], ...item };
  return { ...caseObj, [field]: next };
}

// 항목 하나를 사건에 얹은 새 사건 객체를 돌려준다(원본 불변). n 은 normalizeItem 의 결과.
// fp 는 normalizeItem 이 돌려준 지문(파일에 적힌 값 기준)을 넘긴다.
export function applyItem(caseObj, n, { batchId, today = "", fp = "" } = {}) {
  const mark = { batchId, itemId: n.id, fp: fp || itemFingerprint(n) };
  const baseId = claudeItemBaseId(batchId, n.id);
  switch (n.op) {
    case "brief.submitted": {
      // 같은 제목 제출대기 서면이 있으면 그것을 제출 처리, 없으면 새로 만들어 제출 처리 (+ 진행경과 "제목 제출")
      const briefs = asArray(caseObj.briefs);
      const pending = briefs.find((b) => hasId(b) && b.status !== "submitted" && compact(b.title) === compact(n.title));
      let next = caseObj;
      let briefId = pending?.id;
      if (pending) {
        // 옛 제출 연결(submitTimelineId·submittedDate)이 남아 있어도 다른 진행경과를 덮지 않도록 이번 제출로 새로 잡는다.
        // 서면 메모(details)는 비어 있을 때만 채운다.
        next = {
          ...caseObj,
          briefs: briefs.map((b) => (b === pending
            ? { ...b, submittedDate: "", submitTimelineId: "", ...(n.details && !b.details ? { details: n.details } : {}) }
            : b)),
        };
      } else {
        briefId = baseId;
        next = upsertBrief(next, { id: briefId, title: n.title, preparedDate: n.date, ...(n.details ? { details: n.details } : {}) });
        next = markNew(next, "briefs", briefId, mark);
      }
      const timelineId = `${baseId}:tl`;
      next = markBriefSubmitted(next, briefId, n.date, () => timelineId);
      return markNew(next, "timeline", timelineId, mark);
    }
    case "brief.pending": {
      const next = upsertBrief(caseObj, { id: baseId, title: n.title, preparedDate: n.date || today, ...(n.details ? { details: n.details } : {}) });
      return markNew(next, "briefs", baseId, mark);
    }
    case "deadline":
      // 개요 탭의 기한 입력과 같은 모양 (메모 category 불변기간, checked:false)
      return upsertItem(caseObj, "memos", {
        id: baseId, category: "불변기간", title: n.title, content: n.content || "", date: n.date, checked: false, claude: mark,
      });
    case "todo":
      return upsertItem(caseObj, "todos", {
        id: baseId, done: false, text: n.text, details: n.details || "", priority: n.priority || "보통", dueDate: n.dueDate || "", claude: mark,
      });
    case "hearing":
      // 장소는 LBOX 동기화처럼 result 칸에 둔다
      return upsertItem(caseObj, "hearings", {
        id: baseId, date: n.date, time: n.time || "", type: n.type, result: n.place || "", claude: mark,
      });
    case "progress": {
      const next = upsertTimelineEntry(caseObj, {
        id: baseId, date: n.date, content: n.content,
        ...(n.detail ? { detail: n.detail } : {}),
        activityType: n.activityType || DEFAULT_TIMELINE_ACTIVITY_TYPE,
      });
      return markNew(next, "timeline", baseId, mark);
    }
    case "call": {
      // 업무일지 통화 기록과 같은 구조: 진행경과 [통화/상담] + (asClientRequest) 의뢰인요청 메모
      let next = upsertTimelineEntry(caseObj, {
        id: baseId, date: n.date, content: buildCallTimelineContent({ title: n.title, detail: n.detail }), activityType: "call",
      });
      next = markNew(next, "timeline", baseId, mark);
      if (n.asClientRequest) {
        const memoId = `${baseId}:memo`;
        next = upsertCaseMemo(next, { id: memoId, category: "의뢰인요청", title: n.title, content: n.detail || "", date: n.date });
        next = markNew(next, "memos", memoId, mark);
      }
      return next;
    }
    case "memo": {
      const next = upsertCaseMemo(caseObj, { id: baseId, category: n.category, title: n.title, content: n.content || "", date: n.date || today });
      return markNew(next, "memos", baseId, mark);
    }
    default:
      return caseObj;
  }
}

// 고른 항목을 사건별 수정본으로 만든다: [{ caseId, base, next, itemIds, fingerprints }]
// 다시 검증해서 오류·이미 반영됨 항목은 골랐더라도 넣지 않는다. 같은 사건의 항목은 묶음 순서대로 얹는다.
// seen: 사용자가 화면에서 본 판정 { 항목 id: status }. 그 사이 정상 → 경고로 바뀐 항목은 확인 없이 넣지 않는다.
export function planBatch(batch, cases = [], selectedItemIds = [], { today = "", ledger = null, seen = null } = {}) {
  const selected = new Set(asArray([...selectedItemIds]).map(String));
  const report = validateBatch(batch, cases, ledger, { today });
  const byCase = new Map();
  for (const r of report.items) {
    if (!selected.has(r.id) || !isSelectableStatus(r.status) || !r.caseObj) continue;
    if (seen && seen[r.id] === "ok" && r.status !== "ok") continue;
    const key = String(r.caseObj.id);
    if (!byCase.has(key)) byCase.set(key, { caseObj: r.caseObj, entries: [] });
    byCase.get(key).entries.push(r);
  }
  return [...byCase.values()].map(({ caseObj, entries }) => {
    let next = caseObj;
    for (const r of entries) next = applyItem(next, r.norm, { batchId: batch.batchId, today, fp: r.fp });
    return {
      caseId: caseObj.id, base: caseObj, next,
      itemIds: entries.map((r) => r.id),
      fingerprints: Object.fromEntries(entries.map((r) => [r.id, r.fp])),
    };
  });
}

// ── 화면 표시용 ─────────────────────────────────────────────────────────────
export function opLabel(op) {
  return OP_SPECS[op]?.label || String(op ?? "알 수 없음");
}

// 미리보기 한 줄: { title, meta, body }
export function describeItem(n) {
  if (!n) return { title: "(읽을 수 없는 항목)", meta: "", body: "" };
  const join = (...xs) => xs.filter(Boolean).join(" · ");
  switch (n.op) {
    case "brief.submitted": return { title: `${n.title} 제출`, meta: join(`제출일 ${n.date}`), body: n.details };
    case "brief.pending": return { title: n.title, meta: join("제출대기 서면 추가", n.date && `작성일 ${n.date}`), body: n.details };
    case "deadline": return { title: n.title, meta: join(`기한 ${n.date}`), body: n.content };
    case "todo": return { title: n.text, meta: join(`우선순위 ${n.priority}`, n.dueDate && `마감 ${n.dueDate}`), body: n.details };
    case "hearing": return { title: n.type, meta: join(`${n.date}${n.time ? ` ${n.time}` : ""}`, n.place), body: "" };
    case "progress": return { title: n.content, meta: join(n.date, getTimelineActivity(n.activityType)?.label), body: n.detail };
    case "call": return {
      title: buildCallTimelineContent({ title: n.title, detail: "" }),
      meta: join(n.date, n.asClientRequest && "의뢰인요청 메모도 남김"),
      body: n.detail,
    };
    case "memo": return { title: `[${n.category}] ${n.title}`, meta: join(n.date), body: n.content };
    default: return { title: String(n.op), meta: "", body: "" };
  }
}

// 사건 화면 「연결 코드 복사」: Claude 사건 폴더 세션에 붙여넣는 한 줄 JSON
export function buildBindingCode(caseObj) {
  const caseNumber = String(caseObj?.caseNumber ?? "").trim();
  return JSON.stringify({
    format: CM_BINDING_FORMAT,
    cmCaseId: String(caseObj?.id ?? ""),
    caseNumber: caseNumber === "—" ? "" : caseNumber,
    title: String(caseObj?.title ?? ""),
  });
}
