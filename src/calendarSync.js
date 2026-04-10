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

const LBOX_RE = /^\[(.+?)\]\s+(\S+)\s+(\S+(?:법원|검찰청|경찰서))\s+(\d{4}[가-힣]+\d+)\s*(.*?)\s*(\d{1,2}:\d{2})?\s*$/;

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

// 사건번호 추출 (어떤 형식의 텍스트에서든)
const CASE_NUM_EXTRACT = /(\d{4}[가-힣]{1,4}\d+)/;

// 사건번호·법원·제목 기반 사건유형 추론
export function inferCaseType(caseNumber, court, title) {
  const cn = (caseNumber || "").replace(/[\s\-]/g, "");
  const t = title || "";
  if (/검찰청|경찰서/.test(court || "")) return "형사(피의)";
  if (/\d{4}[고노]/.test(cn)) return "형사(재판)";
  if (/\d{4}[드느브]/.test(cn) || /이혼|양육|친권|상속|유류분|한정승인/.test(t)) return "가사";
  if (/\d{4}차\d/.test(cn) || /지급명령/.test(t)) return "지급명령";
  if (/\d{4}타[채기경]/.test(cn) || /강제집행|압류|추심|경매/.test(t)) return "강제집행";
  if (/\d{4}구[합단]/.test(cn) || /행정.*소송|처분취소|인허가/.test(t)) return "행정";
  if (/학교폭력|학폭/.test(t)) return "학교폭력";
  return "민사";
}

// 기일 유형 키워드 (긴 키워드 우선 매칭)
const HEARING_TYPES = ["변론준비", "공판준비", "증인신문", "변론", "조정", "선고", "공판", "결정", "심문", "감정", "검증"];

function extractHearingType(text) {
  for (const t of HEARING_TYPES) {
    if (text.includes(t)) return t;
  }
  return null;
}

export function syncEventsWithCases(events, cases) {
  const updates = new Map();
  let newHearingCount = 0;
  let newCaseCount = 0;
  const skippedEvents = [];

  const todayStr = new Date().toISOString().split("T")[0];

  console.log(`[캘린더 동기화] LBOX 이벤트 ${events.length}건 처리 시작`);

  for (const ev of events) {
    const summary = ev.summary || "";
    if (!summary.trim()) continue;

    const eventDate = ev.start?.date || (ev.start?.dateTime?.split("T")[0]) || "";
    const eventTime = ev.start?.dateTime
      ? new Date(ev.start.dateTime).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })
      : "";

    // 1단계: LBOX 정규 형식 파싱 (성공하면 풍부한 정보 획득)
    const lbox = parseLboxEvent(summary);

    // 2단계: 사건 매칭 — 사건번호 우선, 텍스트 폴백
    let matched = null;
    if (lbox) {
      matched = matchByCaseNumber(lbox.caseNumber, cases);
    }
    if (!matched) {
      // LBOX 파싱 실패해도 사건번호가 텍스트에 있으면 추출
      const caseNum = summary.match(CASE_NUM_EXTRACT);
      if (caseNum) matched = matchByCaseNumber(caseNum[1], cases);
    }
    if (!matched) {
      matched = cases.find(c => matchEventToCase(summary, c));
    }
    if (!matched) {
      const caseNum = lbox?.caseNumber || (summary.match(CASE_NUM_EXTRACT) || [])[1] || "";

      // 사건번호도 없고 LBOX 파싱도 실패 → 스킵
      if (!caseNum && !lbox) {
        skippedEvents.push(summary);
        continue;
      }

      // updates에서 같은 사건번호로 이미 생성된 신규 사건 확인
      if (caseNum) {
        const normCaseNum = normalize(caseNum);
        for (const [, uc] of updates) {
          if (uc.caseNumber && normalize(uc.caseNumber) === normCaseNum) {
            matched = uc;
            break;
          }
        }
      }

      // 신규 사건 자동 등록
      if (!matched) {
        const newId = `c${Date.now()}${Math.floor(Math.random() * 1000)}`;
        const client = lbox?.client || "";
        const court = lbox?.court || "";
        const caseType = inferCaseType(caseNum, court, "");
        const title = client
          ? `${client} ${caseNum || "사건"}`
          : caseNum || summary.slice(0, 30);

        matched = {
          id: newId, title, type: caseType, status: "진행중",
          client, clientContact: "", opponent: "",
          manager: "", managerOrg: "", managerContact: "",
          court, caseNumber: caseNum,
          retainer: { amount: "", date: "", successFee: "", successFeeAmount: "" },
          hearings: [], timeline: [], memos: [], documents: [], todos: [],
        };
        newCaseCount++;
        console.log(`[캘린더 동기화] + 신규 사건: "${title}" (${caseNum})`);
      }
    }

    const ref = updates.get(matched.id) || { ...matched };
    const hearings = ref.hearings || [];

    // 기일 유형·장소·시간 결정 (LBOX 파싱 성공 시 상세 정보 사용, 실패 시 텍스트에서 추출)
    const hType = lbox ? lbox.hearingType : extractHearingType(summary);
    const hearingType = hType ? hType + "기일" : "기일";
    const locationInfo = lbox ? (lbox.location ? `${lbox.court} ${lbox.location}` : lbox.court) : "";
    const hearingTime = lbox?.time || eventTime;

    // 중복 체크: calendarEventId 또는 같은 날짜+유형
    const isDup = hearings.some(h =>
      h.calendarEventId === ev.id ||
      (h.date === eventDate && h.type === hearingType)
    );

    if (!isDup) {
      ref.hearings = [
        ...hearings,
        {
          id: Date.now() + Math.floor(Math.random() * 10000),
          date: eventDate,
          time: hearingTime,
          type: hearingType,
          result: locationInfo,
          fromCalendar: true,
          calendarEventId: ev.id,
        },
      ];

      // 기일메모 자동 추가
      const memos = ref.memos || [];
      const memoContent = `• ${hearingType} ${eventDate}${hearingTime ? ` ${hearingTime}` : ""}${locationInfo ? `\n• 장소: ${locationInfo}` : ""}`;
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
          content: `${hearingType} ${eventDate}${hearingTime ? ` ${hearingTime}` : ""} 지정${lbox?.court ? ` (${lbox.court})` : ""}`,
        },
      ];

      updates.set(matched.id, ref);
      newHearingCount++;
      console.log(`[캘린더 동기화] ✓ 기일 추가: "${summary}" → ${matched.title}`);
    }
  }

  if (skippedEvents.length > 0) {
    console.warn(`[캘린더 동기화] 매칭 실패 ${skippedEvents.length}건:`, skippedEvents);
  }
  console.log(`[캘린더 동기화] 완료: 신규 기일 ${newHearingCount}건 추가`);

  return { updates, newTodoCount: 0, newHearingCount, newCaseCount, skippedCount: skippedEvents.length };
}

// ── Google Tasks API ──────────────────────────────────────────────────────────

// Google Tasks API로 "회사 업무" tasklist 조회 및 태스크 가져오기
export async function fetchWorkTasks(token) {
  // 1. tasklist 목록 조회
  const listRes = await fetch(
    'https://tasks.googleapis.com/tasks/v1/users/@me/lists',
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!listRes.ok) return null;
  const listData = await listRes.json();

  // 2. "회사 업무" 이름의 tasklist 찾기 (없으면 기본 목록)
  const workList = listData.items?.find(l => /회사.?업무|업무/i.test(l.title))
    || listData.items?.[0];
  if (!workList) return [];

  // 3. 해당 tasklist의 태스크 가져오기 (완료되지 않은 것만)
  const taskRes = await fetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${workList.id}/tasks?showCompleted=false&maxResults=100`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!taskRes.ok) return [];
  const taskData = await taskRes.json();
  return (taskData.items || []).map(t => ({ ...t, _listName: workList.title }));
}

// 태스크를 사건과 매칭 (자동 매칭 + 미매칭 분류)
export function matchTasksToCases(tasks, cases) {
  const matched = [];   // { task, caseObj }
  const unmatched = []; // { task }

  for (const task of tasks) {
    if (!task.title?.trim()) continue;
    const text = (task.title + ' ' + (task.notes || '')).toLowerCase();

    // 사건번호로 먼저 매칭
    const caseNumMatch = text.match(/(\d{4}[가-힣]{1,4}\d+)/);
    let found = null;
    if (caseNumMatch) {
      found = cases.find(c => c.caseNumber && normalize(c.caseNumber).includes(normalize(caseNumMatch[1])));
    }

    // 사건번호 매칭 실패 시 당사자명/사건명으로 매칭
    if (!found) {
      found = cases.find(c => matchEventToCase(task.title + ' ' + (task.notes || ''), c));
    }

    if (found) {
      matched.push({ task, caseObj: found });
    } else {
      unmatched.push({ task });
    }
  }
  return { matched, unmatched };
}

// ── 캘린더 목록 조회 ──────────────────────────────────────────────────────────

export async function fetchCalendarList(token) {
  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList",
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.items || [];
}

// ── 회사업무 캘린더 이벤트 가져오기 ──────────────────────────────────────────

export async function fetchWorkCalendarEvents(token) {
  const calendars = await fetchCalendarList(token);

  const workCalendars = calendars.filter(cal =>
    cal.id !== LBOX_CAL_ID && (
      cal.primary ||
      /회사|업무|work/i.test(cal.summary || "")
    )
  );

  if (workCalendars.length === 0) return [];

  const past = new Date(); past.setDate(past.getDate() - 30);
  const future = new Date(); future.setDate(future.getDate() + 60);

  const params = new URLSearchParams({
    timeMin: past.toISOString(),
    timeMax: future.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "200",
  });

  const allEvents = [];
  for (const cal of workCalendars) {
    try {
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?${params}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = await res.json();
        (data.items || []).forEach(e => allEvents.push({ ...e, _calName: cal.summary || "기본" }));
      }
    } catch (e) {
      console.warn(`캘린더 조회 실패 (${cal.summary}):`, e);
    }
  }

  return allEvents;
}

// ── 회사업무 이벤트 → 공식결과메모 변환 ──────────────────────────────────────

export function syncWorkEventsWithCases(events, cases) {
  const updates = new Map();
  let newMemoCount = 0;
  const todayStr = new Date().toISOString().split("T")[0];

  const caseEvents = new Map();

  for (const ev of events) {
    const summary = ev.summary || "";
    if (!summary.trim()) continue;

    // LBOX 형식은 제외 (이미 기일로 처리됨)
    if (parseLboxEvent(summary)) continue;

    const eventDate = ev.start?.date || (ev.start?.dateTime?.split("T")[0]) || "";

    // 사건 매칭 (사건명·의뢰인·상대방 기반)
    const matched = cases.find(c => matchEventToCase(summary + " " + (ev.description || ""), c));
    if (!matched) continue;

    if (!caseEvents.has(matched.id)) {
      caseEvents.set(matched.id, { caseObj: matched, events: [] });
    }
    caseEvents.get(matched.id).events.push({
      summary,
      date: eventDate,
      description: ev.description || "",
    });
  }

  for (const [caseId, { caseObj, events: evts }] of caseEvents) {
    const ref = updates.get(caseId) || { ...caseObj };
    const memos = ref.memos || [];

    // 동일 날짜에 이미 캘린더 업무 요약 메모가 있으면 스킵
    if (memos.some(m => m.category === "공식결과메모" && m.title === "캘린더 업무 요약" && m.date === todayStr)) {
      continue;
    }

    const content = evts
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(e => `• ${e.date} ${e.summary}${e.description ? `\n  └ ${e.description.slice(0, 100)}` : ""}`)
      .join("\n");

    ref.memos = [
      ...memos,
      {
        id: Date.now() + Math.floor(Math.random() * 10000),
        category: "공식결과메모",
        title: "캘린더 업무 요약",
        content,
        date: todayStr,
      },
    ];

    updates.set(caseId, ref);
    newMemoCount++;
  }

  return { updates, newMemoCount };
}
