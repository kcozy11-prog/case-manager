// ─────────────────────────────────────────────────────────────────────────────
//  업무일지 → 사건 연동용 순수 헬퍼
//  사건 객체를 불변(immutable)으로 다루며, 모든 쓰기는 id 기반 upsert.
//  (재기록/재전송 시 같은 id 항목을 갱신 → 중복 방지. 캘린더 googleEventId 패턴과 동일)
// ─────────────────────────────────────────────────────────────────────────────

// 배열에서 id가 같은 항목을 patch로 갱신, 없으면 append. 원본 불변.
function upsertById(list = [], item) {
  const arr = Array.isArray(list) ? list : [];
  const idx = arr.findIndex((x) => x && x.id === item.id);
  if (idx === -1) return [...arr, item];
  const next = arr.slice();
  next[idx] = { ...arr[idx], ...item };
  return next;
}

// 진행경과(timeline)에 { id, date, content } upsert
export function upsertTimelineEntry(caseObj, { id, date, content }) {
  return { ...caseObj, timeline: upsertById(caseObj?.timeline, { id, date, content }) };
}

// 메모(memos)에 { id, category, title, content, date } upsert
export function upsertCaseMemo(caseObj, { id, category, title, content, date }) {
  return { ...caseObj, memos: upsertById(caseObj?.memos, { id, category, title, content, date }) };
}

// 제출대기서면(briefs)에 upsert.
//  - 신규: status="pending", submittedDate=""
//  - 기존: 제목/작성일만 갱신, status·submittedDate(이미 제출함 등)는 보존
export function upsertBrief(caseObj, { id, title, preparedDate = '' }) {
  const arr = Array.isArray(caseObj?.briefs) ? caseObj.briefs : [];
  const existing = arr.find((b) => b && b.id === id);
  const merged = existing
    ? { ...existing, title, preparedDate: existing.preparedDate || preparedDate }
    : { id, title, status: 'pending', preparedDate, submittedDate: '' };
  return { ...caseObj, briefs: upsertById(arr, merged) };
}

// 통화·상담 기록 → 진행경과 한 줄 문구
export function buildCallTimelineContent({ title = '', detail = '' } = {}) {
  const t = String(title || '').trim();
  const d = String(detail || '').trim();
  const body = t && d ? `${t} — ${d}` : (t || d);
  return `[통화/상담] ${body}`.trim();
}

// 착수금 일괄 완납처리: amount>0 && paidAmount<amount 인 사건만 paidAmount=amount 로.
// 변경된 사건 객체 배열만 반환(원본 불변).
export function computeRetainerPayups(cases = []) {
  const out = [];
  for (const c of cases) {
    const amount = Number(c?.retainer?.amount) || 0;
    const paid = Number(c?.retainer?.paidAmount) || 0;
    if (amount > 0 && paid < amount) {
      out.push({ ...c, retainer: { ...c.retainer, paidAmount: c.retainer.amount } });
    }
  }
  return out;
}
