// ─────────────────────────────────────────────────────────────────────────────
//  앱 할일 → 구글 캘린더 쓰기 (단방향)
//  전용 '업무 할일' 캘린더에 마감일 기준 종일/지정시각 이벤트를 생성·갱신한다.
//  생성된 eventId 를 할일에 저장해 재실행 시 중복 없이 갱신(PATCH)한다.
//  필요 스코프: https://www.googleapis.com/auth/calendar
// ─────────────────────────────────────────────────────────────────────────────

const CAL_API = "https://www.googleapis.com/calendar/v3";
const TASK_CAL_NAME = "업무 할일";
const CAL_ID_CACHE_KEY = "taskCalendarId";

// 401 → 토큰 만료 신호
export class CalendarAuthError extends Error {
  constructor(msg = "Google 인증이 필요합니다.") { super(msg); this.name = "CalendarAuthError"; }
}

async function calFetch(token, path, options = {}) {
  const res = await fetch(`${CAL_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  // 401(만료) 뿐 아니라 403(권한 부족 — 캘린더 쓰기 스코프 미동의)도 재로그인으로 복구 유도.
  // 스코프 확대(calendar.readonly→calendar) 직후 기존 토큰은 쓰기 시 403을 반환하기 때문.
  if (res.status === 401 || res.status === 403) {
    throw new CalendarAuthError("Google 캘린더 쓰기 권한이 필요합니다. 다시 로그인해 주세요.");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`캘린더 API 오류 ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.status === 204 ? null : res.json();
}

// 전용 '업무 할일' 캘린더 보장 — 없으면 생성, 있으면 재사용. id 캐시.
export async function ensureTaskCalendar(token) {
  // 1) 캐시 확인 (존재 검증 포함)
  const cached = localStorage.getItem(CAL_ID_CACHE_KEY);
  if (cached) {
    try {
      await calFetch(token, `/calendars/${encodeURIComponent(cached)}`);
      return cached;
    } catch (e) {
      if (e instanceof CalendarAuthError) throw e;
      localStorage.removeItem(CAL_ID_CACHE_KEY); // 캐시 무효 → 재탐색
    }
  }
  // 2) 캘린더 목록에서 이름으로 탐색
  const list = await calFetch(token, "/users/me/calendarList?maxResults=250");
  const found = (list.items || []).find((c) => c.summary === TASK_CAL_NAME);
  if (found) {
    localStorage.setItem(CAL_ID_CACHE_KEY, found.id);
    return found.id;
  }
  // 3) 신규 생성
  const created = await calFetch(token, "/calendars", {
    method: "POST",
    body: JSON.stringify({ summary: TASK_CAL_NAME, timeZone: "Asia/Seoul" }),
  });
  localStorage.setItem(CAL_ID_CACHE_KEY, created.id);
  return created.id;
}

function addDaysISO(dateStr, n) {
  const ms = Date.parse(`${dateStr}T00:00:00+09:00`);
  if (!Number.isFinite(ms)) return dateStr;
  return new Date(ms + n * 86400000 + 9 * 3600000).toISOString().slice(0, 10);
}

function buildEventBody({ title, details, date, time, durationMin = 60, sourceUrl }) {
  const body = {
    summary: title || "(제목 없음)",
    description: [details, sourceUrl].filter(Boolean).join("\n\n") || undefined,
  };
  if (time) {
    const startMs = Date.parse(`${date}T${time}:00+09:00`);
    body.start = { dateTime: `${date}T${time}:00`, timeZone: "Asia/Seoul" };
    body.end = {
      dateTime: new Date(startMs + durationMin * 60000).toISOString(),
      timeZone: "Asia/Seoul",
    };
  } else {
    // 종일 일정: end.date 는 배타적(다음 날)
    body.start = { date };
    body.end = { date: addDaysISO(date, 1) };
  }
  return body;
}

// 할일 → 이벤트 생성/갱신. eventId 있으면 PATCH, 없으면 POST. eventId 반환.
export async function upsertTaskEvent(token, calId, { eventId, title, details, date, time, durationMin }) {
  if (!date) throw new Error("마감일이 없는 할일은 캘린더에 등록할 수 없습니다.");
  const body = buildEventBody({ title, details, date, time, durationMin });
  if (eventId) {
    try {
      const updated = await calFetch(token, `/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      return updated.id;
    } catch (e) {
      if (e instanceof CalendarAuthError) throw e;
      // 이벤트가 삭제됐을 수 있음 → 새로 생성
    }
  }
  const created = await calFetch(token, `/calendars/${encodeURIComponent(calId)}/events`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return created.id;
}

// 이벤트 삭제(할일 캘린더 해제용, 선택)
export async function deleteTaskEvent(token, calId, eventId) {
  if (!eventId) return;
  try {
    await calFetch(token, `/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`, { method: "DELETE" });
  } catch (e) {
    if (e instanceof CalendarAuthError) throw e;
    // 이미 없으면 무시
  }
}
