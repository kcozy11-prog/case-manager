// ─────────────────────────────────────────────────────────────────────────────
//  데이터 복원 계획 (순수 로직)
//  예전 내보내기 파일(또는 그 안의 '복원용 원본')과 지금 서버 데이터를 비교해 복원 후보를 만든다.
//   (1) 지금은 없어진 항목(기일·진행경과·메모·할 일·서면, 사건 전체, 업무일지 날짜)을 다시 넣을 후보
//   (2) 그때는 완료·제출완료·종결이었는데 지금은 미완료·제출대기·진행중으로 돌아간 상태를 되돌릴 후보
//   (3) 업무일지에 '사건에 기록함'으로 남았는데 사건에서는 사라진 진행경과·의뢰인요청 메모
//  지금 있는 내용은 지우거나 고치지 않는다(추가와 상태 복원만). 적용은 App 이 맡는다.
// ─────────────────────────────────────────────────────────────────────────────
import { buildCallTimelineContent } from "./caseLink.js";

export const WORK_SUMMARY_TITLE = "캘린더 업무 요약";
const ARRAY_LABELS = { hearings: "기일", timeline: "진행경과", memos: "메모", todos: "할 일", briefs: "서면" };
export const RESTORE_FIELDS = Object.keys(ARRAY_LABELS);

const norm = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const normCaseNumber = (v) => norm(v).replace(/[\s\-–—]/g, "").toLowerCase();
const asArray = (v) => (Array.isArray(v) ? v : []);

// ── 내보내기 시트 → 비교용 사본 ─────────────────────────────────────────────
function sheetObjects(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const header = asArray(rows[0]).map(norm);
  return rows.slice(1)
    .filter((r) => Array.isArray(r) && r.some((v) => norm(v)))
    .map((r) => {
      const o = {};
      header.forEach((h, i) => { if (h) o[h] = r[i] == null ? "" : String(r[i]); });
      return o;
    });
}

const lines = (v) => String(v ?? "").split("\n").map((s) => s.trim()).filter(Boolean);

// 업무일지 한 줄(내보내기 형식) → 복원 일지. 이월되는 목록(할 일·제출 예정 서면·위임 업무)은
// 항목으로 되살리면 이미 처리한 일이 다시 이월될 수 있으므로 '기타'에 글로만 남긴다.
export function journalEntryFromExportRow(r, date, label = "") {
  const blocks = [
    ["오늘 할 일", r["오늘 할 일"]],
    ["내일 할 일", r["내일 할 일"]],
    ["제출 예정 서면", r["제출 예정 서면"]],
    ["위임 업무", r["위임 업무"]],
  ].filter(([, v]) => norm(v));
  const restoredLists = blocks.length
    ? `[${label || "내보내기"}에서 복원한 목록]\n${blocks.map(([k, v]) => `■ ${k}\n${String(v).trim()}`).join("\n")}`
    : "";
  const learnedItems = lines(r["배운 점"]).map((line, i) => {
    const m = line.match(/^\[(.+?)\]\s*(.*?)(?:\s—\s([\s\S]*))?$/);
    return { id: `learned_restored_${date}_${i}`, topic: m ? m[1] : "기타", title: m ? m[2] : line, content: m && m[3] ? m[3] : "" };
  });
  const recordedAt = `${date}T00:00:00+09:00`;
  const caseProgressItems = lines(r["사건 진행 기록"]).map((line, i) => {
    const body = line.replace(/\s✓기록$/, "");
    const m = body.match(/^(.*)\s\(([^()]*)\)$/);
    return { id: `progress_restored_${date}_${i}`, date, content: m ? m[1] : body, caseTitle: m ? m[2] : "", recordedAt };
  });
  const callLogItems = lines(r["통화 상담 기록"]).map((line, i) => {
    const body = line.replace(/\s✓기록$/, "").replace(/\s\[의뢰인요청\]$/, "");
    const m = body.match(/^(.*)\s\(([^()]*)\)$/);
    return { id: `call_restored_${date}_${i}`, date, title: m ? m[1] : body, detail: "", caseTitle: m ? m[2] : "", recordedAt };
  });
  const etc = [String(r["기타"] || "").trim(), restoredLists].filter(Boolean).join("\n\n");
  return {
    entryDate: date,
    arrivalTime: r["출근"] || "",
    leaveTime: r["퇴근"] || "",
    todayWork: r["오늘 업무"] || "",
    callNotes: r["통화·상담 메모"] || "",
    etc,
    todayTasks: "[]",
    tomorrowTasks: "[]",
    pendingDocItems: "[]",
    pendingDocs: "",
    delegatedItems: "[]",
    delegated: "",
    learnedItems: JSON.stringify(learnedItems),
    learned: learnedItems.map((i) => `[${i.topic}] ${i.title}${i.content ? ` — ${i.content}` : ""}`).join("\n"),
    caseProgressItems: JSON.stringify(caseProgressItems),
    callLogItems: JSON.stringify(callLogItems),
    writtenDocs: "",
    todayTaskCompletions: "",
    pendingDocCompletions: "",
    delegatedCompletions: "",
    submittedDocItems: "",
    eventMemos: "",
  };
}

// sheets: { 시트이름: 2차원 배열 } → { source: "export", cases: [...], journal: { 날짜: 일지 } }
export function snapshotFromExportSheets(sheets = {}, { label = "" } = {}) {
  const byTitle = new Map();
  const ensure = (title) => {
    const t = norm(title);
    if (!t) return null;
    if (!byTitle.has(t)) byTitle.set(t, { title: t, hearings: [], timeline: [], memos: [], todos: [], briefs: [], _listed: false });
    return byTitle.get(t);
  };
  const listRows = sheetObjects(sheets["사건 목록"]);
  const titleCount = new Map();
  for (const r of listRows) titleCount.set(norm(r["사건명"]), (titleCount.get(norm(r["사건명"])) || 0) + 1);
  for (const r of listRows) {
    const c = ensure(r["사건명"]);
    if (!c) continue;
    // 같은 이름의 사건이 여럿이면 시트만으로는 항목이 어느 사건 것인지 알 수 없다
    if (titleCount.get(c.title) > 1) {
      c.ambiguous = true;
      (c.listed = c.listed || []).push({ client: r["의뢰인"] || "", caseNumber: r["사건번호"] || "", status: r["상태"] || "" });
    }
    if (c._listed) continue;
    Object.assign(c, {
      type: r["분류"] || "", status: r["상태"] || "", client: r["의뢰인"] || "", clientContact: r["연락처"] || "",
      opponent: r["상대방"] || "", court: r["관할기관"] || "", caseNumber: r["사건번호"] || "",
      manager: r["담당자"] || "", managerOrg: r["소속"] || "",
      retainer: { date: r["수임일"] || "", amount: r["착수금"] || "", successFee: r["성공보수"] || "", successFeeAmount: r["성공보수금액"] || "" },
      _listed: true,
    });
  }
  for (const r of sheetObjects(sheets["기일"])) {
    const c = ensure(r["사건명"]);
    if (!c) continue;
    const h = { date: r["날짜"] || "", time: r["시간"] || "", type: r["유형"] || "", result: r["결과/장소"] || "" };
    if (norm(r["메모"])) h.memo = r["메모"];
    if (r["캘린더"] === "LBOX") h.fromCalendar = true;
    c.hearings.push(h);
  }
  for (const r of sheetObjects(sheets["메모"])) {
    const c = ensure(r["사건명"]);
    if (!c) continue;
    const m = { category: r["카테고리"] || "일반메모", title: r["제목"] || "", content: r["내용"] || "", date: r["날짜"] || "" };
    if (r["체크"] === "Y") m.checked = true;
    c.memos.push(m);
  }
  for (const r of sheetObjects(sheets["진행경과"])) {
    const c = ensure(r["사건명"]);
    if (c) c.timeline.push({ date: r["날짜"] || "", content: r["내용"] || "" });
  }
  for (const r of sheetObjects(sheets["할 일"])) {
    const c = ensure(r["사건명"]);
    if (c) c.todos.push({ text: r["할일"] || "", done: r["완료"] === "Y", priority: r["우선순위"] || "보통", dueDate: r["기한"] || "" });
  }
  for (const r of sheetObjects(sheets["서면"])) {
    const c = ensure(r["사건명"]);
    if (c) c.briefs.push({ title: r["서면"] || "", status: r["상태"] === "제출완료" ? "submitted" : "pending", preparedDate: r["작성일"] || "", submittedDate: r["제출일"] || "" });
  }
  const journal = {};
  for (const r of sheetObjects(sheets["업무일지"])) {
    const date = norm(r["날짜"]);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && !journal[date]) journal[date] = journalEntryFromExportRow(r, date, label);
  }
  return {
    source: "export",
    cases: [...byTitle.values()].map(({ _listed, ...c }) => c),
    journal,
  };
}

// ── 사건 맞추기 ──────────────────────────────────────────────────────────────
function caseKeys(c) {
  const keys = [];
  const title = norm(c?.title);
  if (title) keys.push(["title", `t:${title}`]);
  const num = normCaseNumber(c?.caseNumber);
  if (num && num !== "—" && num.length >= 4) keys.push(["caseNumber", `n:${num}`]);
  const client = norm(c?.client);
  const opponent = norm(c?.opponent);
  if (client && opponent) keys.push(["parties", `p:${client}|${opponent}`]);
  return keys;
}

function indexCases(cases) {
  const index = new Map();
  for (const c of cases) {
    for (const [, key] of caseKeys(c)) {
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(c);
    }
  }
  return index;
}

function findTargetCase(snapCase, currentById, index) {
  if (snapCase.id && currentById.has(snapCase.id)) return { target: currentById.get(snapCase.id), matchedBy: "id" };
  for (const [kind, key] of caseKeys(snapCase)) {
    const hits = index.get(key) || [];
    if (hits.length === 1) return { target: hits[0], matchedBy: kind };
  }
  return { target: null, matchedBy: null };
}

// ── 항목 맞추기 (있으면 '있음', 없으면 복원 후보) ────────────────────────────
const contentKey = {
  hearings: (h) => `${norm(h.date)}|${norm(h.type)}`,
  timeline: (t) => `${norm(t.date)}|${norm(t.content)}`,
  memos: (m) => `${norm(m.title)}|${norm(m.content)}`,
  todos: (t) => norm(t.text),
  briefs: (b) => norm(b.title),
};
// 날짜를 고친 진행경과도 같은 기록으로 보도록 두 번째 기준(내용만)을 둔다
const looseKey = {
  timeline: (t) => (norm(t.content).length >= 6 ? norm(t.content) : null),
};

const itemText = (field, it) => {
  if (field === "hearings") return [norm(it.type), norm(it.time), norm(it.result)].filter(Boolean).join(" · ");
  if (field === "timeline") return norm(it.content);
  if (field === "memos") return [norm(it.title), norm(it.content)].filter(Boolean).join(" — ");
  if (field === "todos") return norm(it.text);
  return norm(it.title);
};
const itemDate = (field, it) => norm(field === "todos" ? it.dueDate : field === "briefs" ? (it.submittedDate || it.preparedDate) : it.date);
const isEmptyItem = (field, it) => !itemText(field, it);

// 사본의 각 항목을 지금 항목과 1:1로 짝짓는다. 반환: [{ snap, current|null }]
function pairItems(field, snapItems, currentItems) {
  const pool = asArray(currentItems).map((it) => ({ it, used: false }));
  const byId = new Map();
  pool.forEach((p) => { if (p.it && p.it.id !== undefined && p.it.id !== null) byId.set(String(p.it.id), p); });
  const take = (pred) => {
    const p = pool.find((x) => !x.used && pred(x.it));
    if (p) p.used = true;
    return p ? p.it : null;
  };
  const pairs = asArray(snapItems).map((snap) => ({ snap, current: null }));
  // 1차: id
  for (const pr of pairs) {
    const id = pr.snap && pr.snap.id !== undefined && pr.snap.id !== null ? String(pr.snap.id) : null;
    const p = id ? byId.get(id) : null;
    if (p && !p.used) { p.used = true; pr.current = p.it; }
  }
  // 2차: 내용(정확)
  for (const pr of pairs) {
    if (pr.current) continue;
    const key = contentKey[field](pr.snap);
    pr.current = take((it) => contentKey[field](it) === key);
  }
  // 3차: 내용(느슨)
  if (looseKey[field]) {
    for (const pr of pairs) {
      if (pr.current) continue;
      const key = looseKey[field](pr.snap);
      if (key) pr.current = take((it) => looseKey[field](it) === key);
    }
  }
  return pairs;
}

const isWorkSummary = (m) => norm(m?.title) === WORK_SUMMARY_TITLE;

function addCandidate(caseId, field, snapItem, current, { defaultOn, seq }) {
  const sameDate = asArray(current?.[field]).some((it) => itemDate(field, it) && itemDate(field, it) === itemDate(field, snapItem));
  return {
    id: `${caseId}:add:${field}:${seq}`,
    kind: "add",
    field,
    label: ARRAY_LABELS[field],
    date: itemDate(field, snapItem),
    text: itemText(field, snapItem),
    item: snapItem,
    sameDateHint: field === "timeline" && sameDate,
    defaultOn,
  };
}

// ── 업무일지 기록 ↔ 사건 대조 ─────────────────────────────────────────────────
// 업무일지에서 '사건에 기록'한 진행경과·통화 기록(timelineId)과 의뢰인요청 메모(memoId)가
// 사건 문서에서 사라졌으면, 일지에 남은 내용으로 같은 id 그대로 되살린다.
export function buildJournalCrossCheck(journal = {}, cases = []) {
  const byId = new Map(asArray(cases).filter(Boolean).map((c) => [c.id, c]));
  const out = new Map(); // caseId → Map(key → candidate)
  const push = (caseId, field, item, sourceDate) => {
    const c = byId.get(caseId);
    if (!c) return;
    if (asArray(c[field]).some((x) => x && String(x.id) === String(item.id))) return;
    if (!out.has(caseId)) out.set(caseId, new Map());
    const key = `${field}:${item.id}`;
    if (out.get(caseId).has(key)) return;
    out.get(caseId).set(key, {
      id: `${caseId}:journal:${key}`,
      kind: "add",
      field,
      label: `${ARRAY_LABELS[field]}(업무일지 기록)`,
      date: norm(item.date),
      text: itemText(field, item),
      item,
      keepId: true,
      sourceDate,
      defaultOn: true,
    });
  };
  const parse = (raw) => {
    if (Array.isArray(raw)) return raw;
    try { const v = JSON.parse(raw || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
  };
  for (const date of Object.keys(journal || {}).sort()) {
    const e = journal[date] || {};
    for (const it of parse(e.caseProgressItems)) {
      if (!it || !it.caseId || !it.timelineId || !it.recordedAt || !norm(it.content)) continue;
      const item = { id: it.timelineId, date: it.date || date, content: it.content };
      if (it.detail) item.detail = it.detail;
      item.activityType = it.activityType || "other";
      push(it.caseId, "timeline", item, date);
    }
    for (const it of parse(e.callLogItems)) {
      if (!it || !it.caseId || !it.recordedAt || !(it.title || it.detail)) continue;
      if (it.timelineId) {
        push(it.caseId, "timeline", { id: it.timelineId, date: it.date || date, content: buildCallTimelineContent({ title: it.title, detail: it.detail }), activityType: "call" }, date);
      }
      if (it.asClientRequest && it.memoId) {
        push(it.caseId, "memos", { id: it.memoId, category: "의뢰인요청", title: it.title || "통화/상담", content: it.detail || "", date: it.date || date }, date);
      }
    }
  }
  const result = new Map();
  for (const [caseId, m] of out) result.set(caseId, [...m.values()]);
  return result;
}

// ── 복원 계획 ───────────────────────────────────────────────────────────────
// snapshot: { source, cases, journal }, current: { cases, journal }
// 반환: { cases: [{ key, title, targetId, matchedBy, create?, items: [...] }], journal: [...], stats }
export function buildRestorePlan(snapshot = {}, current = {}, { ignoreTitles = [], includeCrossCheck = true } = {}) {
  const currentCases = asArray(current.cases).filter(Boolean);
  const currentById = new Map(currentCases.map((c) => [c.id, c]));
  const index = indexCases(currentCases);
  const ignore = new Set(asArray(ignoreTitles).map(norm));
  const crossCheck = includeCrossCheck ? buildJournalCrossCheck(current.journal || {}, currentCases) : new Map();
  const planByCase = new Map();
  const planFor = (target, snapCase, matchedBy) => {
    const key = target ? target.id : `new:${norm(snapCase.title)}`;
    if (!planByCase.has(key)) {
      planByCase.set(key, { key, title: target ? target.title : norm(snapCase.title), targetId: target ? target.id : null, matchedBy, create: null, items: [] });
    }
    return planByCase.get(key);
  };

  // 같은 이름의 사건이 여럿인 묶음: 그 이름의 지금 사건들을 합쳐 비교한다.
  //  - 상태 되돌림은 어느 사건 항목인지 알 수 있으므로 그 사건에 바로 붙인다.
  //  - 없어진 항목은 어느 사건 것인지 알 수 없으므로, 사용자가 대상 사건을 고르게 하고 기본 선택하지 않는다.
  function addAmbiguousGroup(snapCase) {
    const title = norm(snapCase.title);
    const targets = currentCases.filter((c) => norm(c.title) === title);
    if (!targets.length) return;
    const groupKey = `amb:${title}`;
    for (const field of RESTORE_FIELDS) {
      const snapItems = asArray(snapCase[field]).filter((it) => it && !isEmptyItem(field, it) && !(field === "memos" && isWorkSummary(it)));
      const pool = targets.flatMap((t) => asArray((virtual.get(t.id) || t)[field]).map((it) => ({ ...it, __caseId: t.id })));
      for (const { snap, current: cur } of pairItems(field, snapItems, pool)) {
        if (!cur) {
          if (!planByCase.has(groupKey)) {
            planByCase.set(groupKey, {
              key: groupKey,
              title: `${title} (같은 이름 ${targets.length}건)`,
              targetId: null,
              matchedBy: "title",
              create: null,
              targetChoices: targets.map((t) => ({ id: t.id, label: [norm(t.client), norm(t.caseNumber), norm(t.status)].filter(Boolean).join(" · ") || t.id })),
              items: [],
            });
          }
          const group = planByCase.get(groupKey);
          group.items.push({ ...addCandidate(groupKey, field, snap, null, { defaultOn: false, seq: group.items.length }), needsTarget: true });
          continue;
        }
        const owner = currentById.get(cur.__caseId);
        const ownerPlan = planFor(owner, owner, "title");
        statusCandidates(ownerPlan, owner, field, snap, cur);
      }
    }
  }

  function statusCandidates(plan, target, field, snap, cur) {
    if (field === "todos" && snap.done && !cur.done && cur.id !== undefined) {
      plan.items.push({
        id: `${target.id}:status:todos:${cur.id}`,
        kind: "status",
        field: "todos",
        targetItemId: cur.id,
        label: "할 일 완료 상태",
        date: norm(cur.dueDate),
        text: `${itemText("todos", cur)} — 그때 완료 → 지금 미완료`,
        patch: { done: true },
        prev: { done: !!cur.done },
        defaultOn: true,
      });
    }
    if (field === "briefs" && snap.status === "submitted" && cur.status !== "submitted" && cur.id !== undefined) {
      plan.items.push({
        id: `${target.id}:status:briefs:${cur.id}`,
        kind: "status",
        field: "briefs",
        targetItemId: cur.id,
        label: "서면 제출 상태",
        date: norm(snap.submittedDate),
        text: `${itemText("briefs", cur)} — 그때 제출완료 → 지금 제출대기`,
        patch: { status: "submitted", submittedDate: snap.submittedDate || cur.submittedDate || "" },
        prev: { status: cur.status || "pending", submittedDate: cur.submittedDate || "" },
        defaultOn: true,
      });
    }
  }

  // 업무일지 대조 후보를 먼저 넣고, 내보내기 비교에서는 그것도 '있는 것'으로 본다(중복 방지)
  const virtual = new Map(currentCases.map((c) => [c.id, { ...c }]));
  for (const [caseId, cands] of crossCheck) {
    const target = currentById.get(caseId);
    const plan = planFor(target, target, "journal");
    for (const cand of cands) {
      plan.items.push(cand);
      const v = virtual.get(caseId);
      v[cand.field] = [...asArray(v[cand.field]), cand.item];
    }
  }

  for (const snapCase of asArray(snapshot.cases)) {
    if (!snapCase || ignore.has(norm(snapCase.title))) continue;
    if (snapCase.ambiguous && !snapCase.id) {
      addAmbiguousGroup(snapCase);
      continue;
    }
    const { target, matchedBy } = findTargetCase(snapCase, currentById, index);
    if (!target) {
      const plan = planFor(null, snapCase, null);
      const counts = RESTORE_FIELDS.map((f) => [f, asArray(snapCase[f]).filter((it) => !(f === "memos" && isWorkSummary(it))).length]).filter(([, n]) => n);
      plan.create = snapCase;
      plan.items.push({
        id: `new:${norm(snapCase.title)}:case`,
        kind: "createCase",
        field: "case",
        label: "사건 전체",
        date: "",
        text: `${norm(snapCase.title)}${counts.length ? ` (${counts.map(([f, n]) => `${ARRAY_LABELS[f]} ${n}`).join(", ")})` : ""}`,
        defaultOn: false, // 사건 문서는 덮어쓰기로 사라지지 않으므로, 없는 사건은 대개 직접 지운 것이다
      });
      continue;
    }
    const plan = planFor(target, snapCase, matchedBy);
    const base = virtual.get(target.id) || target;

    if (norm(snapCase.status) === "종결" && norm(target.status) && norm(target.status) !== "종결") {
      plan.items.push({
        id: `${target.id}:info:status`,
        kind: "info",
        field: "status",
        label: "사건 상태",
        date: "",
        text: `그때 '종결' → 지금 '${norm(target.status)}'`,
        to: "종결",
        from: target.status,
        defaultOn: true,
      });
    }

    for (const field of RESTORE_FIELDS) {
      const snapItems = asArray(snapCase[field]).filter((it) => it && !isEmptyItem(field, it) && !(field === "memos" && isWorkSummary(it)));
      for (const { snap, current: cur } of pairItems(field, snapItems, base[field])) {
        if (!cur) {
          const defaultOn = field === "briefs" ? snap.status === "submitted" : true;
          plan.items.push(addCandidate(target.id, field, snap, base, { defaultOn, seq: plan.items.length }));
          continue;
        }
        statusCandidates(plan, target, field, snap, cur);
      }
    }
  }

  const journal = [];
  for (const [date, entry] of Object.entries(snapshot.journal || {}).sort((a, b) => a[0].localeCompare(b[0]))) {
    if (current.journal && current.journal[date]) continue;
    journal.push({ id: `journal:${date}`, kind: "journalEntry", date, entry, label: "업무일지", text: norm(entry.todayWork).slice(0, 80) || "(내용 일부)", defaultOn: true });
  }

  const cases = [...planByCase.values()]
    .filter((p) => p.items.length)
    .sort((a, b) => (a.targetId ? 0 : 1) - (b.targetId ? 0 : 1) || a.title.localeCompare(b.title, "ko"));
  const allItems = cases.flatMap((p) => p.items);
  const stats = {
    cases: cases.length,
    add: allItems.filter((i) => i.kind === "add").length,
    status: allItems.filter((i) => i.kind === "status" || i.kind === "info").length,
    createCase: allItems.filter((i) => i.kind === "createCase").length,
    journal: journal.length,
  };
  return { cases, journal, stats };
}

// ── 선택한 후보 → 사건별 변경 ─────────────────────────────────────────────────
// 반환: [{ caseId, base, next, created, log }] — next 는 base 에 선택한 복원만 더한 사건
// targetFor: { 묶음 key: 사건 id } — 같은 이름 사건 묶음의 항목을 넣을 사건(사용자가 고름)
export function applyPlanSelection(plan, selectedIds, currentCases = [], { makeId, now = new Date().toISOString(), label = "", emptyCase, targetFor = {} }) {
  const selected = new Set(selectedIds);
  const byId = new Map(asArray(currentCases).filter(Boolean).map((c) => [c.id, c]));
  const changes = [];
  const restoredMark = { restoredAt: now, ...(label ? { restoredFrom: label } : {}) };

  const freshItem = (field, it, keepId, usedIds) => {
    const clean = { ...it };
    let id = keepId && it.id !== undefined && it.id !== null ? it.id : null;
    if (id === null || usedIds.has(String(id))) {
      do { id = makeId(); } while (usedIds.has(String(id)));
    }
    usedIds.add(String(id));
    return { ...clean, id, ...restoredMark };
  };

  // 같은 사건에 여러 묶음의 변경이 모이도록 사건별로 누적한다
  const byCase = new Map();
  const changeFor = (base) => {
    if (!byCase.has(base.id)) {
      const entry = {
        caseId: base.id,
        base,
        next: { ...base },
        created: false,
        usedIds: new Set(RESTORE_FIELDS.flatMap((f) => asArray(base[f]).map((it) => String(it?.id)))),
        log: { caseId: base.id, created: false, added: {}, status: [], info: {} },
      };
      byCase.set(base.id, entry);
      changes.push(entry);
    }
    return byCase.get(base.id);
  };

  for (const p of plan.cases || []) {
    const chosen = p.items.filter((i) => selected.has(i.id));
    if (!chosen.length) continue;

    if (!p.targetId && p.targetChoices) {
      const base = byId.get(targetFor[p.key]);
      if (!base) continue; // 대상 사건을 고르지 않은 묶음은 건너뛴다
      const entry = changeFor(base);
      for (const cand of chosen) {
        if (cand.kind !== "add") continue;
        const item = freshItem(cand.field, cand.item, false, entry.usedIds);
        entry.next[cand.field] = [...asArray(entry.next[cand.field]), item];
        (entry.log.added[cand.field] = entry.log.added[cand.field] || []).push(item.id);
      }
      continue;
    }

    if (!p.targetId) {
      if (!chosen.some((i) => i.kind === "createCase") || !p.create) continue;
      const snap = p.create;
      const usedIds = new Set();
      const fresh = emptyCase();
      const created = {
        ...fresh,
        ...Object.fromEntries(["title", "type", "status", "client", "clientContact", "opponent", "court", "caseNumber", "manager", "managerOrg"]
          .filter((k) => snap[k] !== undefined && snap[k] !== "").map((k) => [k, snap[k]])),
        retainer: { ...fresh.retainer, ...(snap.retainer || {}) },
        ...restoredMark,
      };
      if (snap.id && !byId.has(snap.id)) created.id = snap.id;
      const added = {};
      for (const field of RESTORE_FIELDS) {
        const items = asArray(snap[field]).filter((it) => it && !isEmptyItem(field, it) && !(field === "memos" && isWorkSummary(it)));
        created[field] = items.map((it) => freshItem(field, it, !!snap.id, usedIds));
        if (created[field].length) added[field] = created[field].map((it) => it.id);
      }
      changes.push({ caseId: created.id, base: null, next: created, created: true, log: { caseId: created.id, created: true, added, status: [], info: {} } });
      continue;
    }

    const base = byId.get(p.targetId);
    if (!base) continue;
    const entry = changeFor(base);
    for (const cand of chosen) {
      if (cand.kind === "add") {
        const item = freshItem(cand.field, cand.item, !!cand.keepId || (cand.item && cand.item.id !== undefined), entry.usedIds);
        entry.next[cand.field] = [...asArray(entry.next[cand.field]), item];
        (entry.log.added[cand.field] = entry.log.added[cand.field] || []).push(item.id);
      } else if (cand.kind === "status") {
        entry.next[cand.field] = asArray(entry.next[cand.field]).map((it) => (it && it.id === cand.targetItemId ? { ...it, ...cand.patch } : it));
        entry.log.status.push({ field: cand.field, id: cand.targetItemId, prev: cand.prev, next: cand.patch });
      } else if (cand.kind === "info") {
        entry.log.info[cand.field] = { prev: base[cand.field] ?? "", next: cand.to };
        entry.next[cand.field] = cand.to;
      }
    }
  }
  changes.forEach((c) => { delete c.usedIds; });

  const journal = (plan.journal || []).filter((j) => selected.has(j.id)).map((j) => ({
    date: j.date,
    entry: { ...j.entry, entryDate: j.date, _restoredAt: now, ...(label ? { _restoredFrom: label } : {}) },
  }));
  return { changes, journal };
}

// ── 복원 되돌리기 ───────────────────────────────────────────────────────────
// 기록(log)대로 '복원으로 더한 항목'을 빼고, 복원으로 바꾼 상태는 지금도 그 값일 때만 되돌린다.
export function revertRestoreForCase(current, log) {
  if (!current || !log) return current;
  const next = { ...current };
  for (const [field, ids] of Object.entries(log.added || {})) {
    const drop = new Set(asArray(ids).map(String));
    next[field] = asArray(next[field]).filter((it) => !(it && drop.has(String(it.id))));
  }
  for (const s of asArray(log.status)) {
    next[s.field] = asArray(next[s.field]).map((it) => {
      if (!it || it.id !== s.id) return it;
      const stillRestored = Object.entries(s.next || {}).every(([k, v]) => (it[k] ?? "") === (v ?? ""));
      return stillRestored ? { ...it, ...(s.prev || {}) } : it;
    });
  }
  for (const [field, { prev, next: restored }] of Object.entries(log.info || {})) {
    if ((next[field] ?? "") === (restored ?? "")) next[field] = prev;
  }
  return next;
}
