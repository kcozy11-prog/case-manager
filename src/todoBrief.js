// ─────────────────────────────────────────────────────────────────────────────
//  사건 할 일 → 제출대기 서면 이동 (순수 헬퍼)
//  "○○ 준비서면 작성" 같은 서면 작성 할 일을 완료하면, 할 일에서 지우고 서면 탭에
//  다시 입력하는 대신 그 사건의 제출대기 서면(briefs)으로 곧바로 옮긴다.
//  - 할 일은 완료 처리(markTodoDone: 완료일·진행경과 기록)되고 briefId 로 서면과 연결된다.
//  - 서면은 status 'pending' 으로 생성되며 fromTodoId 로 출처 할 일을 가리킨다.
//  - 같은 할 일을 다시 옮겨도 서면이 중복 생성되지 않는다.
// ─────────────────────────────────────────────────────────────────────────────
import { markTodoDone, upsertBrief } from "./caseLink.js";

// 서면류: '서면' 또는 서/장으로 끝나는 문서명(답변서, 의견서, 소장, 항소장, 위임장 …)
const DOC_KEYWORD_RE = /서면|[가-힣]{1,8}[서장](?![가-힣])/;
// 작성 계열 동사가 함께 있어야 '서면 작성' 할 일로 본다 (수령·검토·송달만 있는 항목 제외)
const DRAFT_VERB_RE = /작성|초안|기안|수정|보완/;

export function isBriefDraftingTodo(text = "") {
  const clean = String(text || "").trim();
  if (!clean) return false;
  return DOC_KEYWORD_RE.test(clean) && DRAFT_VERB_RE.test(clean);
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
// 반환: { caseObj, brief, created } — created=false 면 이미 옮겨진 할 일(연결만 보장).
export function moveTodoToBrief(caseObj, todoId, today = "", makeId = () => Date.now()) {
  const todos = Array.isArray(caseObj?.todos) ? caseObj.todos : [];
  const target = todos.find((t) => t && t.id === todoId);
  if (!target) return { caseObj, brief: null, created: false };

  const done = markTodoDone(caseObj, todoId, today, makeId);
  const existing = findLinkedBrief(done, target);
  if (existing) {
    const linkedTodos = (done.todos || []).map((t) => (t && t.id === todoId ? { ...t, briefId: existing.id } : t));
    return { caseObj: { ...done, todos: linkedTodos }, brief: existing, created: false };
  }

  const briefId = makeId();
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
