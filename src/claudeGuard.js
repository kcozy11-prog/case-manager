// ─────────────────────────────────────────────────────────────────────────────
//  Claude 반영 저장 보호 (순수 함수)
//  planBatch 가 사건 diff 에 붙인 보호 정보(diff.claude)를 '저장하는 순간의 서버 최신 문서'에 맞춰 푼다.
//  검토 창은 화면 판본으로 계획을 세우므로, 그 사이 다른 기기에서 고친 내용을 덮지 않도록 저장 직전에 다시 가린다.
//   - 이 항목으로 만든 기록(cl:… id)이 이미 있으면 그 항목은 건너뛴다(다른 기기에서 고친 내용을 덮지 않음).
//   - 반영 기록에 이미 있는 항목은 건너뛴다(사용자가 지운 항목을 되살리지 않음).
//   - 기존 제출대기 서면의 제출 처리는 최신 서면에 제출 칸만 얹는다. 그 사이 지워졌거나 이미 제출됐으면 건너뛴다.
//   - 서면 제출이 이은 서면 작성 할 일은 최신 할 일에 완료 칸만 얹는다. 그 사이 지워졌거나, 완료됐거나,
//     서면과 이어졌거나, 문구가 바뀌었으면 그 항목 전체를 건너뛴다(서면을 따로 만들지 않음 — 다시 붙여넣으면 새로 판정).
//  모양: diff.claude = {
//    batchId,
//    items: [{ itemId, fp, created: [{ field, key }], briefPatch?: { key, set, fillDetails }, todoPatch?: { key, set, prev } }],
//  }   (key 는 caseMerge 의 항목 열쇠 "id:<id>")
//  화면 겹쳐 보기(caseMerge.applyCaseDiff)와 서버 저장(App.commitCaseDiff)이 같은 규칙을 쓴다.
// ─────────────────────────────────────────────────────────────────────────────

const asArray = (v) => (Array.isArray(v) ? v : []);
const idKey = (x) => (x && x.id !== undefined && x.id !== null && x.id !== "" ? `id:${String(x.id)}` : null);

// 저장 트랜잭션에서 반영 기록에 남길 항목: 이번에 들어간 것 + 이미 사건에 있던 것 → { 항목 id: { fp, caseId } }
export function claudeLedgerEntries(guard, applied = [], skipped = [], caseId = "") {
  const keep = new Set([...asArray(applied), ...asArray(skipped).filter((s) => s && s.reason === "present").map((s) => s.itemId)].map(String));
  const out = {};
  for (const g of asArray(guard?.items)) {
    if (g && keep.has(String(g.itemId))) out[g.itemId] = { fp: String(g.fp || ""), caseId: String(caseId) };
  }
  return out;
}

// 반환: { diff(보호 정보를 푼 일반 diff), applied: [항목 id], skipped: [{ itemId, reason }] }
//  reason: "ledger"(이미 반영 기록 있음) | "present"(이미 사건에 있음) | "brief-missing" | "brief-submitted"
//          | "todo-missing" | "todo-done"(완료됐거나 서면과 이어짐) | "todo-changed"(문구가 바뀜)
export function resolveClaudeGuard(latest, diff, { skipItemIds = [] } = {}) {
  const guard = diff && diff.claude;
  if (!guard || !Array.isArray(guard.items)) return { diff, applied: [], skipped: [] };
  const { claude: _guard, ...rest } = diff;
  const arrays = {};
  for (const [field, d] of Object.entries(diff.arrays || {})) {
    arrays[field] = { upserts: asArray(d?.upserts).slice(), removed: asArray(d?.removed).slice() };
  }
  const skipSet = new Set(asArray(skipItemIds).map(String));
  const present = (field, key) => asArray(latest?.[field]).some((x) => idKey(x) === key);
  const drop = (field, key) => {
    if (arrays[field]) arrays[field].upserts = arrays[field].upserts.filter((u) => u.key !== key);
  };
  // 최신본에서 이 할 일과 이어진 서면이 있는지 (할 일 탭에서 이미 서면으로 옮긴 경우)
  const linkedBrief = (t) => asArray(latest?.briefs).some((b) => b && ((t.briefId && b.id === t.briefId) || b.fromTodoId === t.id));
  const applied = [];
  const skipped = [];
  const createdBy = new Map(); // 이번 저장에서 앞 항목이 새로 만드는 열쇠 → 항목 id
  for (const g of guard.items) {
    if (!g) continue;
    const created = asArray(g.created);
    let reason = "";
    if (skipSet.has(String(g.itemId))) reason = "ledger";
    else if (created.some((c) => present(c.field, c.key))) reason = "present";
    let briefItem = null;
    if (!reason && g.briefPatch) {
      let cur = asArray(latest?.briefs).find((b) => idKey(b) === g.briefPatch.key);
      // 같은 묶음 앞 항목(brief.pending)이 이번에 만드는 서면이면 그 서면을 제출 처리한다
      // (계획한 저장분에는 이미 제출 상태로 들어 있으므로 「이미 제출됨」으로 보지 않는다)
      const ownBrief = !cur && createdBy.has(g.briefPatch.key);
      if (ownBrief) cur = asArray(arrays.briefs?.upserts).find((u) => u.key === g.briefPatch.key)?.items?.[0];
      if (!cur) reason = "brief-missing";
      else if (cur.status === "submitted" && !ownBrief) reason = "brief-submitted";
      else {
        briefItem = {
          ...cur,
          ...(g.briefPatch.set || {}),
          ...(g.briefPatch.fillDetails && !cur.details ? { details: g.briefPatch.fillDetails } : {}),
        };
      }
    }
    let todoItem = null;
    if (!reason && g.todoPatch) {
      const cur = asArray(latest?.todos).find((t) => idKey(t) === g.todoPatch.key);
      const prev = g.todoPatch.prev;
      if (!cur) reason = "todo-missing";
      else if (cur.done || linkedBrief(cur)) reason = "todo-done";
      else if (prev && String(cur.text ?? "") !== String(prev.text ?? "")) reason = "todo-changed";
      else todoItem = { ...cur, ...(g.todoPatch.set || {}) };
    }
    if (reason) {
      created.forEach((c) => drop(c.field, c.key));
      if (g.todoPatch) drop("todos", g.todoPatch.key);
      if (g.briefPatch && !createdBy.has(g.briefPatch.key)) drop("briefs", g.briefPatch.key);
      else if (g.briefPatch && arrays.briefs) {
        // 같은 묶음 앞 항목이 만드는 서면은 남기되, 건너뛴 이 제출 처리를 얹기 전 판본(제출대기)으로 되돌린다
        const prev = g.briefPatch.prev;
        arrays.briefs.upserts = arrays.briefs.upserts.map((u) => (u.key === g.briefPatch.key && prev ? { key: u.key, items: [prev] } : u));
      }
      skipped.push({ itemId: g.itemId, reason });
      continue;
    }
    if (briefItem && arrays.briefs) {
      arrays.briefs.upserts = arrays.briefs.upserts.map((u) => (u.key === g.briefPatch.key ? { key: u.key, items: [briefItem] } : u));
      // 그 사이 서면 제목이 바뀌었으면 「제목 제출」 진행경과도 지금 제목으로 쓴다
      const tlKey = `id:${String(briefItem.submitTimelineId ?? "")}`;
      if (arrays.timeline) {
        arrays.timeline.upserts = arrays.timeline.upserts.map((u) => (u.key === tlKey && u.items.length === 1
          ? { key: u.key, items: [{ ...u.items[0], content: `${briefItem.title || "서면"} 제출` }] }
          : u));
      }
    }
    // 다른 기기에서 고친 할 일의 다른 칸(메모·마감일 등)은 지금 판본대로 두고 완료 칸만 얹는다
    if (todoItem && arrays.todos) {
      arrays.todos.upserts = arrays.todos.upserts.map((u) => (u.key === g.todoPatch.key ? { key: u.key, items: [todoItem] } : u));
    }
    applied.push(g.itemId);
    created.forEach((c) => createdBy.set(c.key, g.itemId));
  }
  // 반영됨으로 셀(반영 기록에 남길) 항목은 만든 열쇠가 모두 실제 저장분에 남아 있어야 한다
  const kept = (c) => asArray(arrays[c.field]?.upserts).some((u) => u.key === c.key);
  const confirmed = [];
  for (const itemId of applied) {
    const g = guard.items.find((x) => x && x.itemId === itemId);
    if (asArray(g?.created).every(kept)) confirmed.push(itemId);
    else skipped.push({ itemId, reason: "dropped" });
  }
  for (const field of Object.keys(arrays)) {
    if (!arrays[field].upserts.length && !arrays[field].removed.length) delete arrays[field];
  }
  return { diff: { ...rest, arrays }, applied: confirmed, skipped };
}
