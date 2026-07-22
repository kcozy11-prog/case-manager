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
  const dedicated = res.ok ? ((await res.json()).items || []).map(e => ({ ...e, _src: "LBOX" })) : [];

  // 전용 캘린더 외에, 다른 캘린더에 'lbox/엘박스' 키워드로 들어온 기일도 추가 수집
  let extra = [];
  try { extra = await fetchLboxKeywordEvents(token); } catch (e) { console.warn("LBOX 키워드 스캔 실패", e); }

  const ids = new Set(dedicated.map(e => e.id).filter(Boolean));
  const merged = [...dedicated, ...extra.filter(e => !e.id || !ids.has(e.id))];
  return { items: merged };
}

// 다른 캘린더에서 'lbox/엘박스' 일정 수집:
//  - 캘린더 이름 자체가 LBOX → 그 캘린더 전체 일정
//  - 그 외 캘린더 → 일정 텍스트에 키워드가 있는 것만 (Calendar API q 검색 + isLboxEvent 확인)
export async function fetchLboxKeywordEvents(token) {
  const calendars = await fetchCalendarList(token);
  if (!calendars.length) return [];

  const past = new Date(); past.setDate(past.getDate() - 7);
  const future = new Date(); future.setDate(future.getDate() + 60);
  const baseParams = {
    timeMin: past.toISOString(), timeMax: future.toISOString(),
    singleEvents: "true", orderBy: "startTime", maxResults: "100",
  };
  const headers = { Authorization: `Bearer ${token}` };
  const out = [];
  const seen = new Set();
  const add = (e, calName) => {
    const key = e.id || `${e.summary}|${e.start?.dateTime || e.start?.date}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...e, _src: "LBOX", _calendarName: calName });
  };

  for (const cal of calendars) {
    if (cal.id === LBOX_CAL_ID) continue; // 전용 캘린더는 별도 처리
    const calIsLbox = LBOX_KEYWORD_RE.test(cal.summary || "");
    // 내가 쓰는 캘린더만 키워드 검색 (공휴일 등 읽기전용 구독은 제외 → 호출·노이즈 감소)
    const writable = cal.primary || cal.accessRole === "owner" || cal.accessRole === "writer";
    try {
      if (calIsLbox) {
        // 캘린더 이름 자체가 LBOX → 역할 무관 전체 일정
        const params = new URLSearchParams(baseParams);
        const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?${params}`, { headers });
        if (res.ok) ((await res.json()).items || []).forEach(e => add(e, cal.summary));
      } else if (writable) {
        for (const kw of ["엘박스", "LBOX"]) {
          const params = new URLSearchParams({ ...baseParams, q: kw });
          const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?${params}`, { headers });
          if (res.ok) ((await res.json()).items || []).forEach(e => {
            if (isLboxEvent({ ...e, _calendarName: cal.summary })) add(e, cal.summary);
          });
        }
      }
    } catch (e) {
      console.warn(`LBOX 키워드 스캔 실패 (${cal.summary})`, e);
    }
  }
  return out;
}

// ── LBOX 일정 파싱 ──────────────────────────────────────────────────────────
// 두 가지 형식을 모두 지원한다.
//  (A) 대괄호 형식 : [이계원] 변론 서울중앙지방법원 2025가단99078 동관452호 10:40
//  (B) 콤마 형식   : 박제군, 변론, 수원지방법원 안양지원-2026가단100906 제406호 법정 11:20

const LBOX_RE = /^\[(.+?)\]\s+(\S+)\s+(\S+(?:법원|검찰청|경찰서))\s+(\d{4}[가-힣]+\d+)\s*(.*?)\s*(\d{1,2}:\d{2})?\s*$/;

// 공통 추출 패턴
const LBOX_CASE_NUM_RE = /(\d{4}[가-힣]{1,4}\d+)/;                 // 2026가단100906
const LBOX_TIME_RE = /(\d{1,2}:\d{2})\s*$/;                       // 끝의 11:20
// 법원/지원/검찰청/경찰서 (예: "수원지방법원 안양지원")
const LBOX_COURT_RE = /([가-힣]+(?:지방법원|고등법원|가정법원|행정법원|회생법원|지방검찰청|검찰청|경찰서|법원))(?:\s+([가-힣]+지원))?/;

export function parseLboxEvent(summary) {
  if (!summary) return null;
  const raw = summary.trim();

  // (A) 대괄호 형식 우선
  const m = raw.match(LBOX_RE);
  if (m) {
    return {
      client: m[1],
      hearingType: m[2],
      court: m[3],
      caseNumber: m[4],
      location: m[5]?.trim() || "",
      time: m[6] || "",
    };
  }

  // (B) 콤마/일반 형식 — 사건번호가 있어야 LBOX 기일로 인정
  const caseM = raw.match(LBOX_CASE_NUM_RE);
  if (!caseM) return null;
  const caseNumber = caseM[1];

  const timeM = raw.match(LBOX_TIME_RE);
  const time = timeM ? timeM[1] : "";

  // 콤마 세그먼트에서 당사자/기일유형 추출
  const commaParts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  let client = "";
  let hearingType = "";
  if (commaParts.length >= 2) {
    client = commaParts[0];
    hearingType = extractHearingType(commaParts[1]) || commaParts[1].split(/\s+/)[0] || "";
  } else {
    hearingType = extractHearingType(raw) || "";
  }

  // 법원: 사건번호 앞부분에서 추출 (지원까지 포함)
  const beforeCase = raw.slice(0, caseM.index);
  const courtM = beforeCase.match(LBOX_COURT_RE);
  let court = "";
  if (courtM) court = [courtM[1], courtM[2]].filter(Boolean).join(" ").trim();

  // 법정/장소: 사건번호 뒤 ~ 시간 앞
  let afterCase = raw.slice(caseM.index + caseNumber.length);
  afterCase = afterCase.replace(LBOX_TIME_RE, "");
  const location = afterCase.replace(/^[\s\-,]+/, "").replace(/[\s,]+$/, "").trim();

  return { client, hearingType, court, caseNumber, location, time };
}

// ── LBOX 이벤트 식별: 형식이 아니라 키워드(lbox/엘박스) 또는 출처로 판정 ──────
const LBOX_KEYWORD_RE = /lbox|엘박스/i;

export function isLboxEvent(ev) {
  if (!ev) return false;
  if (ev._src === "LBOX") return true; // LBOX 캘린더에서 가져온 일정
  const hay = [
    ev.summary, ev.description, ev.location,
    ev._calendarName, ev.organizer?.displayName, ev.organizer?.email,
  ].filter(Boolean).join(" ");
  return LBOX_KEYWORD_RE.test(hay);
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

function matchTextPart(a, b, minLength = 2) {
  const left = normalize(a || "");
  const right = normalize(b || "");
  if (left.length < minLength || right.length < minLength) return false;
  return left.includes(right) || right.includes(left);
}

function normalizeCourtAlias(value = "") {
  return normalize(value)
    .replace(/지방법원/g, "지법")
    .replace(/고등법원/g, "고법")
    .replace(/가정법원/g, "가법")
    .replace(/행정법원/g, "행법")
    .replace(/회생법원/g, "회생법")
    .replace(/지방검찰청/g, "지검");
}

function extractCourtBranchNames(value = "") {
  const raw = String(value || "");
  // "수원지방법원 안양지원"처럼 본원+지원이 같이 있으면 뒤의 지원명만 별도 기준으로 삼는다.
  // 붙여 쓴 "수원지법안양지원"도 처리하기 위해 본원 명칭을 먼저 공백으로 치환한다.
  const branchOnlyText = raw.replace(
    /[가-힣]+(?:지방법원|고등법원|가정법원|행정법원|회생법원|법원|지법|고법|가법|행법|회생법|지방검찰청|검찰청|지검)/g,
    " ",
  );
  return [...branchOnlyText.matchAll(/[가-힣]{2,}지원/g)]
    .map((m) => normalizeCourtAlias(m[0]))
    .filter(Boolean);
}

function matchCourtPart(a, b) {
  const leftBranches = extractCourtBranchNames(a);
  const rightBranches = extractCourtBranchNames(b);
  if (leftBranches.length || rightBranches.length) {
    return leftBranches.some((left) =>
      rightBranches.some((right) => left === right || left.includes(right) || right.includes(left))
    );
  }

  const left = normalizeCourtAlias(a || "");
  const right = normalizeCourtAlias(b || "");
  if (left.length < 4 || right.length < 4) return false;
  return left.includes(right) || right.includes(left);
}

function extractEventCaseNumber(summary, lbox) {
  return lbox?.caseNumber || (summary.match(CASE_NUM_EXTRACT) || [])[1] || "";
}

function partyMatchesEvent(lbox, caseObj) {
  const eventParty = lbox?.client || "";
  if (!eventParty) return false;
  const caseParties = [caseObj?.client, caseObj?.opponent].filter(Boolean);
  if (caseParties.some((party) => matchTextPart(eventParty, party, 2))) return true;
  // 기존 데이터에 상대방/의뢰인 필드가 비어 있는 경우를 위한 약한 보조 기준.
  return matchTextPart(eventParty, caseObj?.title, 2);
}

export function scoreLboxCaseMatch(lbox, summary, caseObj) {
  const eventCaseNumber = extractEventCaseNumber(summary, lbox);
  const caseNumberMatch = !!eventCaseNumber && matchTextPart(eventCaseNumber, caseObj?.caseNumber, 4);
  const courtMatch = !!lbox?.court && matchCourtPart(lbox.court, caseObj?.court);
  const partyMatch = partyMatchesEvent(lbox, caseObj);
  const score = [courtMatch, caseNumberMatch, partyMatch].filter(Boolean).length;
  return { score, courtMatch, caseNumberMatch, partyMatch };
}

export function findStrictLboxCaseMatch(lbox, summary, cases = []) {
  const eventCaseNumber = extractEventCaseNumber(summary, lbox);
  const candidates = cases
    .filter((c) => c?.status !== "종결")
    .map((caseObj) => ({ caseObj, ...scoreLboxCaseMatch(lbox, summary, caseObj) }))
    .filter((m) => m.caseNumberMatch);

  if (!eventCaseNumber) return { caseObj: null, candidates, reason: "일정에서 사건번호를 찾을 수 없음" };
  if (candidates.length === 0) return { caseObj: null, candidates, reason: "사건번호가 일치하는 사건 없음" };

  return { caseObj: candidates[0].caseObj, candidates, reason: "" };
}

function buildManualCalendarEvent(ev, lbox, reason) {
  const summary = ev.summary || "";
  const date = ev.start?.date || (ev.start?.dateTime?.split("T")[0]) || "";
  const time = lbox?.time || (ev.start?.dateTime
    ? new Date(ev.start.dateTime).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })
    : "");
  return {
    id: ev.id || `${summary}-${date}-${time}`,
    event: ev,
    summary,
    date,
    time,
    court: lbox?.court || "",
    caseNumber: extractEventCaseNumber(summary, lbox),
    party: lbox?.client || "",
    reason,
  };
}

export function mergeCalendarEventIntoCase(caseObj, ev, { today, makeId = () => Date.now() + Math.floor(Math.random() * 10000) } = {}) {
  const summary = ev.summary || "";
  const eventDate = ev.start?.date || (ev.start?.dateTime?.split("T")[0]) || "";
  const eventTime = ev.start?.dateTime
    ? new Date(ev.start.dateTime).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })
    : "";
  const lbox = parseLboxEvent(summary);
  const hType = lbox ? lbox.hearingType : extractHearingType(summary);
  const hearingType = hType ? hType + "기일" : "기일";
  const locationInfo = lbox ? (lbox.location ? `${lbox.court} ${lbox.location}` : lbox.court) : "";
  const hearingTime = lbox?.time || eventTime;
  const dateForLog = today || new Date().toISOString().split("T")[0];

  const ref = { ...caseObj };
  const hearings = Array.isArray(ref.hearings) ? ref.hearings : [];
  const nextHearing = {
    id: makeId(),
    date: eventDate,
    time: hearingTime,
    type: hearingType,
    result: locationInfo,
    fromCalendar: true,
    calendarEventId: ev.id,
  };

  const existingIndex = hearings.findIndex(h =>
    (ev.id && h.calendarEventId === ev.id) ||
    (h.date === eventDate && h.type === hearingType && (h.time || "") === (hearingTime || ""))
  );

  if (existingIndex >= 0) {
    const existing = hearings[existingIndex];
    const changed =
      existing.date !== nextHearing.date ||
      (existing.time || "") !== (nextHearing.time || "") ||
      existing.type !== nextHearing.type ||
      (existing.result || "") !== (nextHearing.result || "");

    if (!changed) return { caseObj: ref, added: false, updated: false };

    const updatedHearings = [...hearings];
    updatedHearings[existingIndex] = { ...existing, ...nextHearing, id: existing.id || nextHearing.id };
    return { caseObj: { ...ref, hearings: updatedHearings }, added: false, updated: true };
  }

  const memoContent = `• ${hearingType} ${eventDate}${hearingTime ? ` ${hearingTime}` : ""}${locationInfo ? `\n• 장소: ${locationInfo}` : ""}`;
  const nextCase = {
    ...ref,
    hearings: [...hearings, nextHearing],
    memos: [
      ...(Array.isArray(ref.memos) ? ref.memos : []),
      {
        id: makeId(),
        category: "기일메모",
        title: `${hearingType} 지정`,
        content: memoContent,
        date: dateForLog,
      },
    ],
    timeline: [
      ...(Array.isArray(ref.timeline) ? ref.timeline : []),
      {
        id: makeId(),
        date: dateForLog,
        content: `${hearingType} ${eventDate}${hearingTime ? ` ${hearingTime}` : ""} 지정${lbox?.court ? ` (${lbox.court})` : ""}`,
      },
    ],
  };

  return { caseObj: nextCase, added: true, updated: false };
}

export function syncEventsWithCases(events, cases) {
  const updates = new Map();
  let newHearingCount = 0;
  let newCaseCount = 0;
  const skippedEvents = [];
  const unmatchedEvents = [];

  const todayStr = new Date().toISOString().split("T")[0];

  console.log(`[캘린더 동기화] LBOX 이벤트 ${events.length}건 처리 시작`);

  for (const ev of events) {
    const summary = ev.summary || "";
    if (!summary.trim()) continue;

    const isLbox = isLboxEvent(ev);
    const lbox = parseLboxEvent(summary);
    const caseNum = extractEventCaseNumber(summary, lbox);

    // LBOX 일정도 아니고 사건번호·형식 정보도 없음 → 스킵
    if (!caseNum && !lbox && !isLbox) {
      skippedEvents.push(summary);
      continue;
    }

    const currentCases = cases.map((c) => updates.get(c.id) || c);
    const match = findStrictLboxCaseMatch(lbox, summary, currentCases);
    const matched = match.caseObj;

    if (!matched) {
      unmatchedEvents.push(buildManualCalendarEvent(ev, lbox, match.reason));
      skippedEvents.push(summary);
      continue;
    }

    const ref = updates.get(matched.id) || { ...matched };
    const merged = mergeCalendarEventIntoCase(ref, ev, { today: todayStr });

    if (merged.added || merged.updated) {
      updates.set(matched.id, merged.caseObj);
      if (merged.added) {
        newHearingCount++;
        console.log(`[캘린더 동기화] ✓ 기일 추가: "${summary}" → ${matched.title}`);
      } else {
        console.log(`[캘린더 동기화] ↻ 기일 업데이트: "${summary}" → ${matched.title}`);
      }
    }
  }

  if (skippedEvents.length > 0) {
    console.warn(`[캘린더 동기화] 수동 확인/매칭 실패 ${skippedEvents.length}건:`, skippedEvents);
  }
  console.log(`[캘린더 동기화] 완료: 신규 기일 ${newHearingCount}건 추가, 수동 확인 ${unmatchedEvents.length}건`);

  return { updates, newTodoCount: 0, newHearingCount, newCaseCount, skippedCount: skippedEvents.length, unmatchedEvents };
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

  // 3. 해당 tasklist의 태스크 가져오기 (완료/숨김 포함 — 기존 항목 업데이트용)
  const taskRes = await fetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${workList.id}/tasks?showCompleted=true&showHidden=true&maxResults=100`,
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

export function buildTodoFromGoogleTask(task) {
  const dueDate = task.due ? task.due.split("T")[0] : "";
  return {
    text: task.title || "",
    details: task.notes || "",
    priority: "보통",
    dueDate,
    done: task.status === "completed",
    calendarTaskId: task.id,
    fromTasks: true,
    sourceTaskList: task._listName || "",
    sourceUpdatedAt: task.updated || "",
  };
}

export function mergeTaskIntoCaseTodos(caseObj, task) {
  const nextTodo = buildTodoFromGoogleTask(task);
  const todos = [...(caseObj.todos || [])];
  const index = todos.findIndex(t => t.calendarTaskId === task.id);

  if (index >= 0) {
    todos[index] = {
      ...todos[index],
      ...nextTodo,
      id: todos[index].id,
      // Google Tasks를 원본으로 보고 완료 상태도 동기화
      done: nextTodo.done,
    };
    return { caseObj: { ...caseObj, todos }, added: false, updated: true };
  }

  todos.push({ id: Date.now() + Math.floor(Math.random() * 10000), ...nextTodo });
  return { caseObj: { ...caseObj, todos }, added: true, updated: false };
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
