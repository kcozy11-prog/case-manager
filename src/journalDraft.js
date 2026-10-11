// ─────────────────────────────────────────────────────────────────────────────
//  업무일지 작성 중 초안 — 이 기기(localStorage)에 날짜별로 자동 보관
//  저장 버튼을 누르기 전에 창이 닫히거나 화면이 바뀌어도, 다시 열면 복구를 제안한다.
//  초안에는 그 입력이 출발한 서버 판본(base)도 함께 담아, 복구 뒤 저장할 때 3자 병합에 쓴다.
//  형식: { v: 1, date, at, form, base, baseSavedAt }
// ─────────────────────────────────────────────────────────────────────────────
import { stableStringify } from "./caseMerge.js";

export const JOURNAL_DRAFT_PREFIX = "caseManager.journalDraft.v1.";

export function journalDraftKey(uid, dateKey) {
  return `${JOURNAL_DRAFT_PREFIX}${uid}.${dateKey}`;
}

function defaultStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

export function saveJournalDraft(uid, dateKey, { form, base = null, at = new Date().toISOString() } = {}, storage = defaultStorage()) {
  if (!uid || !dateKey || !form || !storage) return false;
  try {
    storage.setItem(journalDraftKey(uid, dateKey), JSON.stringify({
      v: 1, date: dateKey, at, form, base: base || null, baseSavedAt: base?._savedAt || null,
    }));
    return true;
  } catch {
    return false;
  }
}

export function loadJournalDraft(uid, dateKey, storage = defaultStorage()) {
  if (!uid || !dateKey || !storage) return null;
  try {
    const raw = storage.getItem(journalDraftKey(uid, dateKey));
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && d.v === 1 && d.form && typeof d.form === "object" ? d : null;
  } catch {
    return null;
  }
}

export function clearJournalDraft(uid, dateKey, storage = defaultStorage()) {
  if (!uid || !dateKey || !storage) return;
  try { storage.removeItem(journalDraftKey(uid, dateKey)); } catch { /* 무시 */ }
}

// 복구를 제안할 초안인가: 지금 화면(서버 판본으로 만든 폼)과 내용이 다를 때만
export function draftDiffersFromForm(draft, form) {
  if (!draft || !draft.form) return false;
  return stableStringify(draft.form) !== stableStringify(form || {});
}
