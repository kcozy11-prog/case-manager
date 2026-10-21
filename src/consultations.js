// ─────────────────────────────────────────────────────────────────────────────
//  수임 전 상담 일정 (순수 함수)
//  LBOX 캘린더의 「○○ 상담」처럼 사건번호가 없는 상담 일정은 사건에 붙일 수 없어 동기화 때마다
//  「수동 확인 필요한 LBOX 일정」 창에 떴다. 이런 일정은 사건 없이 「상담 일정」으로 따로 둔다.
//   - 저장 위치: users/{uid}/meta/consultations 의 items[일정 id] (업무일지 문서에는 넣지 않는다.
//     앞날짜 일지 문서가 생기면 이월 기준(직전 일지)이 흐트러지기 때문)
//   - 동기화는 일정 칸(제목·날짜·시각·장소)만 고치고, 상담 메모·연결 사건은 건드리지 않는다.
//   - 업무일지 그 날짜의 「오늘 일정·상담」 칸에서 메모를 적고, 수임하면 「사건 만들기」로 사건을 만든다.
// ─────────────────────────────────────────────────────────────────────────────

// 사건번호 없는 LBOX 일정 중 제목에 이 말이 있으면 상담 일정으로 본다.
// 2026. 10. 21. 변호사 확정: 「상담」·「미팅」 두 낱말(「식사」 등은 넣지 않음).
export const CONSULT_KEYWORDS = ["상담", "미팅"];

const SCHEDULE_FIELDS = ["summary", "date", "time", "location", "start"];

export function isConsultSummary(summary, keywords = CONSULT_KEYWORDS) {
  const s = String(summary || "");
  return keywords.some((k) => k && s.includes(k));
}

function eventDateTime(ev) {
  const date = ev?.start?.date || (ev?.start?.dateTime ? String(ev.start.dateTime).split("T")[0] : "") || "";
  const time = ev?.start?.dateTime
    ? new Date(ev.start.dateTime).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" })
    : "";
  return { date, time };
}

// 캘린더 일정 → 상담 일정 기록의 일정 칸. id 없는 일정은 다시 찾을 수 없으므로 만들지 않는다(null).
export function consultFromEvent(ev) {
  if (!ev || !ev.id) return null;
  const { date, time } = eventDateTime(ev);
  const start = ev.start?.dateTime ? { dateTime: ev.start.dateTime } : ev.start?.date ? { date: ev.start.date } : {};
  return {
    id: String(ev.id),
    summary: String(ev.summary || "").trim(),
    date,
    time,
    location: String(ev.location || "").trim(),
    start,
  };
}

const sameValue = (a, b) => JSON.stringify(a ?? "") === JSON.stringify(b ?? "");

// 동기화 결과를 저장된 상담 일정에 얹을 patch 를 만든다 (setDoc merge 용, 바뀐 것만).
//  - 새 일정: 일정 칸 + source + createdAt
//  - 있던 일정: 일정 칸 중 바뀐 것만(메모·연결 사건은 넣지 않아 서버 값이 그대로 남는다)
// existing: { [id]: 기록 } · incoming: consultFromEvent 결과 목록 · source: "auto" | "manual"
export function consultPatch(existing = {}, incoming = [], { now = new Date().toISOString(), source = "auto" } = {}) {
  const items = {};
  for (const rec of incoming || []) {
    if (!rec || !rec.id) continue;
    const prev = existing?.[rec.id];
    if (!prev) {
      items[rec.id] = { ...rec, source, createdAt: now, updatedAt: now };
      continue;
    }
    const changed = {};
    for (const f of SCHEDULE_FIELDS) if (!sameValue(prev[f], rec[f])) changed[f] = rec[f];
    if (source === "manual" && prev.source !== "manual") changed.source = "manual";
    if (Object.keys(changed).length) items[rec.id] = { ...changed, updatedAt: now };
  }
  return items;
}

// 그 날짜의 상담 일정(시각 순, 시각 없는 것은 뒤)
export function consultsForDate(items = {}, dateKey) {
  return Object.values(items || {})
    .filter((c) => c && c.id && c.date === dateKey && !c.dismissed)
    .sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99") || String(a.summary).localeCompare(String(b.summary), "ko"));
}

// 「사건 만들기」 제목 후보: 상담 낱말과 괄호를 걷어 낸다("홍길동 상담" → "홍길동", "홍길동 미팅" → "홍길동")
export function caseTitleFromConsult(summary, keywords = CONSULT_KEYWORDS) {
  let t = String(summary || "");
  for (const k of keywords) if (k) t = t.split(k).join(" ");
  t = t.replace(/[[\]()]/g, " ").replace(/\s+/g, " ").trim();
  return t || String(summary || "").trim();
}

// 상담 일정에서 새 사건(저장 전 초안)을 만든다.
//  - 상담 메모는 진행경과(회의, 상담일)로 옮긴다.
//  - 상담일이 오늘 뒤면 그 일정을 기일로 넣는다(mergeEvent: calendarSync.mergeCalendarEventIntoCase —
//    LBOX 동기화와 같은 방식으로 일정에 연결되어, 다음 동기화 때 같은 일정이 다시 상담으로 잡히지 않는다).
export function buildCaseFromConsult(consult, { baseCase, today, makeId = () => Date.now(), mergeEvent = null } = {}) {
  const c = consult || {};
  let next = {
    ...baseCase,
    title: caseTitleFromConsult(c.summary),
    hearings: [...(baseCase?.hearings || [])],
    timeline: [...(baseCase?.timeline || [])],
    memos: [...(baseCase?.memos || [])],
  };
  const memo = String(c.memo || "").trim();
  next.timeline.push({
    id: makeId(),
    date: c.date || today,
    content: `상담${c.time ? ` ${c.time}` : ""}: ${String(c.summary || "").trim()}`.trim(),
    ...(memo ? { detail: memo } : {}),
    activityType: "meeting",
  });
  if (mergeEvent && c.date && today && c.date > today && c.id) {
    const ev = { id: c.id, summary: c.summary || "", start: c.start && (c.start.date || c.start.dateTime) ? c.start : { date: c.date }, ...(c.location ? { location: c.location } : {}) };
    next = mergeEvent(next, ev, { today }).caseObj;
  }
  return next;
}
