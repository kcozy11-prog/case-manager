// ─────────────────────────────────────────────────────────────────────────────
//  사건 문서 병합 저장 (순수 헬퍼)
//  여러 기기나 자동 동기화가 같은 사건을 고칠 때, 화면이 들고 있던 판본으로 문서 전체를
//  덮어쓰면 그 사이 다른 곳에서 저장한 내용이 사라진다(옛 캐시로 시작한 기기가 특히 위험).
//  그래서 저장할 때는 '이번 수정으로 바뀐 부분'(diff)만 뽑아 서버의 최신 문서 위에 다시 얹는다.
//   - 배열(기일·진행경과·메모·문서·할 일·서면)은 항목 id 단위로 추가·변경·삭제만 반영한다.
//   - 그 밖의 필드는 바뀐 필드만 덮어쓴다. 수정본에 없는 필드는 건드리지 않는다(지우지 않음).
//   - 같은 diff 를 여러 번 적용해도 결과가 같다(멱등) — 재시도해도 안전하다.
// ─────────────────────────────────────────────────────────────────────────────

export const CASE_ARRAY_FIELDS = ["hearings", "timeline", "memos", "documents", "todos", "briefs"];

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

// 키 순서와 무관한 비교용 직렬화 (서버에서 읽은 문서와 화면 객체는 필드 순서가 다를 수 있다)
export function stableStringify(value) {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

const asArray = (v) => (Array.isArray(v) ? v : []);

// 배열 항목의 식별 키: id 가 있으면 id, 없으면 내용 전체.
export function itemKey(item) {
  if (item && typeof item === "object" && item.id !== undefined && item.id !== null && item.id !== "") {
    return `id:${String(item.id)}`;
  }
  return `v:${stableStringify(item)}`;
}

function groupByKey(items) {
  const groups = new Map();
  for (const item of asArray(items)) {
    const key = itemKey(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

// 배열 diff: { upserts: [{ key, items }], removed: [key] }
// (같은 id 가 둘 이상인 옛 데이터도 묶음 단위로 다뤄 결과가 어긋나지 않게 한다)
export function diffItems(baseItems, nextItems) {
  const base = groupByKey(baseItems);
  const next = groupByKey(nextItems);
  const upserts = [];
  const removed = [];
  for (const [key, items] of next) {
    const before = base.get(key);
    if (!before || stableStringify(before) !== stableStringify(items)) upserts.push({ key, items });
  }
  for (const key of base.keys()) {
    if (!next.has(key)) removed.push(key);
  }
  return { upserts, removed };
}

// 최신 배열에 diff 를 얹는다: 삭제분은 빼고, 바뀐 항목은 제자리에서 교체, 새 항목은 끝에 붙인다.
export function applyItemsDiff(latestItems, diff) {
  if (!diff) return asArray(latestItems);
  const upserts = new Map((diff.upserts || []).map((u) => [u.key, u.items]));
  const removed = new Set(diff.removed || []);
  const placed = new Set();
  const out = [];
  for (const item of asArray(latestItems)) {
    const key = itemKey(item);
    if (removed.has(key)) continue;
    if (upserts.has(key)) {
      if (!placed.has(key)) {
        out.push(...upserts.get(key));
        placed.add(key);
      }
      continue;
    }
    out.push(item);
  }
  for (const u of diff.upserts || []) {
    if (!placed.has(u.key)) out.push(...u.items);
  }
  return out;
}

// 사건 diff: { set: { 필드: 새 값 }, arrays: { 배열필드: 배열 diff } }
export function diffCase(base, next) {
  const before = base || {};
  const after = next || {};
  const set = {};
  const arrays = {};
  for (const key of Object.keys(after)) {
    if (key === "id") continue;
    const value = after[key];
    if (value === undefined) continue;
    if (CASE_ARRAY_FIELDS.includes(key) && Array.isArray(value)) {
      const prev = hasOwn(before, key) ? before[key] : undefined;
      if (prev === undefined || Array.isArray(prev)) {
        const d = diffItems(prev, value);
        if (d.upserts.length || d.removed.length) arrays[key] = d;
        continue;
      }
    }
    if (!hasOwn(before, key) || stableStringify(before[key]) !== stableStringify(value)) set[key] = value;
  }
  return { set, arrays };
}

export function isEmptyCaseDiff(diff) {
  return !diff || (Object.keys(diff.set || {}).length === 0 && Object.keys(diff.arrays || {}).length === 0);
}

export function applyCaseDiff(latest, diff) {
  const out = { ...(latest || {}) };
  if (!diff) return out;
  for (const [key, value] of Object.entries(diff.set || {})) out[key] = value;
  for (const [key, d] of Object.entries(diff.arrays || {})) out[key] = applyItemsDiff(out[key], d);
  return out;
}

// 저장된 사건 문서를 화면에서 쓰는 형태로 맞춘다 (옛 memo 문자열 → memos 배열).
export function normalizeCaseDoc(raw, today = "") {
  const c = { ...(raw || {}) };
  if (!Array.isArray(c.memos)) {
    c.memos = c.memo
      ? [{ id: 1, category: "일반메모", title: "메모", content: c.memo, date: today }]
      : [];
  }
  return c;
}

// 진단·안내용: diff 가 건드리는 항목 수
export function countCaseDiffChanges(diff) {
  if (!diff) return 0;
  let n = Object.keys(diff.set || {}).length;
  for (const d of Object.values(diff.arrays || {})) n += (d.upserts || []).length + (d.removed || []).length;
  return n;
}
