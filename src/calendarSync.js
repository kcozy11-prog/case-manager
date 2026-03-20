// ── Google Calendar API ──────────────────────────────────────────────────────

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

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (res.status === 401) return null; // 토큰 만료
  if (!res.ok) throw new Error(`Calendar API: ${res.status}`);
  return res.json();
}

// ── 매칭 로직: 3글자 이상 연속 일치 ─────────────────────────────────────────

const normalize = (s) => s.replace(/[\s()㈜㈔·\-_.,'"]/g, "");

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

// ── 이벤트 → 할 일 변환 ─────────────────────────────────────────────────────

export function syncEventsWithCases(events, cases) {
  const updates = new Map();
  let newTodoCount = 0;

  for (const ev of events) {
    const eventText = (ev.summary || "") + " " + (ev.description || "");
    if (!eventText.trim()) continue;

    for (const c of cases) {
      if (!matchEventToCase(eventText, c)) continue;

      const ref = updates.get(c.id) || { ...c };
      const todos = ref.todos || [];

      if (todos.find((t) => t.calendarEventId === ev.id)) continue;

      const eventDate =
        ev.start?.date || (ev.start?.dateTime?.split("T")[0]) || "";

      ref.todos = [
        ...todos,
        {
          id: Date.now() + Math.floor(Math.random() * 10000),
          text: ev.summary || "캘린더 일정",
          done: false,
          priority: "보통",
          dueDate: eventDate,
          calendarEventId: ev.id,
          fromCalendar: true,
        },
      ];
      updates.set(c.id, ref);
      newTodoCount++;
    }
  }

  return { updates, newTodoCount };
}
