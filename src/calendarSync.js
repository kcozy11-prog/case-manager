// ── Google Calendar API ──────────────────────────────────────────────────────

const LBOX_CAL_ID = "5dd32843ebd4cd2e01b418ad5add2f9dade2e80a033bc6d74742580fdc98d022@group.calendar.google.com";

export async function fetchCalendarEvents(token) {
  const past = new Date(); past.setDate(past.getDate() - 7);
  const future = new Date(); future.setDate(future.getDate() + 60);

  const params = new URLSearchParams({
    timeMin: past.toISOString(),
    timeMax: future.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "200",
  });

  // LBOX 캘린더만 조회 (할일 연계 없이 기일 정보만 사용)
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(LBOX_CAL_ID)}/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (res.status === 401) return null;
  if (!res.ok) return { items: [] };
  const data = await res.json();

  return { items: (data.items || []).map(e => ({ ...e, _src: "LBOX" })) };
}

// ── LBOX 일정 파싱 ──────────────────────────────────────────────────────────
// 형식: [이계원] 변론 서울중앙지방법원 2025가단99078 동관452호 10:40

const LBOX_RE = /^\[(.+?)\]\s+(\S+)\s+(\S+(?:법원|검찰청))\s+(\d{4}[가-힣]+\d+)\s*(.*?)\s*(\d{1,2}:\d{2})?\s*$/;

export function parseLboxEvent(summary) {
  if (!summary) return null;
  const m = summary.match(LBOX_RE);
  if (!m) return null;
  return {
    client: m[1],           // 이계원
    hearingType: m[2],      // 변론
    court: m[3],            // 서울중앙지방법원
    caseNumber: m[4],       // 2025가단99078
    location: m[5]?.trim(), // 동관452호
    time: m[6] || "",       // 10:40
  };
}

// ── 매칭 로직: 사건번호 우선, 3글자 이상 연속 일치 ──────────────────────────

const normalize = (s) => s.replace(/[\s()㈜㈔·\-_.,'"]/g, "");

function matchByCaseNumber(caseNumber, cases) {
  if (!caseNumber) return null;
  const cn = normalize(caseNumber);
  for (const c of cases) {
    if (!c.caseNumber || c.caseNumber === "—") continue;
    const target = normalize(c.caseNumber);
    if (cn.length >= 4 && (target.includes(cn) || cn.includes(target))) return c;
  }
  return null;
}

export function matchEventToCase(eventText, caseObj) {
  const ne = normalize(eventText);
  const terms = [caseObj.title, caseObj.client, caseObj.opponent].filter(Boolean);

  for (const term of terms) {
    const nt = normalize(term);
    if (nt.length < 3) continue;
    for (let i = 0; i <= nt.length - 3; i++) {
      if (ne.includes(nt.substring(i, i + 3))) return true;
    }
  }
  return false;
}

// ── LBOX 이벤트 → 기일 + 기일메모 + 진행경과 변환 ──────────────────────────

export function syncEventsWithCases(events, cases) {
  const updates = new Map();
  let newHearingCount = 0;

  const todayStr = new Date().toISOString().split("T")[0];

  for (const ev of events) {
    const summary = ev.summary || "";
    if (!summary.trim()) continue;

    const eventDate = ev.start?.date || (ev.start?.dateTime?.split("T")[0]) || "";
    const eventTime = ev.start?.dateTime
      ? new Date(ev.start.dateTime).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })
      : "";

    // LBOX 일정만 처리 → 기일 자동 추가 + 기일메모/진행경과
    const lbox = parseLboxEvent(summary);
    if (!lbox) continue;

    const matched = matchByCaseNumber(lbox.caseNumber, cases);
    if (!matched) continue;

    const ref = updates.get(matched.id) || { ...matched };
    const hearings = ref.hearings || [];

    // 중복 체크: 같은 날짜+유형 또는 같은 calendarEventId
    const isDup = hearings.some(h =>
      h.calendarEventId === ev.id ||
      (h.date === eventDate && h.type === (lbox.hearingType + "기일"))
    );

    if (!isDup) {
      const hearingType = lbox.hearingType + "기일";
      const locationInfo = lbox.location ? `${lbox.court} ${lbox.location}` : lbox.court;

      ref.hearings = [
        ...hearings,
        {
          id: Date.now() + Math.floor(Math.random() * 10000),
          date: eventDate,
          time: lbox.time || eventTime,
          type: hearingType,
          result: locationInfo,
          fromCalendar: true,
          calendarEventId: ev.id,
        },
      ];

      // 기일메모 자동 추가
      const memos = ref.memos || [];
      const memoContent = `• ${hearingType} ${eventDate}${lbox.time ? ` ${lbox.time}` : ""}\n• 장소: ${locationInfo}`;
      ref.memos = [
        ...memos,
        {
          id: Date.now() + Math.floor(Math.random() * 10000) + 1,
          category: "기일메모",
          title: `${hearingType} 지정`,
          content: memoContent,
          date: todayStr,
        },
      ];

      // 진행경과 자동 추가
      const timeline = ref.timeline || [];
      ref.timeline = [
        ...timeline,
        {
          id: Date.now() + Math.floor(Math.random() * 10000) + 2,
          date: todayStr,
          content: `${hearingType} ${eventDate}${lbox.time ? ` ${lbox.time}` : ""} 지정 (${lbox.court})`,
        },
      ];

      updates.set(matched.id, ref);
      newHearingCount++;
    }
  }

  return { updates, newTodoCount: 0, newHearingCount };
}
