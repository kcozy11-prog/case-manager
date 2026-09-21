export function hearingMemoText(hearing) {
  return String(hearing?.memo || "");
}

export function setHearingMemo(hearings = [], hearingId, memoText = "") {
  const nextMemo = String(memoText || "").trim();
  return (hearings || []).map((hearing) => {
    if (hearing?.id !== hearingId) return hearing;
    const next = { ...hearing };
    if (nextMemo) {
      next.memo = nextMemo;
    } else {
      delete next.memo;
    }
    return next;
  });
}

// ── 기일 날짜 ────────────────────────────────────────────────────────────────
// 기일 날짜는 "YYYY-MM-DD" 문자열이다. new Date(문자열)은 UTC 기준으로 해석되어
// 시간대에 따라 하루가 밀리고, 잘못된 값에는 Invalid Date(NaN)를 돌려주므로
// 집계에는 쓰지 않고 아래 파서로 직접 해석한다.
const HEARING_DATE_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

export function parseHearingDate(dateStr) {
  const m = HEARING_DATE_RE.exec(String(dateStr || "").trim());
  if (!m) return null;
  const [, y, mo, d] = m.map(Number);
  const date = new Date(y, mo - 1, d);
  date.setHours(0, 0, 0, 0);
  // 2026-02-31 같은 값이 3월로 넘어가는 것을 막는다.
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

export function hasHearingDate(hearing) {
  return parseHearingDate(hearing?.date) !== null;
}

// 기일까지 남은 일수. 날짜가 없거나 형식이 틀리면 null.
export function hearingDday(dateStr, now = new Date()) {
  const date = parseHearingDate(dateStr);
  if (!date) return null;
  const base = new Date(now);
  base.setHours(0, 0, 0, 0);
  return Math.round((date - base) / 86400000);
}

// ── 같은 기일 판정 ───────────────────────────────────────────────────────────
// "변론기일"과 "변론"은 같은 유형이고, 유형을 못 읽어 "기일"로만 들어온 항목은
// 유형 불명으로 본다(같은 날 다른 유형과 충돌하지 않는다).
export function normalizeHearingType(type) {
  const compact = String(type || "").replace(/\s+/g, "");
  const stripped = compact.replace(/기일$/, "");
  return stripped;
}

const hearingTime = (hearing) => String(hearing?.time || "").trim();

// 한 사건 안에서 두 기일이 실제로 같은 기일인지 판정한다.
//  - 같은 캘린더 일정(calendarEventId)이면 같은 기일
//  - 그 외에는 날짜가 같고, 유형과 시각이 서로 어긋나지 않아야 한다.
//    (한쪽이 비어 있으면 정보가 덜 들어온 같은 기일로 본다)
export function isSameHearing(a, b) {
  if (!a || !b) return false;
  if (a.calendarEventId && a.calendarEventId === b.calendarEventId) return true;

  const dateA = parseHearingDate(a.date);
  const dateB = parseHearingDate(b.date);
  if (!dateA || !dateB || a.date !== b.date) return false;

  const typeA = normalizeHearingType(a.type);
  const typeB = normalizeHearingType(b.type);
  if (typeA && typeB && typeA !== typeB) return false;

  const timeA = hearingTime(a);
  const timeB = hearingTime(b);
  if (timeA && timeB && timeA !== timeB) return false;

  return true;
}

export function findSameHearingIndex(hearings = [], candidate) {
  return (hearings || []).findIndex((h) => isSameHearing(h, candidate));
}

// 같은 기일이 이미 있으면 덧붙이지 않고 비어 있던 정보만 채운다.
export function upsertHearing(hearings = [], candidate) {
  const list = Array.isArray(hearings) ? hearings : [];
  if (!candidate) return { hearings: list, added: false, updated: false };

  const index = findSameHearingIndex(list, candidate);
  if (index < 0) return { hearings: [...list, candidate], added: true, updated: false };

  const existing = list[index];
  const merged = {
    ...existing,
    id: existing.id ?? candidate.id,
    // 새로 들어온 값이 비어 있으면 기존 값을 지우지 않는다.
    date: candidate.date || existing.date,
    time: hearingTime(candidate) || hearingTime(existing),
    type: normalizeHearingType(candidate.type) ? candidate.type : existing.type,
    result: candidate.result || existing.result || "",
  };
  if (candidate.calendarEventId) merged.calendarEventId = candidate.calendarEventId;
  if (candidate.fromCalendar) merged.fromCalendar = true;

  const changed = ["date", "time", "type", "result", "calendarEventId", "fromCalendar"]
    .some((k) => (existing[k] || "") !== (merged[k] || ""));
  if (!changed) return { hearings: list, added: false, updated: false };

  const next = [...list];
  next[index] = merged;
  return { hearings: next, added: false, updated: true };
}

// ── 사건 전체 기일 집계 ──────────────────────────────────────────────────────
// 같은 기일이 사건 기록에 두 번 들어가 있으면(LBOX 일정이 다른 캘린더에서 한 번 더
// 들어오거나, AI 파싱·수동 입력으로 같은 기일을 또 넣은 경우) 화면의 건수가 실제
// 기일 수보다 많게 나온다. 집계에서는 같은 기일을 하나로 본다.
const CASE_KEY_STRIP_RE = /[\s()㈜㈔·\-_.,'"—]/g;

const normalizeCaseKeyText = (value) => String(value || "").replace(CASE_KEY_STRIP_RE, "").toLowerCase();

// 사건 식별자. 사건번호가 같으면(같은 사건을 두 건으로 등록했거나 공동 당사자별로
// 나눠 등록한 경우) 같은 법정에서 열리는 한 개의 기일로 센다.
export function caseIdentityKey(caseObj) {
  const caseNumber = normalizeCaseKeyText(caseObj?.caseNumber);
  if (caseNumber.length >= 6) return `n:${caseNumber}`;
  const title = normalizeCaseKeyText(caseObj?.title);
  if (title) return `t:${title}`;
  return `i:${caseObj?.id ?? ""}`;
}

// 같은 기일끼리 묶는다. 앞의 것을 대표로 남기고 뒤의 것은 중복으로 표시하되,
// 대표에 비어 있던 시각·유형·장소는 뒤에 들어온 값으로 채운다.
// 건수 집계(collectHearings)와 사건 상세의 중복 표시가 같은 기준을 쓰도록 한 곳에 둔다.
function foldSameHearings(sortedRows = [], sameCase = () => true) {
  const folded = [];
  const leaders = [];
  for (const row of sortedRows) {
    const leader = leaders.find((l) => sameCase(l, row) && isSameHearing(l, row));
    if (!leader) {
      const next = { ...row, isDuplicate: false };
      leaders.push(next);
      folded.push(next);
      continue;
    }
    if (!hearingTime(leader) && hearingTime(row)) leader.time = row.time;
    if (!normalizeHearingType(leader.type) && normalizeHearingType(row.type)) leader.type = row.type;
    if (!leader.result && row.result) leader.result = row.result;
    folded.push({ ...row, isDuplicate: true });
  }
  return folded;
}

const compareHearings = (a, b) =>
  (a.date || "").localeCompare(b.date || "") || hearingTime(a).localeCompare(hearingTime(b));

// 날짜가 없는 기일은 집계에서 뺀다(언제인지 모르는 기일은 셀 수 없다).
// 종결 사건의 기일도 빼서 다음 기일 배너·다른 통계와 기준을 맞춘다.
export function collectHearings(cases = [], { includeClosed = false } = {}) {
  const rows = [];
  for (const caseObj of cases || []) {
    if (!caseObj) continue;
    if (!includeClosed && caseObj.status === "종결") continue;
    const caseKey = caseIdentityKey(caseObj);
    for (const hearing of caseObj.hearings || []) {
      if (!hasHearingDate(hearing)) continue;
      rows.push({
        ...hearing,
        caseId: caseObj.id,
        caseTitle: caseObj.title,
        caseClient: caseObj.client,
        caseKey,
      });
    }
  }

  const sameCase = (a, b) => a.caseKey === b.caseKey;
  return foldSameHearings(rows.sort(compareHearings), sameCase).filter((h) => !h.isDuplicate);
}

// 오늘 이후로 남은 기일 (오늘 포함)
export function selectUpcomingHearings(cases = [], now = new Date(), options) {
  return collectHearings(cases, options)
    .map((h) => ({ ...h, dday: hearingDday(h.date, now) }))
    .filter((h) => h.dday !== null && h.dday >= 0)
    .sort(compareHearings);
}

// 이번 달에 남은 기일
export function selectMonthHearings(cases = [], now = new Date(), options) {
  const base = new Date(now);
  return selectUpcomingHearings(cases, now, options).filter((h) => {
    const date = parseHearingDate(h.date);
    return date.getFullYear() === base.getFullYear() && date.getMonth() === base.getMonth();
  });
}

// 오늘부터 days일 안에 있는 기일
export function selectWeekHearings(cases = [], now = new Date(), days = 7, options) {
  return selectUpcomingHearings(cases, now, options).filter((h) => h.dday <= days);
}

// 사건 상세에서 쓰는 예정/지난 기일. 여기서는 중복도 그대로 보여 준다 —
// 잘못 들어간 기일을 사용자가 직접 확인하고 지울 수 있어야 하기 때문이다.
export function splitCaseHearings(hearings = [], now = new Date()) {
  const all = (hearings || []).filter(Boolean);
  const undated = all.filter((h) => !hasHearingDate(h));

  // 같은 기일이 두 번 들어가 있으면 뒤의 것에 중복 표시를 달아 둔다.
  // 건수에서는 빼지만 목록에서는 감추지 않는다 — 잘못 들어간 줄을 사용자가
  // 직접 보고 지울 수 있어야 하기 때문이다.
  const dated = foldSameHearings(all.filter(hasHearingDate).sort(compareHearings));

  const upcoming = dated.filter((h) => hearingDday(h.date, now) >= 0);
  const past = dated.filter((h) => hearingDday(h.date, now) < 0).reverse();
  return { upcoming, past, undated };
}

// 사건 목록 카드에서 쓰는 다음 기일
export function nextCaseHearing(hearings = [], now = new Date()) {
  return splitCaseHearings(hearings, now).upcoming[0] || null;
}
