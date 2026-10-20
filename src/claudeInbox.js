// ─────────────────────────────────────────────────────────────────────────────
//  Claude 반영 검토함 (순수 함수)
//  Claude가 사건 작업 뒤 만든 반영 파일(cm-update-v1)을 읽고, 검증하고, 고른 항목만 사건별 수정본으로 만든다.
//   - 사건 연결은 cmCaseId(앱의 사건 id)로만 한다. 사건번호는 대조에만 쓰고, 이름으로 추측하지 않는다.
//   - 새로 만드는 배열 항목은 id를 `cl:<batchId>:<itemId>`로 고정하고 claude: { batchId, itemId, fp } 표시를 붙인다.
//     같은 항목을 다시 반영해도 같은 id로 덮일 뿐 늘어나지 않고(차이 병합이 id 단위), 검토함은 「이미 반영됨」으로 막는다.
//     fp 는 항목 내용의 지문이다. 같은 묶음·항목 id로 다른 내용이 오면(묶음 id 재사용) 앞 기록을 덮지 않도록 오류로 막는다.
//   - 저장은 하지 않는다. App 이 saveCase(next, { base }) 로 바뀐 부분만 서버 최신 문서에 얹는다.
// ─────────────────────────────────────────────────────────────────────────────
import { normalizeTextForCaseMatching, MIN_CASE_NUMBER_MATCH_LENGTH } from "./aiParse.js";
import { upsertBrief, markBriefSubmitted, upsertTimelineEntry, upsertCaseMemo, buildCallTimelineContent } from "./caseLink.js";
import { getTimelineActivity, DEFAULT_TIMELINE_ACTIVITY_TYPE } from "./timelineActivity.js";
import { CASE_ARRAY_FIELDS, stableStringify, diffCase } from "./caseMerge.js";
import { MEMO_CATEGORIES } from "./utils.js";
import { isBriefDraftingTodo, isUnrecognizedBriefTodo, briefTitleFromTodoText, moveTodoToBrief } from "./todoBrief.js";

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
// 회사업무 캘린더 동기화가 사건마다 하나씩 관리하는 메모 제목(calendarSync.WORK_SUMMARY_MEMO_TITLE)
const RESERVED_MEMO_TITLES = ["캘린더 업무 요약"];

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
const hasId = (x) => !!x && x.id !== undefined && x.id !== null && x.id !== "" && !Number.isNaN(x.id);
// 서면 중 id가 하나뿐인 것만 짝지을 수 있다(id가 겹치거나 비정상이면 엉뚱한 서면이 제출 처리될 수 있음)
const uniqueIdIn = (list) => (b) => hasId(b) && asArray(list).filter((x) => x && x.id === b.id).length === 1;
// 오류 문구에 넣을 값 설명(문자열이 아니면 종류만)
const describeValue = (v) => (typeof v === "string" ? v.slice(0, 60) : v === null ? "null" : Array.isArray(v) ? "배열" : typeof v);
// 비교용: 공백을 모두 뺀다 ("준비서면 (2)" = "준비서면(2)")
const compact = (s) => String(s ?? "").replace(/\s+/g, "");

// 서면 제출과 이을 서면 작성 할 일: 미완료이고 id가 하나뿐이며, 서면 작성 할 일로 인식되고 그 서면 제목이 같고,
// 아직 서면과 이어지지 않은 것. 같은 묶음이 만든 할 일은 뺀다(검토 창은 묶음 반영 전 사건으로 판정하므로).
function linkableDraftingTodos(caseObj, title, batchId = "") {
  const todos = asArray(caseObj?.todos);
  const briefs = asArray(caseObj?.briefs).filter(Boolean);
  return todos.filter((t) => uniqueIdIn(todos)(t) && !t.done && !t.completedTimelineId
    && !(batchId && t.claude && t.claude.batchId === batchId)
    && isBriefDraftingTodo(t.text) && compact(briefTitleFromTodoText(t.text)) === compact(title)
    && !briefs.some((b) => (t.briefId && b.id === t.briefId) || b.fromTodoId === t.id));
}

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
// 글 전체 → 코드 상자(```json … ```) 안 → 첫 { 부터 끝 } 까지 순서로 JSON 을 찾는다. 못 찾으면 undefined.
// (aiParse 의 extractJsonObject 는 글 속 ``` 를 모두 지우므로, 항목 글을 바꾸지 않도록 여기서는 쓰지 않는다)
function readJsonText(raw) {
  const tries = [raw];
  const fenced = /```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```/i.exec(raw);
  if (fenced) tries.push(fenced[1]);
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) tries.push(raw.slice(start, end + 1));
  for (const t of tries) {
    try { return JSON.parse(t); } catch { /* 다음 방법 */ }
  }
  return undefined;
}

// 묶음 전체에 관한 형식 오류는 여기서 던진다. 항목별 검사는 validateBatch 가 한다.
export function parseBatch(text) {
  const raw = String(text ?? "").replace(/^﻿/, "").trim();
  if (!raw) throw new Error("붙여넣은 내용이 없습니다.");
  const data = readJsonText(raw);
  if (data === undefined) {
    throw new Error("반영 블록(JSON)을 읽지 못했습니다. Claude가 준 블록이나 .cm.json 파일 내용을 그대로 넣어 주세요.");
  }
  if (!isPlainObject(data)) throw new Error("반영 블록은 { … } 모양의 JSON이어야 합니다.");
  if (data.format === CM_BINDING_FORMAT) {
    throw new Error("연결 코드(cm-binding-v1)입니다. 연결 코드는 Claude 사건 폴더 세션에 붙여넣는 것이고, 여기에는 반영 블록(cm-update-v1)을 넣어야 합니다.");
  }
  if (data.format !== CM_UPDATE_FORMAT) {
    throw new Error(`형식이 ${CM_UPDATE_FORMAT}이 아닙니다(받은 값: ${data.format === undefined ? "없음" : describeValue(data.format)}).`);
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
// 모양: { batches: { [batchId]: { at: 마지막 반영 시각, items: { [항목 id]: { fp: 지문, caseId: 넣은 사건 } } } } }
// App 은 사건 저장과 같은 트랜잭션에서, 실제로 들어간(또는 이미 있던) 항목만 여기에 적는다.
function ledgerItems(ledger, batchId) {
  const batches = isPlainObject(ledger?.batches) ? ledger.batches : null;
  const entry = batches && hasOwn(batches, batchId) ? batches[batchId] : null;
  return isPlainObject(entry?.items) ? entry.items : {};
}

const ledgerFp = (v) => (typeof v === "string" ? v : isPlainObject(v) ? String(v.fp || "") : "");

export function ledgerItemIds(ledger, batchId) {
  return new Set(Object.keys(ledgerItems(ledger, batchId)));
}

// 반영 기록 문서에 적을 내용 (setDoc merge 용). entries: { 항목 id: { fp, caseId } }
export function buildLedgerPatch(batchId, entries, at) {
  return { batches: { [batchId]: { at, items: { ...entries } } }, updatedAt: at };
}

// 반영 기록 문서 크기(Firestore 문서 한도 1MB)를 넘지 않게 지울 오래된 묶음 id.
// 묶음 수가 keep 을 넘거나, 대략 크기가 maxChars 를 넘으면 마지막 반영이 오래된 것부터 고른다.
export const LEDGER_MAX_CHARS = 600000;
export function ledgerBatchesToPrune(ledger, keep = LEDGER_KEEP_BATCHES, maxChars = LEDGER_MAX_CHARS) {
  const batches = isPlainObject(ledger?.batches) ? ledger.batches : {};
  const ids = Object.keys(batches)
    .sort((a, b) => String(batches[a]?.at || "").localeCompare(String(batches[b]?.at || "")));
  const sizeOf = (id) => id.length + JSON.stringify(batches[id] ?? null).length;
  let count = ids.length;
  let size = ids.reduce((n, id) => n + sizeOf(id), 0);
  const out = [];
  for (const id of ids) {
    if (count <= keep && size <= maxChars) break;
    out.push(id);
    count -= 1;
    size -= sizeOf(id);
  }
  return out;
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
      // 기존 제출대기 서면을 이 항목이 제출 처리한 표시(제출 대기로 되돌린 뒤에도 남아 다시 반영을 막는다)
      const sub = x.claudeSubmit;
      if (sub && sub.batchId === batchId && sub.itemId === itemId) return { fp: String(sub.fp || "") };
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
    errors.push(item.op === undefined ? "op 없음" : `알 수 없는 op: ${describeValue(item.op)}`);
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
  // 앱이 따로 관리하는 메모 제목은 쓰지 못한다(회사업무 캘린더 동기화가 덮어쓰거나 지움)
  const memoTitle = item.op === "memo" || item.op === "deadline" || (item.op === "call" && norm.asClientRequest) ? norm.title : "";
  if (memoTitle && RESERVED_MEMO_TITLES.some((t) => compact(t) === compact(memoTitle))) {
    errors.push(`「${memoTitle}」은 앱이 자동으로 쓰는 메모 제목이라 쓸 수 없음`);
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

// 사건에 이미 있는 내용과 견준 경고. 판정을 바꾸지 않는 안내는 notes 에 넣는다.
function contentWarnings(n, caseObj, { today, batchPendingTitles, batchSubmittedTitles, batchLinkedTodoIds, notes }) {
  const warns = [];
  const briefs = asArray(caseObj.briefs).filter(Boolean);
  const timeline = asArray(caseObj.timeline).filter(Boolean);
  const memos = asArray(caseObj.memos).filter(Boolean);
  const sameTitle = (b) => compact(b.title) === compact(n.title);
  const isPast = (d) => !!(today && d && d < today);
  const isFuture = (d) => !!(today && d && d > today);

  switch (n.op) {
    case "brief.submitted": {
      const pending = briefs.filter((b) => uniqueIdIn(briefs)(b) && b.status !== "submitted" && sameTitle(b));
      const submitted = briefs.filter((b) => b.status === "submitted" && sameTitle(b));
      if (pending.length > 1) warns.push(`같은 제목의 제출대기 서면이 ${pending.length}건 — 먼저 등록된 것을 제출 처리함`);
      if (!pending.length) {
        // 제출대기 서면이 없으면 같은 제목의 미완료 서면 작성 할 일이 하나뿐일 때 그 할 일을 완료하고 서면으로 옮겨 제출 처리한다(applyItem)
        const ownPending = batchPendingTitles.has(compact(n.title));
        const todos = ownPending ? [] : linkableDraftingTodos(caseObj, n.title).filter((t) => !batchLinkedTodoIds.has(String(t.id)));
        if (submitted.length) warns.push(`같은 제목 서면이 이미 제출 처리되어 있음(${submitted[0].submittedDate || "제출일 없음"}) — 반영하면 새 서면으로 하나 더 기록됨`);
        if (todos.length === 1) {
          notes.push("같은 제목의 서면 작성 할 일을 완료 처리하고 제출함");
          batchLinkedTodoIds.add(String(todos[0].id));
        } else if (todos.length > 1) {
          warns.push(`같은 제목의 서면 작성 할 일이 ${todos.length}건 — 어느 할 일인지 정할 수 없어 할 일은 그대로 두고 새 서면을 만들어 제출 처리함`);
        } else if (!submitted.length && !ownPending) {
          warns.push("같은 제목의 제출대기 서면이 없어 새로 만들어 제출 처리함");
        }
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
      if (isUnrecognizedBriefTodo(n.text)) warns.push("서면 작성 할 일로 인식되지 않음 — 완료해도 제출대기 서면으로 옮겨지지 않음");
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
  const linkedTodoIdsByCase = new Map(); // 같은 묶음 앞 서면 제출이 이미 이은 서면 작성 할 일
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
      const prevFp = (ledgerHit && ledgerFp(ledgerMap[id])) || found?.fp || "";
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
      const batchLinkedTodoIds = titleSet(linkedTodoIdsByCase, caseKey);
      warnings.push(...contentWarnings(norm, caseObj, { today, batchPendingTitles, batchSubmittedTitles, batchLinkedTodoIds, notes }));
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
      // 같은 제목 제출대기 서면이 있으면 그것을 제출 처리, 없으면 같은 제목의 미완료 서면 작성 할 일이 하나뿐일 때
      // 그 할 일을 완료하고 서면으로 옮겨(할 일 탭과 같은 moveTodoToBrief) 제출 처리, 그것도 없으면 새로 만들어 제출 처리
      // (+ 진행경과 "제목 제출")
      const briefs = asArray(caseObj.briefs);
      const pending = briefs.find((b) => uniqueIdIn(briefs)(b) && b.status !== "submitted" && compact(b.title) === compact(n.title));
      const todos = pending ? [] : linkableDraftingTodos(caseObj, n.title, batchId);
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
      } else if (todos.length === 1) {
        // 서면은 이 항목의 고정 id로 만들고(새 항목), 할 일은 완료 칸(done·completedDate·completedTimelineId·briefId)만 바뀐다.
        // 완료일·작성일은 제출일로 둔다(파일 값이므로 다른 날 반영해도 같은 결과).
        const doneTimelineId = `${baseId}:done`;
        const moved = moveTodoToBrief(caseObj, todos[0].id, n.date, undefined, { briefId: baseId, doneTimelineId });
        briefId = baseId;
        next = moved.caseObj;
        if (n.details && !moved.brief?.details) {
          next = { ...next, briefs: asArray(next.briefs).map((b) => (b && b.id === briefId ? { ...b, details: n.details } : b)) };
        }
        next = markNew(next, "briefs", briefId, mark);
        next = markNew(next, "timeline", doneTimelineId, mark);
      } else {
        briefId = baseId;
        next = upsertBrief(next, { id: briefId, title: n.title, preparedDate: n.date, ...(n.details ? { details: n.details } : {}) });
        next = markNew(next, "briefs", briefId, mark);
      }
      const timelineId = `${baseId}:tl`;
      next = markBriefSubmitted(next, briefId, n.date, () => timelineId);
      // 기존 서면을 제출 처리했으면 그 서면에도 표시를 남긴다(어느 묶음이 제출 처리했는지, 다시 반영 막기)
      if (pending) next = { ...next, briefs: asArray(next.briefs).map((b) => (b && b.id === briefId ? { ...b, claudeSubmit: { ...mark } } : b)) };
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

// 항목 하나가 사건에 낸 변경을 나눈다: 새로 만든 항목(cl:… id)과, 서면 제출이 기존 제출대기 서면에 얹는 제출 칸,
// 서면 제출이 이은 기존 서면 작성 할 일의 완료 칸(todoPatch).
// 그 밖의 변경(기존 항목 수정·삭제, 사건 기본 필드 변경)이 섞이면 unexpected=true.
const TODO_DONE_FIELDS = ["done", "completedDate", "completedTimelineId", "briefId"];
function splitItemChange(before, after, r, batchId) {
  const baseId = claudeItemBaseId(batchId, r.id);
  const d = diffCase(before, after);
  const created = [];
  let briefPatch = null;
  let todoPatch = null;
  let unexpected = Object.keys(d.set).length > 0;
  for (const [field, fd] of Object.entries(d.arrays)) {
    if (fd.removed.length) unexpected = true;
    for (const u of fd.upserts) {
      const id = u.key.startsWith("id:") ? u.key.slice(3) : null;
      if (id !== null && (id === baseId || id.startsWith(`${baseId}:`))) created.push({ field, key: u.key });
      else if (field === "briefs" && r.norm.op === "brief.submitted" && !briefPatch && u.items.length === 1) {
        const b = u.items[0];
        // prev: 이 항목을 얹기 전 서면. 같은 묶음 앞 항목이 만든 서면인데 이 제출 처리만 저장 때 건너뛰면 이 판본으로 둔다
        const prev = asArray(before.briefs).find((x) => x && `id:${String(x.id)}` === u.key) || null;
        briefPatch = {
          key: u.key,
          set: { status: b.status, submittedDate: b.submittedDate, submitTimelineId: b.submitTimelineId, claudeSubmit: b.claudeSubmit },
          fillDetails: r.norm.details || "",
          prev,
        };
      } else if (field === "todos" && r.norm.op === "brief.submitted" && !todoPatch && u.items.length === 1) {
        // 미완료였던 할 일 하나의 완료 칸만 바뀌어야 한다(문구·메모·마감일 등은 그대로)
        const t = u.items[0];
        const prev = asArray(before.todos).find((x) => x && `id:${String(x.id)}` === u.key) || null;
        const set = Object.fromEntries(TODO_DONE_FIELDS.map((k) => [k, t[k]]));
        if (!prev || prev.done || stableStringify({ ...prev, ...set }) !== stableStringify(t)) unexpected = true;
        else todoPatch = { key: u.key, set, prev };
      } else unexpected = true;
    }
  }
  // 서면 제출은 반드시 「제목 제출」 진행경과를 만들고, 기존 서면을 쓴 경우 그 서면이 제출 상태가 되어야 한다.
  // 할 일을 이은 경우에는 이 항목이 만든 서면(cl:…)과 완료 진행경과(…:done)에 그 할 일이 이어져야 한다.
  if (r.norm.op === "brief.submitted") {
    if (!created.some((c) => c.key === `id:${baseId}:tl`)) unexpected = true;
    if (briefPatch && briefPatch.set.status !== "submitted") unexpected = true;
    if (todoPatch) {
      if (briefPatch) unexpected = true;
      if (todoPatch.set.done !== true || todoPatch.set.briefId !== baseId || todoPatch.set.completedTimelineId !== `${baseId}:done`) unexpected = true;
      if (!created.some((c) => c.key === `id:${baseId}`) || !created.some((c) => c.key === `id:${baseId}:done`)) unexpected = true;
    }
  }
  return { created, briefPatch, todoPatch, unexpected };
}

// 고른 항목을 사건별 수정본으로 만든다: [{ caseId, base, next, itemIds, fingerprints, guard }]
// 다시 검증해서 오류·이미 반영됨 항목은 골랐더라도 넣지 않는다. 같은 사건의 항목은 묶음 순서대로 얹는다.
// seen: 사용자가 화면에서 본 판정 { 항목 id: status }. 그 사이 정상 → 경고로 바뀐 항목은 확인 없이 넣지 않는다.
// guard: 저장 순간 서버 최신본에 맞춰 다시 가리는 보호 정보(claudeGuard.js). App 이 diff 에 붙여 저장한다.
export function planBatch(batch, cases = [], selectedItemIds = [], { today = "", ledger = null, seen = null } = {}) {
  const selected = new Set((selectedItemIds ? [...selectedItemIds] : []).map(String));
  const report = validateBatch(batch, cases, ledger, { today });
  const byCase = new Map();
  for (const r of report.items) {
    if (!selected.has(r.id) || !isSelectableStatus(r.status) || !r.caseObj) continue;
    if (seen && seen[r.id] === "ok" && r.status !== "ok") continue;
    const key = String(r.caseObj.id);
    if (!byCase.has(key)) byCase.set(key, { caseObj: r.caseObj, entries: [] });
    byCase.get(key).entries.push(r);
  }
  const plan = [];
  for (const { caseObj, entries } of byCase.values()) {
    let next = caseObj;
    const done = [];
    const guardItems = [];
    for (const r of entries) {
      const after = applyItem(next, r.norm, { batchId: batch.batchId, today, fp: r.fp });
      const { created, briefPatch, todoPatch, unexpected } = splitItemChange(next, after, r, batch.batchId);
      if (unexpected || (!created.length && !briefPatch)) continue; // 정해진 밖의 변경이 생기는 항목은 넣지 않는다
      next = after;
      done.push(r);
      guardItems.push({ itemId: r.id, fp: r.fp, created, ...(briefPatch ? { briefPatch } : {}), ...(todoPatch ? { todoPatch } : {}) });
    }
    if (!done.length) continue;
    plan.push({
      caseId: caseObj.id, base: caseObj, next,
      itemIds: done.map((r) => r.id),
      fingerprints: Object.fromEntries(done.map((r) => [r.id, r.fp])),
      guard: { batchId: batch.batchId, items: guardItems },
    });
  }
  return plan;
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
    case "todo": return {
      title: n.text,
      meta: join(
        `우선순위 ${n.priority}`,
        n.dueDate && `마감 ${n.dueDate}`,
        // 할 일 탭은 서면 작성 할 일을 완료하면 제출대기 서면으로 옮긴다(todoBrief.js)
        isBriefDraftingTodo(n.text) && `완료 시 제출대기 서면 '${briefTitleFromTodoText(n.text)}'(으)로 이동`,
      ),
      body: n.details,
    };
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
