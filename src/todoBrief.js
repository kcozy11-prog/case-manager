// ─────────────────────────────────────────────────────────────────────────────
//  사건 할 일 → 제출대기 서면 이동 (순수 헬퍼)
//  "○○ 준비서면 작성" 같은 서면 작성 할 일을 완료하면, 할 일에서 지우고 서면 탭에
//  다시 입력하는 대신 그 사건의 제출대기 서면(briefs)으로 곧바로 옮긴다.
//  - 할 일은 완료 처리(markTodoDone: 완료일·진행경과 기록)되고 briefId 로 서면과 연결된다.
//  - 서면은 status 'pending' 으로 생성되며 fromTodoId 로 출처 할 일을 가리킨다.
//  - 같은 할 일을 다시 옮겨도 서면이 중복 생성되지 않는다.
//  - Claude 반영 검토함(claudeInbox.js)도 같은 판정으로 할 일의 이동 여부를 미리 보여 주고,
//    서면 제출 기록을 미완료 서면 작성 할 일과 잇는다.
// ─────────────────────────────────────────────────────────────────────────────
import { markTodoDone, upsertBrief } from "./caseLink.js";

// 서면 이름: 확인된 낱말만 인정한다(2026. 10. 21. 변경).
// 예전에는 「서」·「장」으로 끝나는 말을 모두 서면 이름으로 보아 "원본 저장", "법원에서" 같은 말도 걸렸다.
//  - 「서면」이 들어간 말(준비서면, 참고서면, 반박서면 …), 「내용증명」
//  - 아래 이름으로 끝나는 한글 낱말: "증인 신청서", "항소이유서", "사실확인서", "고소장"
//  - 「소장」은 낱말 전체가 소장일 때만(고소장·반소장·항소장은 목록에 있음. "연구소장" 등은 제외)
//  예전처럼 이름 뒤에 조사가 붙은 말("답변서를")은 서면 이름으로 보지 않는다.
export const BRIEF_DOC_SUFFIXES = [
  // ○○서
  "의견서", "신청서", "답변서", "진술서", "탄원서", "보정서", "이유서", "소명서", "확인서", "각서", "합의서",
  "계약서", "설명서", "요지서", "반박서", "신고서", "통지서", "통고서", "최고서", "촉구서", "요청서", "회신서",
  "명세서", "내역서", "보고서", "청구서", "정정서", "해명서", "경위서", "사유서", "서약서", "확약서", "동의서",
  "승낙서", "제안서", "의향서", "공탁서",
  // ○○장
  "고소장", "고발장", "반소장", "항소장", "상고장", "항고장", "위임장", "신청장", "독촉장", "최고장",
];
const BRIEF_DOC_EXACT = ["소장"];
const BRIEF_DOC_CONTAINS = ["서면", "내용증명"];
// 작성 계열 동사가 함께 있어야 '서면 작성' 할 일로 본다 (수령·검토·송달만 있는 항목 제외)
const DRAFT_VERB_RE = /작성|초안|기안|수정|보완/;

// 문구에 서면 이름이 있는지. 한글 낱말(한글이 이어진 덩어리)마다 본다.
export function hasBriefDocName(text = "") {
  const clean = String(text || "");
  if (BRIEF_DOC_CONTAINS.some((w) => clean.includes(w))) return true;
  const words = clean.match(/[가-힣]+/g) || [];
  return words.some((w) => BRIEF_DOC_EXACT.includes(w) || BRIEF_DOC_SUFFIXES.some((s) => w.endsWith(s)));
}

export function isBriefDraftingTodo(text = "") {
  const clean = String(text || "").trim();
  if (!clean) return false;
  return hasBriefDocName(clean) && DRAFT_VERB_RE.test(clean);
}

// 서면 이름은 있으나 작성 계열 동사가 없어 서면 작성 할 일로 인식되지 않는 문구 ("준비서면(3)", "답변서 제출")
export function isUnrecognizedBriefTodo(text = "") {
  const clean = String(text || "").trim();
  return !!clean && hasBriefDocName(clean) && !DRAFT_VERB_RE.test(clean);
}

// "피고 답변서 반박 준비서면 작성" → "피고 답변서 반박 준비서면"
export function briefTitleFromTodoText(text = "") {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const stripped = clean
    .replace(/\s*(초안\s*)?(작성|기안|수정|보완)(\s*(하기|할\s*것|완료|중|필요))?\s*[.。!]?\s*$/u, "")
    .replace(/[\s,·\-–—:]+$/u, "")
    .trim();
  return stripped || clean;
}

function findLinkedBrief(caseObj, todo) {
  const briefs = Array.isArray(caseObj?.briefs) ? caseObj.briefs : [];
  return briefs.find((b) => b && ((todo.briefId && b.id === todo.briefId) || b.fromTodoId === todo.id)) || null;
}

// 할 일을 완료 처리하고 제출대기 서면으로 옮긴다. 원본 불변.
// ids: 고정 id를 쓸 때(Claude 반영) { briefId, doneTimelineId }. 빠진 것은 makeId 로 만든다.
// 반환: { caseObj, brief, created } — created=false 면 이미 옮겨진 할 일(연결만 보장).
export function moveTodoToBrief(caseObj, todoId, today = "", makeId = () => Date.now(), ids = {}) {
  const todos = Array.isArray(caseObj?.todos) ? caseObj.todos : [];
  const target = todos.find((t) => t && t.id === todoId);
  if (!target) return { caseObj, brief: null, created: false };

  const done = markTodoDone(caseObj, todoId, today, ids.doneTimelineId !== undefined ? () => ids.doneTimelineId : makeId);
  const existing = findLinkedBrief(done, target);
  if (existing) {
    const linkedTodos = (done.todos || []).map((t) => (t && t.id === todoId ? { ...t, briefId: existing.id } : t));
    return { caseObj: { ...done, todos: linkedTodos }, brief: existing, created: false };
  }

  const briefId = ids.briefId !== undefined ? ids.briefId : makeId();
  const withBrief = upsertBrief(done, {
    id: briefId,
    title: briefTitleFromTodoText(target.text) || String(target.text || "서면").trim(),
    preparedDate: today,
    details: target.details || "",
  });
  const briefs = (withBrief.briefs || []).map((b) => (b && b.id === briefId ? { ...b, fromTodoId: todoId } : b));
  const linkedTodos = (withBrief.todos || []).map((t) => (t && t.id === todoId ? { ...t, briefId } : t));
  const brief = briefs.find((b) => b && b.id === briefId) || null;
  return { caseObj: { ...withBrief, briefs, todos: linkedTodos }, brief, created: true };
}
