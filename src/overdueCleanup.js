// ─────────────────────────────────────────────────────────────────────────────
//  기한 지난 미완료 할 일 일괄 삭제 (순수 헬퍼)
//  - 대상: 사건 할 일·일반 할 일 가운데 기한이 오늘보다 앞서고 아직 완료하지 않은 것
//    (화면의 '기한 지남' 표시와 같은 기준). 화면에 나오지 않는 옛 캘린더 할 일(fromCalendar)은 뺀다.
//  - 미리보기에서 본 그대로인 항목만 지운다. 그 사이 완료하거나 고친 항목은 건너뛴다.
//  - 지운 할 일은 원본 그대로 되돌리기 기록에 남긴다.
//  - Google 할 일에서 온 항목은 Google 쪽 목록에 그대로 있다(이 앱은 Google 할 일을 읽기만 한다).
//    다음 동기화 때 다시 들어오지 않도록 숨김 기록을 두되, Google 쪽에서 기한을 바꾸면 다시 가져온다.
// ─────────────────────────────────────────────────────────────────────────────
import { isOverdueTodo } from "./todoUi.js";
import { STANDALONE_TODOS_CASE_ID, STANDALONE_TODOS_TITLE } from "./standaloneTodos.js";
import { itemKey, stableStringify } from "./caseMerge.js";

export const CLEANUP_LOG_LIMIT = 10;
// 기록 문서 하나는 1MB 를 넘을 수 없다. 오래된 기록부터 덜어 이 크기 안으로 둔다.
export const CLEANUP_LOG_MAX_BYTES = 600000;

const asArray = (v) => (Array.isArray(v) ? v : []);
const PRIO_ORDER = { "높음": 0, "보통": 1 };

export function isCleanupTarget(todo, today = new Date()) {
  return !!todo && typeof todo === "object" && !todo.fromCalendar && isOverdueTodo(todo, today);
}

// 기한이 며칠 지났는지 (isOverdueTodo 와 같은 방식으로 날짜만 비교)
export function daysOverdue(dueDate, today = new Date()) {
  const due = new Date(dueDate);
  const now = new Date(today);
  due.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const days = Math.round((now - due) / 86400000);
  return Number.isFinite(days) ? days : null;
}

function overdueItems(caseId, todos, today) {
  const seen = new Map();
  const items = [];
  for (const todo of asArray(todos)) {
    if (!isCleanupTarget(todo, today)) continue;
    const key = itemKey(todo);
    const n = seen.get(key) || 0;
    seen.set(key, n + 1);
    items.push({
      key: `${caseId}|${key}|${n}`,
      caseId,
      todo,
      google: !!todo.calendarTaskId,
      days: daysOverdue(todo.dueDate, today),
    });
  }
  // 오래 밀린 것부터, 같은 날이면 우선순위 높은 것부터
  return items.sort((a, b) => (b.days ?? 0) - (a.days ?? 0)
    || (PRIO_ORDER[a.todo.priority] ?? 1) - (PRIO_ORDER[b.todo.priority] ?? 1)
    || String(a.todo.text || "").localeCompare(String(b.todo.text || "")));
}

// 미리보기 묶음: 진행 중 사건(사건 목록 순서) → 일반 할 일 → 종결 사건
// 반환: [{ caseId, caseTitle, closed, standalone, items: [{ key, caseId, todo, google, days }] }]
export function collectOverdueTodos(cases = [], standaloneTodos = [], today = new Date()) {
  const active = [];
  const closed = [];
  for (const c of asArray(cases)) {
    if (!c || !c.id || c.id === STANDALONE_TODOS_CASE_ID) continue;
    const items = overdueItems(c.id, c.todos, today);
    if (!items.length) continue;
    const group = { caseId: c.id, caseTitle: c.title || "(제목 없음)", closed: c.status === "종결", standalone: false, items };
    (group.closed ? closed : active).push(group);
  }
  const standaloneItems = overdueItems(STANDALONE_TODOS_CASE_ID, standaloneTodos, today);
  const standalone = standaloneItems.length
    ? [{ caseId: STANDALONE_TODOS_CASE_ID, caseTitle: STANDALONE_TODOS_TITLE, closed: false, standalone: true, items: standaloneItems }]
    : [];
  return [...active, ...standalone, ...closed];
}

export function countOverdueTodos(cases = [], standaloneTodos = [], today = new Date()) {
  return collectOverdueTodos(cases, standaloneTodos, today).reduce((n, g) => n + g.items.length, 0);
}

function targetOf(caseId, cases, standaloneTodos) {
  if (caseId === STANDALONE_TODOS_CASE_ID) {
    return { caseObj: { id: caseId, todos: asArray(standaloneTodos) }, title: STANDALONE_TODOS_TITLE, standalone: true };
  }
  const caseObj = asArray(cases).find((c) => c && c.id === caseId);
  return caseObj ? { caseObj, title: caseObj.title || "", standalone: false } : null;
}

function groupByCase(list) {
  const byCase = new Map();
  for (const entry of asArray(list)) {
    if (!entry || !entry.caseId || !entry.todo) continue;
    if (!byCase.has(entry.caseId)) byCase.set(entry.caseId, []);
    byCase.get(entry.caseId).push(entry.todo);
  }
  return byCase;
}

// 고른 할 일만 뺀 판본을 사건마다 만든다. selection: [{ caseId, todo }] (미리보기에서 본 그대로의 할 일)
// 반환: { changes: [{ caseId, caseTitle, standalone, base, next, removed }], skipped }
export function planOverdueDeletion(cases = [], standaloneTodos = [], selection = []) {
  const changes = [];
  let skipped = 0;
  for (const [caseId, wanted] of groupByCase(selection)) {
    const target = targetOf(caseId, cases, standaloneTodos);
    if (!target) { skipped += wanted.length; continue; }
    const todos = asArray(target.caseObj.todos);
    const taken = new Set();
    const removed = [];
    for (const want of wanted) {
      const sig = stableStringify(want);
      const index = todos.findIndex((t, i) => !taken.has(i) && stableStringify(t) === sig);
      if (index < 0) { skipped++; continue; }
      taken.add(index);
      removed.push(todos[index]);
    }
    if (!removed.length) continue;
    const base = target.caseObj;
    changes.push({
      caseId,
      caseTitle: target.title,
      standalone: target.standalone,
      base,
      next: { ...base, todos: todos.filter((_, i) => !taken.has(i)) },
      removed,
    });
  }
  return { changes, skipped };
}

// ── 되돌리기 기록 (users/{uid}/meta/todoCleanup.entries) ──────────────────────
// 기록 한 건: { at, items: [{ caseId, caseTitle, todo }], undoneAt? }
// (JSON 으로 한 번 복사해 값이 undefined 인 필드를 뺀다 — Firestore 는 undefined 를 저장하지 못한다)
export function buildCleanupEntry(changes, at) {
  return JSON.parse(JSON.stringify({
    at,
    items: asArray(changes).flatMap((ch) => asArray(ch.removed).map((todo) => ({ caseId: ch.caseId, caseTitle: ch.caseTitle || "", todo }))),
  }));
}

const byteSize = (value) => new TextEncoder().encode(JSON.stringify(value)).length;

export function appendCleanupEntry(entries, entry, { limit = CLEANUP_LOG_LIMIT, maxBytes = CLEANUP_LOG_MAX_BYTES } = {}) {
  let out = [...asArray(entries).filter((e) => e && e.at), entry].slice(-limit);
  while (out.length > 1 && byteSize(out) > maxBytes) out = out.slice(1);
  return out;
}

export function lastActiveCleanup(entries) {
  return asArray(entries)
    .filter((e) => e && e.at && !e.undoneAt)
    .sort((a, b) => String(a.at).localeCompare(String(b.at)))
    .pop() || null;
}

export function markCleanupUndone(entries, at, undoneAt) {
  return asArray(entries).map((e) => (e && e.at === at ? { ...e, undoneAt } : e));
}

// ── Google 할 일 숨김 기록 (users/{uid}/meta/taskSync.deletedTasks) ────────────
// 기록 한 건: { id: Google 할 일 id, due: 지울 때 기한, updated: 지울 때 Google 쪽 수정 시각, at }
export function hiddenTaskRecords(entry) {
  return asArray(entry?.items)
    .map((it) => it?.todo)
    .filter((t) => t && t.calendarTaskId)
    .map((t) => ({ id: String(t.calendarTaskId), due: t.dueDate || "", updated: t.sourceUpdatedAt || "", at: entry.at }));
}

export function mergeHiddenTasks(current, records) {
  const map = new Map(asArray(current).filter((r) => r && r.id).map((r) => [String(r.id), r]));
  for (const r of asArray(records)) if (r && r.id) map.set(String(r.id), r);
  return [...map.values()];
}

// 되돌릴 때: 그 정리에서 숨긴 것만 푼다 (뒤에 다시 숨긴 기록은 둔다)
export function unhideTasks(current, ids, at) {
  const drop = new Set(asArray(ids).map(String));
  return asArray(current).filter((r) => !(r && drop.has(String(r.id)) && r.at === at));
}

export function linkedTaskIds(cases = [], standaloneTodos = []) {
  const ids = new Set();
  for (const c of asArray(cases)) for (const t of asArray(c?.todos)) if (t?.calendarTaskId) ids.add(String(t.calendarTaskId));
  for (const t of asArray(standaloneTodos)) if (t?.calendarTaskId) ids.add(String(t.calendarTaskId));
  return ids;
}

// 동기화 때 다시 가져오지 않을 Google 할 일인가
//  - 앱에 연결된 할 일이 있으면(되돌리기로 되살린 경우 등) 평소대로 동기화한다.
//  - Google 쪽에서 완료했으면 다시 가져오지 않는다.
//  - 지운 뒤 Google 쪽에서 고쳤고 기한도 달라졌으면 새 할 일로 보고 다시 가져온다.
export function isHiddenGoogleTask(task, records, linkedIds = new Set()) {
  if (!task || !task.id) return false;
  const id = String(task.id);
  const rec = asArray(records).find((r) => r && String(r.id) === id);
  if (!rec || linkedIds.has(id)) return false;
  if (task.status === "completed") return true;
  const changedInGoogle = !rec.updated || String(task.updated || "") !== String(rec.updated);
  if (!changedInGoogle) return true;
  const due = task.due ? String(task.due).split("T")[0] : "";
  return due === (rec.due || "");
}

// ── 되돌리기 ──────────────────────────────────────────────────────────────────
// 기록의 할 일을 원래 사건(또는 일반 할 일)에 다시 넣는다.
//  - 같은 할 일(id)이 이미 있거나 같은 Google 할 일이 앱에 이미 연결돼 있으면 넣지 않는다(중복 방지).
//  - 사건이 없어졌으면 넣지 않고 건수만 알린다.
// 반환: { changes: [{ caseId, caseTitle, standalone, base, next, restored }], missing, present,
//        taskIds: 숨김을 풀 Google 할 일 id (되살렸거나 이미 앱에 있는 것. 사건이 없어진 것은 숨긴 채 둔다) }
export function planCleanupUndo(cases = [], standaloneTodos = [], entry) {
  const linked = linkedTaskIds(cases, standaloneTodos);
  const changes = [];
  const taskIds = [];
  let missing = 0;
  let present = 0;
  for (const [caseId, todos] of groupByCase(entry?.items)) {
    const target = targetOf(caseId, cases, standaloneTodos);
    if (!target) { missing += todos.length; continue; }
    const current = asArray(target.caseObj.todos);
    const keys = new Set(current.map(itemKey));
    const restored = [];
    for (const todo of todos) {
      const key = itemKey(todo);
      const taskId = todo.calendarTaskId ? String(todo.calendarTaskId) : "";
      if (taskId) taskIds.push(taskId);
      if (keys.has(key) || (taskId && linked.has(taskId))) { present++; continue; }
      keys.add(key);
      if (taskId) linked.add(taskId);
      restored.push(todo);
    }
    if (!restored.length) continue;
    const base = target.caseObj;
    changes.push({ caseId, caseTitle: target.title, standalone: target.standalone, base, next: { ...base, todos: [...current, ...restored] }, restored });
  }
  return { changes, missing, present, taskIds };
}
