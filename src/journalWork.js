// ─────────────────────────────────────────────────────────────────────────────
//  업무일지 「오늘 한 일」 (순수 함수)
//  예전의 오늘 업무(자유 입력)·사건 진행 기록·통화 상담 메모·기타를 한 목록(workItems)으로 합친다.
//  항목: { id, kind, content, detail, caseId, caseTitle, date, activityType?, asClientRequest, recordedAt?, timelineId?, memoId? }
//   - kind: progress(진행) | call(통화) | meeting(회의) | etc(기타)
//   - 사건을 고른 항목만 「사건에 기록」 → 진행경과(+ 의뢰인요청 체크 시 의뢰인요청 메모)
//  예전 칸의 기록 방식(JournalApp handleRecordProgress·handleRecordCall)과 같은 모양으로 사건에 쓴다.
// ─────────────────────────────────────────────────────────────────────────────
import { buildCallTimelineContent } from "./caseLink.js";
import { DEFAULT_TIMELINE_ACTIVITY_TYPE, getTimelineActivity } from "./timelineActivity.js";

export const WORK_KINDS = [
  { value: "progress", label: "진행" },
  { value: "call", label: "통화" },
  { value: "meeting", label: "회의" },
  { value: "etc", label: "기타" },
];
export const DEFAULT_WORK_KIND = "progress";

export function workKindLabel(kind) {
  return WORK_KINDS.find((k) => k.value === kind)?.label || "진행";
}

export function hasWorkBody(item) {
  return !!(item && (String(item.content || "").trim() || String(item.detail || "").trim()));
}

// 진행경과 유형: 통화·회의는 정해져 있고, 진행은 고른 유형(없으면 기본), 기타는 기타
export function workActivityType(item) {
  switch (item?.kind) {
    case "call": return "call";
    case "meeting": return "meeting";
    case "etc": return "other";
    default: return getTimelineActivity(item?.activityType) ? item.activityType : DEFAULT_TIMELINE_ACTIVITY_TYPE;
  }
}

// 사건 진행경과에 쓸 항목 (id 는 부르는 쪽이 정한다)
export function workTimelineEntry(item, fallbackDate = "") {
  const date = item?.date || fallbackDate;
  const content = String(item?.content || "").trim();
  const detail = String(item?.detail || "").trim();
  if (item?.kind === "call") {
    // 통화는 예전 통화 상담 기록과 같이 「[통화/상담] 제목 — 상세」 한 줄로 쓴다
    return { date, content: buildCallTimelineContent({ title: content, detail }), activityType: "call" };
  }
  // 상세는 늘 넣는다(다시 기록할 때 지운 상세가 사건에 남지 않게)
  return { date, content: content || detail, detail: content ? detail : "", activityType: workActivityType(item) };
}

// 의뢰인요청 메모 (체크한 항목만)
export function workClientRequestMemo(item, fallbackDate = "") {
  if (!item?.asClientRequest) return null;
  const kindTitle = item.kind === "call" ? "통화/상담" : workKindLabel(item.kind);
  return {
    category: "의뢰인요청",
    title: String(item.content || "").trim() || kindTitle,
    content: String(item.detail || "").trim(),
    date: item.date || fallbackDate,
  };
}

// 예전 칸 항목 → 오늘 한 일 모양(보기용). 저장된 예전 칸은 바꾸지 않는다.
export function legacyProgressAsWork(it) {
  return { ...it, kind: "progress", content: it?.content || "", detail: it?.detail || "" };
}
export function legacyCallAsWork(it) {
  return { ...it, kind: "call", content: it?.title || "", detail: it?.detail || "" };
}

// 사건 화면에 미기록으로 남은 항목 수(사건을 골랐는데 아직 기록하지 않은 것)
export function countUnrecordedWork(items = []) {
  return (Array.isArray(items) ? items : []).filter((it) => it && it.caseId && hasWorkBody(it) && !it.recordedAt).length;
}

// 내보내기 한 줄: [종류] 내용 — 상세 (사건) [의뢰인요청] ✓기록
export function workItemExportLine(it) {
  const content = String(it?.content || "").trim();
  const detail = String(it?.detail || "").trim();
  const body = content && detail ? `${content} — ${detail}` : (content || detail);
  const cse = it?.caseTitle ? ` (${it.caseTitle})` : "";
  const req = it?.asClientRequest ? " [의뢰인요청]" : "";
  const rec = it?.recordedAt ? " ✓기록" : "";
  return `[${workKindLabel(it?.kind)}] ${body}${cse}${req}${rec}`;
}

// 내보내기 한 줄 → 항목(복원용). 「✓기록」 표시가 있던 항목만 기록됨(recordedAt)으로 둔다.
export function workItemFromExportLine(line, date, index) {
  let body = String(line || "").trim();
  const recorded = /\s✓기록$/.test(body);
  body = body.replace(/\s✓기록$/, "");
  const asClientRequest = /\s\[의뢰인요청\]$/.test(body);
  body = body.replace(/\s\[의뢰인요청\]$/, "");
  const kindM = body.match(/^\[(진행|통화|회의|기타)\]\s*/);
  const kind = kindM ? WORK_KINDS.find((k) => k.label === kindM[1]).value : DEFAULT_WORK_KIND;
  if (kindM) body = body.slice(kindM[0].length);
  const caseM = body.match(/^(.*)\s\(([^()]*)\)$/);
  const text = caseM ? caseM[1] : body;
  const [content, ...rest] = text.split(" — ");
  return {
    id: `work_restored_${date}_${index}`, kind, date,
    content: content || "", detail: rest.join(" — "),
    caseTitle: caseM ? caseM[2] : "", caseId: "",
    asClientRequest,
    ...(recorded ? { recordedAt: `${date}T00:00:00+09:00` } : {}),
  };
}
