import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { auth, provider, db } from "./firebase";
import { onAuthStateChanged, signOut, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch, getDoc, arrayUnion } from "firebase/firestore";
import { TYPES, STATUSES, todayStr, dday, fmtDate, emptyCase, SAMPLE_CASES } from "./utils";
import { TypeBadge } from "./components/Badges";
import LoginScreen from "./components/LoginScreen";
import StatsBar from "./components/StatsBar";
import CaseItem from "./components/CaseItem";
import OverviewTab from "./components/OverviewTab";
import TodosTab from "./components/TodosTab";
import AiParseModal from "./components/AiParseModal";
import CaseFormModal from "./components/CaseFormModal";
import { fetchCalendarEvents, syncEventsWithCases, fetchWorkCalendarEvents, syncWorkEventsWithCases, inferCaseType, fetchWorkTasks, matchTasksToCases, mergeTaskIntoCaseTodos } from "./calendarSync";
import UnmatchedTasksModal from "./components/UnmatchedTasksModal";
import { migrateLegacyData, exportToGoogleSheet } from "./migrateLegacy";
import { openSpreadsheetUrl } from "./exportOpen";
import JournalApp from "./components/journal/JournalApp";
import { fetchAllJournalEntries } from "./journalStore";
import { computeRetainerPayups } from "./caseLink";
import BriefsTab from "./components/BriefsTab";
import GlobalSearch from "./components/GlobalSearch";
import { ensureTaskCalendar, upsertTaskEvent, CalendarAuthError } from "./calendarPush";

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [cases, setCases] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [typeFilter, setTypeFilter] = useState("전체");
  const [activeTab, setActiveTab] = useState("overview");
  const [appMode, setAppMode] = useState("cases"); // cases | journal
  const [showSearch, setShowSearch] = useState(false);
  const [showAdv, setShowAdv] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editCase, setEditCase] = useState(null);
  const [showAI, setShowAI] = useState(false);
  const [mobileView, setMobileView] = useState("list");
  const [googleToken, setGoogleToken] = useState(() => sessionStorage.getItem("googleToken"));
  const [calSyncing, setCalSyncing] = useState(false);
  const [calResult, setCalResult] = useState(null);
  const [taskSyncing, setTaskSyncing] = useState(false);
  const [taskResult, setTaskResult] = useState(null);
  const [unmatchedTasks, setUnmatchedTasks] = useState(null); // null or array
  const autoCalendarSyncStarted = useRef(false);
  const autoTaskSyncStarted = useRef(false);

  // Auth 상태 감지
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // Firestore 실시간 동기화
  useEffect(() => {
    if (!user) { setCases([]); setSelectedId(null); return; }
    const colRef = collection(db, "users", user.uid, "cases");
    const unsub = onSnapshot(colRef, async (snapshot) => {
      if (snapshot.empty) {
        const batch = writeBatch(db);
        SAMPLE_CASES.forEach(c => batch.set(doc(colRef, c.id), c));
        await batch.commit();
        return;
      }
      const data = snapshot.docs.map(d => {
        const c = d.data();
        // 기존 memo(string) → memos(array) 마이그레이션
        if (!Array.isArray(c.memos)) {
          c.memos = c.memo
            ? [{ id: 1, category: "일반메모", title: "메모", content: c.memo, date: todayStr }]
            : [];
        }
        return c;
      });
      setCases(data);
      setSelectedId(prev => {
        if (prev && data.find(c => c.id === prev)) return prev;
        return data[0]?.id || null;
      });
    }, (error) => {
      console.error("Firestore 동기화 오류:", error);
    });
    return unsub;
  }, [user]);

  const selected = cases.find(c => c.id === selectedId);

  // 캘린더에서 가져온 할일 일괄 삭제 (1회 마이그레이션)
  const calTodoMigrated = useRef(false);
  useEffect(() => {
    if (!user || cases.length === 0 || calTodoMigrated.current) return;
    calTodoMigrated.current = true;
    const dirty = cases.filter(c => (c.todos || []).some(t => t.fromCalendar));
    dirty.forEach(c => {
      const cleaned = { ...c, todos: (c.todos || []).filter(t => !t.fromCalendar) };
      setDoc(doc(db, "users", user.uid, "cases", c.id), cleaned);
    });
  }, [user, cases]);

  // 사건분류 자동 재분류 (1회 마이그레이션)
  const typeReclassified = useRef(false);
  useEffect(() => {
    if (!user || cases.length === 0 || typeReclassified.current) return;
    if (localStorage.getItem("typeReclassified_v1")) { typeReclassified.current = true; return; }
    typeReclassified.current = true;
    localStorage.setItem("typeReclassified_v1", "1");

    const dirty = [];
    for (const c of cases) {
      const newType = inferCaseType(c.caseNumber, c.court, c.title);
      // 민사로 분류된 것 중 새 카테고리에 해당하는 건만 변경
      if (c.type === "민사" && newType !== "민사") {
        dirty.push({ ...c, type: newType });
      }
    }
    dirty.forEach(c => {
      setDoc(doc(db, "users", user.uid, "cases", c.id), c);
      console.log(`[사건분류] "${c.title}" 민사 → ${c.type}`);
    });
    if (dirty.length > 0) console.log(`[사건분류] ${dirty.length}건 재분류 완료`);
  }, [user, cases]);

  // 로그인/토큰 상태가 바뀌면 자동 동기화 플래그 초기화
  useEffect(() => {
    if (!user || !googleToken) {
      autoCalendarSyncStarted.current = false;
      autoTaskSyncStarted.current = false;
    }
  }, [user, googleToken]);

  // 동적 타이틀
  useEffect(() => {
    document.title = selected ? `${selected.title} — 사건 관리` : "사건 관리";
  }, [selected]);

  const filtered = useMemo(() => cases.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q || c.title.toLowerCase().includes(q) || c.client.toLowerCase().includes(q)
      || c.opponent?.toLowerCase().includes(q) || c.caseNumber?.toLowerCase().includes(q);
    const matchStatus = statusFilter === "전체" || c.status === statusFilter;
    const matchType = typeFilter === "전체" || c.type === typeFilter;
    return matchSearch && matchStatus && matchType;
  }), [cases, search, statusFilter, typeFilter]);

  // 가장 가까운 예정 기일 계산
  const nextHearing = useMemo(() => {
    let best = null;
    for (const c of cases) {
      if (c.status === "종결") continue;
      for (const h of (c.hearings || [])) {
        const d = dday(h.date);
        if (d === null || d < 0) continue;
        if (!best || d < best.dday) {
          best = { ...h, dday: d, caseTitle: c.title, caseId: c.id, client: c.client };
        }
      }
    }
    return best;
  }, [cases]);

  const saveCase = useCallback(async (c) => {
    if (!user) return;
    await setDoc(doc(db, "users", user.uid, "cases", c.id), c);
    setSelectedId(c.id);
  }, [user]);

  const deleteCase = useCallback(async (caseId) => {
    if (!user) return;
    await deleteDoc(doc(db, "users", user.uid, "cases", caseId));
    setMobileView("list");
  }, [user]);

  // 착수금 일괄 완납처리: 약정액 > 입금액인 사건 모두 paidAmount=amount (멱등)
  const bulkMarkRetainersPaid = useCallback(async () => {
    if (!user) return;
    const changed = computeRetainerPayups(cases);
    if (changed.length === 0) { alert("완납처리할 미입금 사건이 없습니다."); return; }
    if (!window.confirm(`착수금 미입금·부분입금 ${changed.length}건을 약정 착수금만큼 '입금 완료'로 일괄 처리할까요?`)) return;
    const batch = writeBatch(db);
    changed.forEach((c) => batch.set(doc(db, "users", user.uid, "cases", c.id), c));
    await batch.commit();
    alert(`${changed.length}건 착수금 완납처리 완료.`);
  }, [user, cases]);

  const applyAI = useCallback((result, matchedCase) => {
    if (matchedCase) {
      const updated = { ...matchedCase };

      const cat = result.memoCategory || "일반메모";
      const title = result.memoTitle || "AI 파싱 메모";
      const content = result.memoContent || result.memo || "";
      if (title || content) {
        updated.memos = [...(updated.memos || []), {
          id: Date.now(), category: cat, title, content, date: todayStr,
        }];
      }

      if (result.hearingDate && result.hearingType) {
        updated.hearings = [...(updated.hearings || []), {
          id: Date.now() + 1, date: result.hearingDate, time: result.hearingTime || "", type: result.hearingType, result: ""
        }];
      }

      if (result.timelineContent) {
        updated.timeline = [...(updated.timeline || []), {
          id: Date.now() + 2, date: todayStr, content: result.timelineContent
        }];
      }

      saveCase(updated);
      setSelectedId(matchedCase.id);
      setActiveTab("overview");
      setMobileView("detail");
    } else {
      const nc = emptyCase();
      if (result.caseIdentifiers?.length) nc.title = result.caseIdentifiers[0];
      if (result.memoContent || result.memo) {
        nc.memos = [{ id: Date.now(), category: result.memoCategory || "일반메모",
          title: result.memoTitle || "메모", content: result.memoContent || result.memo, date: todayStr }];
      }
      if (result.hearingDate && result.hearingType) {
        nc.hearings = [{ id: Date.now() + 1, date: result.hearingDate, time: result.hearingTime || "", type: result.hearingType, result: "" }];
      }
      setEditCase({ ...nc, _isNew: true });
      setShowForm(true);
    }
  }, [saveCase]);


  // ── 구글 캘린더 동기화 ──────────────────────────────────────────────────
  const refreshGoogleToken = useCallback(async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      const cred = GoogleAuthProvider.credentialFromResult(result);
      const t = cred?.accessToken;
      if (t) { sessionStorage.setItem("googleToken", t); setGoogleToken(t); }
      return t;
    } catch (e) { console.error("토큰 갱신 실패:", e); return null; }
  }, []);

  const syncCalendar = useCallback(async () => {
    setCalSyncing(true); setCalResult(null);
    try {
      let token = googleToken;
      let data = token ? await fetchCalendarEvents(token) : null;
      if (!data) {
        token = await refreshGoogleToken();
        if (!token) { setCalResult({ error: "Google 인증이 필요합니다." }); return; }
        data = await fetchCalendarEvents(token);
      }
      if (!data?.items) { setCalResult({ error: "캘린더 데이터를 가져올 수 없습니다." }); return; }

      const { updates, newTodoCount, newHearingCount, newCaseCount, skippedCount } = syncEventsWithCases(data.items, cases);
      for (const [, uc] of updates) await saveCase(uc);

      // 회사업무 캘린더 → 공식결과메모
      const mergedCases = cases.map(c => updates.has(c.id) ? updates.get(c.id) : c);
      const workEvents = await fetchWorkCalendarEvents(token);
      const workResult = syncWorkEventsWithCases(workEvents, mergedCases);
      for (const [, uc] of workResult.updates) await saveCase(uc);

      setCalResult({ hearings: newHearingCount || 0, newCases: newCaseCount || 0, memos: workResult.newMemoCount || 0, total: data.items.length, skipped: skippedCount || 0 });
      setTimeout(() => setCalResult(null), 4000);
    } catch (e) {
      setCalResult({ error: e.message });
    } finally { setCalSyncing(false); }
  }, [googleToken, cases, saveCase, refreshGoogleToken]);

  // ── Google Tasks 동기화 ────────────────────────────────────────────────────
  const syncTasks = useCallback(async () => {
    setTaskSyncing(true); setTaskResult(null);
    try {
      let token = googleToken;
      let tasks = token ? await fetchWorkTasks(token) : null;
      if (tasks === null) {
        token = await refreshGoogleToken();
        if (!token) { setTaskResult({ error: "Google 인증이 필요합니다." }); return; }
        tasks = await fetchWorkTasks(token);
      }
      if (tasks === null) { setTaskResult({ error: "Google Tasks 데이터를 가져올 수 없습니다." }); return; }

      const { matched, unmatched } = matchTasksToCases(tasks, cases);

      // 영구 무시 목록 로드 (기기 간 공유)
      let ignoredIds = new Set();
      try {
        const snap = await getDoc(doc(db, "users", user.uid, "meta", "taskSync"));
        if (snap.exists()) ignoredIds = new Set(snap.data().ignoredTaskIds || []);
      } catch (e) { console.warn("무시 목록 로드 실패", e); }

      // 미매칭 중 (1) 이미 완료된 할일, (2) 영구 무시한 할일 제외
      const visibleUnmatched = unmatched.filter(({ task }) =>
        task.status !== "completed" && !ignoredIds.has(task.id));

      // 자동 매칭된 항목을 사건 할 일로 추가/갱신 (Google Tasks notes 포함)
      let addedCount = 0;
      let updatedCount = 0;
      const updatedCases = new Map();
      for (const { task, caseObj } of matched) {
        const ref = updatedCases.get(caseObj.id) || { ...caseObj, todos: [...(caseObj.todos || [])] };
        const merged = mergeTaskIntoCaseTodos(ref, task);
        updatedCases.set(caseObj.id, merged.caseObj);
        if (merged.added) addedCount++;
        if (merged.updated) updatedCount++;
      }
      for (const [, uc] of updatedCases) await saveCase(uc);

      // 미매칭 태스크 모달 표시 (완료·무시 제외분만)
      if (visibleUnmatched.length > 0) {
        setUnmatchedTasks(visibleUnmatched);
      }

      setTaskResult({ added: addedCount, updated: updatedCount, unmatched: visibleUnmatched.length, total: tasks.length });
      setTimeout(() => setTaskResult(null), 4000);
    } catch (e) {
      setTaskResult({ error: e.message });
    } finally { setTaskSyncing(false); }
  }, [googleToken, cases, saveCase, refreshGoogleToken]);

  // 미매칭 할일 영구 무시 (다음 동기화부터 숨김, 기기 간 공유)
  const ignoreUnmatchedTask = useCallback(async (taskId) => {
    if (!user || !taskId) return;
    try {
      await setDoc(doc(db, "users", user.uid, "meta", "taskSync"),
        { ignoredTaskIds: arrayUnion(taskId) }, { merge: true });
    } catch (e) { console.warn("할일 무시 저장 실패", e); }
  }, [user]);

  // 미매칭 태스크를 특정 사건에 수동 추가 (추가 후엔 다시 안 뜨도록 무시 목록에도 등록)
  const addUnmatchedTaskToCase = useCallback(async (task, caseObj) => {
    const merged = mergeTaskIntoCaseTodos({ ...caseObj, todos: [...(caseObj.todos || [])] }, task);
    await saveCase(merged.caseObj);
    await ignoreUnmatchedTask(task.id);
  }, [saveCase, ignoreUnmatchedTask]);

  // ── 할일 → 구글 캘린더 쓰기 (전용 '업무 할일' 캘린더, 단방향) ──────────────
  const taskCalIdRef = useRef(null);
  const pushTaskToCalendar = useCallback(async ({ eventId, title, details, date, time }) => {
    let token = googleToken;
    if (!token) {
      token = await refreshGoogleToken();
      if (!token) throw new Error("Google 인증이 필요합니다.");
    }
    const run = async (tk) => {
      if (!taskCalIdRef.current) taskCalIdRef.current = await ensureTaskCalendar(tk);
      return upsertTaskEvent(tk, taskCalIdRef.current, { eventId, title, details, date, time });
    };
    try {
      return await run(token);
    } catch (e) {
      if (e instanceof CalendarAuthError) {
        const nt = await refreshGoogleToken();
        if (!nt) throw new Error("Google 인증 실패. 다시 로그인하세요.");
        taskCalIdRef.current = null;
        return await run(nt);
      }
      throw e;
    }
  }, [googleToken, refreshGoogleToken]);

  useEffect(() => {
    if (!user || !googleToken || cases.length === 0 || calSyncing || autoCalendarSyncStarted.current) return;
    autoCalendarSyncStarted.current = true;
    syncCalendar();
  }, [user, googleToken, cases.length, calSyncing, syncCalendar]);

  useEffect(() => {
    if (!user || !googleToken || cases.length === 0 || taskSyncing || autoTaskSyncStarted.current) return;
    autoTaskSyncStarted.current = true;
    syncTasks();
  }, [user, googleToken, cases.length, taskSyncing, syncTasks]);

  const runMigration = useCallback(async () => {
    if (!user) return;
    let token = googleToken;
    if (!token) {
      token = await refreshGoogleToken();
      if (!token) { alert("Google 인증이 필요합니다."); return; }
    }
    if (!window.confirm("구글 시트 '사건진행부'에서 민사/형사 사건을 가져옵니다. 진행하시겠습니까?")) return;
    try {
      const result = await migrateLegacyData(user.uid, token);
      alert(`민사 ${result.civil}건, 형사 ${result.criminal}건 — 총 ${result.total}건 가져오기 완료!`);
    } catch (e) {
      if (e.message.includes("인증") || e.message.includes("401")) {
        const newToken = await refreshGoogleToken();
        if (newToken) {
          const result = await migrateLegacyData(user.uid, newToken);
          alert(`민사 ${result.civil}건, 형사 ${result.criminal}건 — 총 ${result.total}건 가져오기 완료!`);
        } else { alert("Google 인증 실패. 로그아웃 후 다시 로그인하세요."); }
      } else {
        alert("가져오기 오류: " + e.message);
      }
    }
  }, [user, googleToken, refreshGoogleToken]);

  const runExport = useCallback(async () => {
    if (!user || cases.length === 0) return;
    let token = googleToken;
    if (!token) {
      token = await refreshGoogleToken();
      if (!token) { alert("Google 인증이 필요합니다."); return; }
    }
    try {
      const journalEntries = await fetchAllJournalEntries(user.uid);
      let url = await exportToGoogleSheet(token, cases, journalEntries);
      if (!url) {
        // 기존 토큰에 쓰기 권한 없음 → 새 권한으로 재인증
        provider.setCustomParameters({ prompt: "consent" });
        token = await refreshGoogleToken();
        provider.setCustomParameters({});
        if (!token) { alert("Google 인증 실패."); return; }
        url = await exportToGoogleSheet(token, cases, journalEntries);
      }
      if (url) openSpreadsheetUrl(url);
      else alert("내보내기 실패. 로그아웃 후 다시 로그인해주세요.");
    } catch (e) {
      alert("내보내기 오류: " + e.message);
    }
  }, [user, cases, googleToken, refreshGoogleToken]);

  const handleToken = useCallback((t) => {
    sessionStorage.setItem("googleToken", t); setGoogleToken(t);
  }, []);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="text-slate-400 text-sm">로딩 중...</div>
      </div>
    );
  }

  if (!user) return <LoginScreen onToken={handleToken} />;

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Apple SD Gothic Neo', 'Noto Sans KR', -apple-system, sans-serif; }
        .input { border: 1px solid #E2E8F0; border-radius: 8px; padding: 6px 10px; font-size: 13px;
          color: #334155; background: white; outline: none; width: 100%; }
        .input:focus { border-color: #818CF8; box-shadow: 0 0 0 2px rgba(99,102,241,0.15); }
        .input-sm { border: 1px solid #E2E8F0; border-radius: 6px; padding: 5px 8px; font-size: 12px;
          color: #334155; background: white; outline: none; width: 100%; }
        .input-sm:focus { border-color: #818CF8; box-shadow: 0 0 0 2px rgba(99,102,241,0.12); }
        .btn-primary { background: #4F46E5; color: white; border: none; border-radius: 8px;
          padding: 7px 14px; font-size: 13px; cursor: pointer; font-weight: 600; transition: background 0.15s; }
        .btn-primary:hover { background: #4338CA; }
        .btn-primary:disabled { background: #A5B4FC; cursor: not-allowed; }
        .btn-ghost { background: transparent; color: #64748B; border: 1px solid #E2E8F0; border-radius: 8px;
          padding: 7px 14px; font-size: 13px; cursor: pointer; transition: all 0.15s; }
        .btn-ghost:hover { background: #F8FAFC; border-color: #CBD5E1; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 3px; }
      `}</style>

      <div className="flex flex-col h-screen bg-slate-100" style={{ minHeight: "100vh" }}>
        {/* 헤더 */}
        <div style={{ background: "#0F172A" }} className="flex items-center justify-between px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)", boxShadow: "0 2px 8px rgba(99,102,241,0.4)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L3 7V9H21V7L12 2Z" fill="white" opacity="0.9"/>
                <rect x="5" y="10" width="2.5" height="8" rx="0.5" fill="white" opacity="0.8"/>
                <rect x="10.75" y="10" width="2.5" height="8" rx="0.5" fill="white" opacity="0.8"/>
                <rect x="16.5" y="10" width="2.5" height="8" rx="0.5" fill="white" opacity="0.8"/>
                <rect x="3" y="18.5" width="18" height="2.5" rx="0.5" fill="white" opacity="0.9"/>
              </svg>
            </div>
            <span className="text-white font-bold text-base tracking-tight hidden sm:inline">법률 업무 통합</span>
            <div className="flex items-center bg-slate-800 rounded-lg p-0.5 ml-1">
              {[["cases", "사건"], ["journal", "업무일지"]].map(([key, label]) => (
                <button key={key} onClick={() => setAppMode(key)}
                  className={`text-xs px-3 py-1.5 rounded-md transition-colors font-medium ${
                    appMode === key ? "bg-indigo-500 text-white" : "text-slate-400 hover:text-white"
                  }`}>{label}</button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {appMode === "cases" && (<>
            <button onClick={() => setShowSearch(true)}
              className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white border border-slate-600 hover:border-slate-400 px-3 py-1.5 rounded-lg transition-colors">
              <span>🔍</span> <span className="hidden sm:inline">검색</span>
            </button>
            <button onClick={syncCalendar} disabled={calSyncing}
              className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white border border-slate-600 hover:border-slate-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
              <span>📅</span> <span className="hidden sm:inline">{calSyncing ? "동기화 중…" : "캘린더"}</span>
            </button>
            <button onClick={syncTasks} disabled={taskSyncing}
              className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white border border-slate-600 hover:border-slate-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
              <span>📋</span> <span className="hidden sm:inline">{taskSyncing ? "동기화 중…" : "할 일"}</span>
            </button>
            <button onClick={() => setShowAI(true)}
              className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white border border-slate-600 hover:border-slate-400 px-3 py-1.5 rounded-lg transition-colors">
              <span>✨</span> <span className="hidden sm:inline">AI 파싱</span>
            </button>
            <button onClick={() => { setEditCase(null); setShowForm(true); }}
              className="flex items-center gap-1.5 text-xs bg-indigo-500 hover:bg-indigo-400 text-white px-3 py-1.5 rounded-lg transition-colors font-semibold">
              <span>+</span> <span className="hidden sm:inline">새 사건</span>
            </button>
            <div className="relative">
              <button onClick={() => setShowAdv(v => !v)}
                className="flex items-center text-xs text-slate-300 hover:text-white border border-slate-600 hover:border-slate-400 px-2.5 py-1.5 rounded-lg transition-colors"
                title="고급 (구글시트 가져오기/내보내기)">⋯</button>
              {showAdv && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowAdv(false)} />
                  <div className="absolute right-0 mt-1 w-44 bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-50">
                    <div className="px-3 py-1 text-[10px] text-slate-400 uppercase tracking-wider">구글시트 (1회성)</div>
                    <button onClick={() => { setShowAdv(false); runMigration(); }}
                      className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-2"><span>📥</span> 가져오기</button>
                    <button onClick={() => { setShowAdv(false); runExport(); }}
                      className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-2"><span>📤</span> 내보내기 (사건+업무일지)</button>
                    <div className="px-3 py-1 mt-1 border-t border-slate-100 text-[10px] text-slate-400 uppercase tracking-wider">일괄 작업</div>
                    <button onClick={() => { setShowAdv(false); bulkMarkRetainersPaid(); }}
                      className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-2"><span>💰</span> 착수금 일괄 완납처리</button>
                  </div>
                </>
              )}
            </div>
            </>)}
            <div className="flex items-center gap-2 ml-2 pl-2 border-l border-slate-600">
              <span className="text-slate-500 text-[10px] hidden sm:inline" title={`빌드: ${__BUILD_TIME__}`}>v{__BUILD_TIME__}</span>
              <span className="text-slate-300 text-xs hidden sm:inline">{user.displayName}</span>
              <button onClick={() => { sessionStorage.removeItem("googleToken"); setGoogleToken(null); signOut(auth); }}
                className="text-xs text-slate-400 hover:text-white border border-slate-600 hover:border-slate-400 px-2.5 py-1.5 rounded-lg transition-colors">
                로그아웃
              </button>
            </div>
          </div>
        </div>

        {appMode === "cases" && (<>
        {/* 캘린더 동기화 결과 알림 */}
        {calResult && (
          <div className={`text-xs px-4 py-1.5 text-center font-medium ${
            calResult.error ? "bg-red-500 text-white" : "bg-emerald-500 text-white"
          }`}>
            {calResult.error || `LBOX ${calResult.total}건 — 기일 ${calResult.hearings}건${calResult.newCases ? `, 신규사건 ${calResult.newCases}건` : ""}${calResult.memos ? `, 업무메모 ${calResult.memos}건` : ""}${calResult.skipped ? ` · 미매칭 ${calResult.skipped}건` : ""}`}
          </div>
        )}

        {/* Tasks 동기화 결과 알림 */}
        {taskResult && (
          <div className={`text-xs px-4 py-1.5 text-center font-medium ${
            taskResult.error ? "bg-red-500 text-white" : "bg-indigo-500 text-white"
          }`}>
            {taskResult.error || `할 일 ${taskResult.total}건 — 자동추가 ${taskResult.added}건${taskResult.updated ? ` · 업데이트 ${taskResult.updated}건` : ""}${taskResult.unmatched ? ` · 미매칭 ${taskResult.unmatched}건` : ""}`}
          </div>
        )}

        {/* 다음 기일 D-day 배너 */}
        {nextHearing && (
          <button onClick={() => { setSelectedId(nextHearing.caseId); setActiveTab("overview"); setMobileView("detail"); }}
            className="w-full text-left px-4 sm:px-6 py-2 flex items-center gap-3 transition-colors hover:bg-indigo-50"
            style={{ background: nextHearing.dday <= 1 ? "#FEF2F2" : nextHearing.dday <= 3 ? "#FFFBEB" : "#EEF2FF" }}>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              nextHearing.dday === 0 ? "bg-red-500 text-white" :
              nextHearing.dday <= 3 ? "bg-amber-500 text-white" :
              "bg-indigo-500 text-white"
            }`}>{nextHearing.dday === 0 ? "오늘" : `D-${nextHearing.dday}`}</span>
            <span className="text-sm font-medium text-slate-700 truncate">
              {nextHearing.type} — {nextHearing.caseTitle}
            </span>
            <span className="text-xs text-slate-400 flex-shrink-0 ml-auto">
              {fmtDate(nextHearing.date)}{nextHearing.time && ` ${nextHearing.time}`}
            </span>
          </button>
        )}

        {/* 통계 바 */}
        <StatsBar cases={cases} onSelectCase={(caseId, tab) => {
          setSelectedId(caseId);
          setActiveTab(tab || "overview");
          setMobileView("detail");
        }} />
        </>)}

        {/* 본문 */}
        {appMode === "journal" ? (
          <JournalApp user={user} cases={cases} onPushTask={pushTaskToCalendar} onUpdateCase={saveCase} />
        ) : (
        <div className="flex flex-1 min-h-0">
          {/* 좌측 목록 */}
          <div className={`${
            mobileView === "list" ? "flex" : "hidden"
          } md:flex w-full md:w-72 flex-shrink-0 bg-white border-r border-slate-100 flex-col`}>
            <div className="p-3 border-b border-slate-100">
              <input className="input" placeholder="사건명, 의뢰인, 사건번호 검색…"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="px-3 py-2 border-b border-slate-100 space-y-1.5">
              <div className="flex gap-1 flex-wrap">
                {STATUSES.map(s => (
                  <button key={s} onClick={() => setStatusFilter(s)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      statusFilter === s
                        ? "bg-slate-800 text-white border-slate-800"
                        : "text-slate-500 border-slate-200 hover:border-slate-400"
                    }`}>{s}</button>
                ))}
              </div>
              <div className="flex gap-1 flex-wrap">
                {TYPES.map(t => (
                  <button key={t} onClick={() => setTypeFilter(t)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                      typeFilter === t
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "text-slate-400 border-slate-200 hover:border-indigo-300"
                    }`}>{t}</button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="text-center text-slate-400 text-sm py-10">검색 결과 없음</div>
              ) : (
                filtered.map(c => (
                  <CaseItem key={c.id} c={c} selected={selectedId === c.id}
                    onClick={() => { setSelectedId(c.id); setActiveTab("overview"); setMobileView("detail"); }} />
                ))
              )}
            </div>
          </div>

          {/* 우측 상세 */}
          <div className={`${
            mobileView === "detail" ? "flex" : "hidden"
          } md:flex flex-1 flex-col bg-white min-w-0`}>
            {selected ? (
              <>
                <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <button
                      onClick={() => setMobileView("list")}
                      className="md:hidden text-xs text-slate-400 hover:text-slate-600 mb-2 flex items-center gap-1"
                    >
                      ← 목록으로
                    </button>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <TypeBadge type={selected.type} />
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        selected.status === "진행중"
                          ? "bg-green-50 text-green-700 border border-green-200"
                          : "bg-slate-100 text-slate-500 border border-slate-200"
                      }`}>{selected.status}</span>
                    </div>
                    <h2 className="text-lg font-bold text-slate-900 leading-snug">{selected.title}</h2>
                    {selected.caseNumber && selected.caseNumber !== "—" && (
                      <div className="text-xs text-slate-400 mt-0.5">{selected.court} · {selected.caseNumber}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => { setEditCase(selected); setShowForm(true); }}
                      className="btn-ghost text-xs">수정</button>
                    <button
                      onClick={() => {
                        if (window.confirm(`"${selected.title}" 사건을 삭제하시겠습니까?`)) {
                          deleteCase(selected.id);
                        }
                      }}
                      className="text-xs text-red-400 hover:text-red-600 border border-red-200 hover:border-red-400 rounded-lg px-3 py-1.5 transition-colors">
                      삭제
                    </button>
                  </div>
                </div>
                <div className="flex border-b border-slate-100 px-4 sm:px-6">
                  {[["overview", "개요"], ["todos", "할 일"], ["briefs", "서면"]].map(([key, label]) => (
                    <button key={key} onClick={() => setActiveTab(key)}
                      className={`py-2.5 px-1 mr-5 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === key
                          ? "border-indigo-500 text-indigo-600"
                          : "border-transparent text-slate-400 hover:text-slate-600"
                      }`}>{label}</button>
                  ))}
                </div>
                <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
                  {activeTab === "overview" && <OverviewTab c={selected} onUpdate={saveCase} />}
                  {activeTab === "todos" && <TodosTab c={selected} onUpdate={saveCase} onPushTodo={pushTaskToCalendar} />}
                  {activeTab === "briefs" && <BriefsTab c={selected} onUpdate={saveCase} />}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-300 text-sm">
                좌측에서 사건을 선택하세요
              </div>
            )}
          </div>
        </div>
        )}
      </div>
      {showSearch && (
        <GlobalSearch
          cases={cases}
          onClose={() => setShowSearch(false)}
          onOpen={(caseId, tab) => {
            setSelectedId(caseId);
            setActiveTab(tab || "overview");
            setMobileView("detail");
            setShowSearch(false);
          }}
        />
      )}
      {showAI && <AiParseModal cases={cases} onClose={() => setShowAI(false)} onApply={applyAI} />}
      {unmatchedTasks && (
        <UnmatchedTasksModal
          tasks={unmatchedTasks}
          cases={cases}
          onAddToCase={addUnmatchedTaskToCase}
          onIgnore={ignoreUnmatchedTask}
          onClose={() => setUnmatchedTasks(null)}
        />
      )}
      {showForm && (
        <CaseFormModal
          initial={editCase}
          onSave={saveCase}
          onClose={() => { setShowForm(false); setEditCase(null); }}
        />
      )}
    </>
  );
}
