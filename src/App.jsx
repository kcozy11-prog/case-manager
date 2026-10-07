import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { auth, provider, db, firebaseProjectId } from "./firebase";
import { onAuthStateChanged, signOut, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch, getDoc, getDocFromServer, getDocsFromServer, runTransaction, arrayUnion } from "firebase/firestore";
import { TYPES, todayStr, dday, fmtDate, emptyCase, SAMPLE_CASES, localDateStr } from "./utils";
import { LIST_STATUSES, filterCaseList, countCasesByListStatus, firstActiveCaseId } from "./caseList";
import { TypeBadge } from "./components/Badges";
import LoginScreen from "./components/LoginScreen";
import AppLogo from "./components/AppLogo";
import StatsBar from "./components/StatsBar";
import CaseItem from "./components/CaseItem";
import OverviewTab from "./components/OverviewTab";
import TodosTab from "./components/TodosTab";
import AiParseModal from "./components/AiParseModal";
import CaseFormModal from "./components/CaseFormModal";
import { fetchCalendarEvents, syncEventsWithCases, mergeCalendarEventIntoCase, fetchWorkCalendarEvents, syncWorkEventsWithCases, inferCaseType, fetchWorkTasks, matchTasksToCases, mergeTaskIntoCaseTodos } from "./calendarSync";
import UnmatchedTasksModal from "./components/UnmatchedTasksModal";
import UnmatchedCalendarEventsModal from "./components/UnmatchedCalendarEventsModal";
import StandaloneTodosModal from "./components/StandaloneTodosModal";
import { migrateLegacyData, exportToGoogleSheet } from "./migrateLegacy";
import { openSpreadsheetUrl } from "./exportOpen";
import JournalApp from "./components/journal/JournalApp";
import { collectAllUserData } from "./backupStore";
import RestoreModal from "./components/RestoreModal";
import { readRestoreSource, spreadsheetIdFromInput, sheetUrlFromId, restoreParamFromSearch, recentSourceList } from "./restoreSource";
import { readUserSnapshotAt, kstToReadTime } from "./pitrRead";
import { buildRestorePlan, applyPlanSelection, revertRestoreForCase, RESTORE_FIELDS } from "./restorePlan";
import { computeRetainerPayups } from "./caseLink";
import BriefsTab from "./components/BriefsTab";
import GlobalSearch from "./components/GlobalSearch";
import { ensureTaskCalendar, upsertTaskEvent, CalendarAuthError } from "./calendarPush";
import { mergeGoogleTaskIntoStandaloneTodos, readStandaloneTodos, STANDALONE_TODOS_CASE_ID } from "./standaloneTodos";
import { diffCase, applyCaseDiff, normalizeCaseDoc, stableStringify } from "./caseMerge";
import { createCaseWriter } from "./caseWriter";
import {
  planOverdueOnce, OVERDUE_ONCE_CUTOFF, buildCleanupEntry, appendCleanupEntry, newestCleanup, findCleanup, markCleanupUndone,
  hiddenTaskRecords, mergeHiddenTasks, unhideTasks, linkedTaskIds, isHiddenGoogleTask, planCleanupUndo,
} from "./overdueCleanup";

// 화면 전용 표시는 문서에 저장하지 않는다
function stripTransient(c) {
  const { _isNew, ...rest } = c || {};
  return rest;
}

// 서버의 최신 사건 문서를 읽어 이번 수정분(diff)만 얹는다.
// 트랜잭션이므로 읽은 뒤 다른 기기가 고치면 다시 읽어 얹는다 → 옛 판본으로 문서 전체를 덮어쓰지 않는다.
async function commitCaseDiff(uid, caseId, diff, newCase) {
  if (caseId === STANDALONE_TODOS_CASE_ID) {
    const ref = doc(db, "users", uid, "meta", "standaloneTodos");
    return runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const latest = { todos: readStandaloneTodos(snap.exists() ? snap.data() : null) };
      const merged = applyCaseDiff(latest, diff);
      if (stableStringify(merged.todos) === stableStringify(latest.todos)) return "unchanged";
      tx.set(ref, { todos: merged.todos, updatedAt: new Date().toISOString() }, { merge: true });
      return "saved";
    });
  }
  const ref = doc(db, "users", uid, "cases", caseId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      if (!newCase) return "missing"; // 다른 기기에서 지운 사건은 되살리지 않는다
      tx.set(ref, newCase);
      return "created";
    }
    const latest = normalizeCaseDoc(snap.data(), todayStr);
    const merged = applyCaseDiff(latest, diff);
    if (stableStringify(merged) === stableStringify(latest)) return "unchanged";
    tx.set(ref, merged);
    return "saved";
  });
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [serverCases, setServerCases] = useState([]);
  // 서버 판본을 받았는지. 기기 캐시(옛 판본일 수 있음)만 본 상태에서는 자동 동기화·일괄 정리를 하지 않는다.
  const [casesSynced, setCasesSynced] = useState(false);
  const [serverStandaloneTodos, setServerStandaloneTodos] = useState([]);
  const [writerState, setWriterState] = useState({ pending: 0, waiting: false, error: null });
  const [writerTick, setWriterTick] = useState(0);
  const writerRef = useRef(null);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("진행중"); // 진행중 | 종결 (종결 사건은 검색·종결 목록에서만)
  const [typeFilter, setTypeFilter] = useState("전체");
  const [activeTab, setActiveTab] = useState("overview");
  const [appMode, setAppMode] = useState("cases"); // cases | journal
  const [showSearch, setShowSearch] = useState(false);
  const [showAdv, setShowAdv] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showStandaloneTodos, setShowStandaloneTodos] = useState(false);
  const [editCase, setEditCase] = useState(null);
  const [showAI, setShowAI] = useState(false);
  const [showRestore, setShowRestore] = useState(false);
  const [restoreDefaultInput, setRestoreDefaultInput] = useState("");
  // 링크(?restore=시트 id)로 열면 복원 창을 그 파일로 채워 연다
  const [restoreLink, setRestoreLink] = useState(() => (typeof window === "undefined" ? "" : restoreParamFromSearch(window.location.search)));
  // 기한 지난 할 일 1회 정리 기록 (위쪽 안내줄·되돌리기)
  const [todoCleanupDoc, setTodoCleanupDoc] = useState(null);
  const [showCleanupList, setShowCleanupList] = useState(false);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  // 1회 정리 확인이 끝났는지. 끝나기 전에는 Google 할 일 자동 동기화를 시작하지 않는다
  // (동기화가 옛 화면 판본으로 계산해 방금 지운 할 일을 다시 써 넣지 않도록).
  const [overdueOnceSettled, setOverdueOnceSettled] = useState(false);
  // 앱을 연 날과 오늘이 다르면(자정을 넘김) D-day 를 맞추도록 새로고침을 권한다
  const [dayChanged, setDayChanged] = useState(false);
  const [mobileView, setMobileView] = useState("list");
  const [googleToken, setGoogleToken] = useState(() => sessionStorage.getItem("googleToken"));
  const [calSyncing, setCalSyncing] = useState(false);
  const [calResult, setCalResult] = useState(null);
  const [taskSyncing, setTaskSyncing] = useState(false);
  const [taskResult, setTaskResult] = useState(null);
  const [unmatchedTasks, setUnmatchedTasks] = useState(null); // null or array
  const [unmatchedCalendarEvents, setUnmatchedCalendarEvents] = useState(null); // null or array
  const [caseSaveMsg, setCaseSaveMsg] = useState(null); // 업무일지→사건 저장 결과 진단 배너
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

  // 사건 저장 대기열 (사건별 순서 보장 · 서버 연결 대기 · 화면 즉시 반영)
  useEffect(() => {
    if (!user) return undefined;
    const writer = createCaseWriter({
      commit: (caseId, diff, newCase) => commitCaseDiff(user.uid, caseId, diff, newCase),
      onChange: (s) => { setWriterState(s); setWriterTick((t) => t + 1); },
      isOnline: () => typeof navigator === "undefined" || navigator.onLine !== false,
    });
    writerRef.current = writer;
    const onOnline = () => writer.retryNow();
    // 서버에 아직 못 보낸 저장이 있으면 창을 닫기 전에 묻는다
    const onBeforeUnload = (e) => {
      if (writer.state().pending > 0) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("beforeunload", onBeforeUnload);
      writer.dispose();
      if (writerRef.current === writer) writerRef.current = null;
      setWriterState({ pending: 0, waiting: false, error: null });
    };
  }, [user]);

  // Firestore 실시간 동기화
  // includeMetadataChanges: 캐시 판본(fromCache)에서 서버 판본으로 넘어가는 순간을 알기 위해 켠다.
  useEffect(() => {
    setCasesSynced(false);
    if (!user) { setServerCases([]); setSelectedId(null); return; }
    const colRef = collection(db, "users", user.uid, "cases");
    let seeded = false;
    const unsub = onSnapshot(colRef, { includeMetadataChanges: true }, async (snapshot) => {
      const fromServer = !snapshot.metadata.fromCache;
      if (snapshot.empty) {
        // 서버가 '비어 있음'을 확인했을 때만 예시 사건을 넣는다 (캐시가 잠깐 비어 보이는 순간에는 넣지 않음)
        if (fromServer && !seeded) {
          seeded = true;
          const batch = writeBatch(db);
          SAMPLE_CASES.forEach(c => batch.set(doc(colRef, c.id), c));
          await batch.commit();
        }
        return;
      }
      // 기존 memo(string) → memos(array) 마이그레이션은 normalizeCaseDoc 이 맡는다
      const data = snapshot.docs.map(d => normalizeCaseDoc(d.data(), todayStr));
      const writer = writerRef.current;
      if (writer) writer.reconcile(data);
      setServerCases(data);
      if (fromServer) setCasesSynced(true);
      const visible = writer ? writer.overlay(data) : data;
      setSelectedId(prev => {
        if (prev && visible.find(c => c.id === prev)) return prev;
        return firstActiveCaseId(visible);
      });
    }, (error) => {
      console.error("Firestore 동기화 오류:", error);
    });
    return unsub;
  }, [user]);

  // 사건과 연결하지 않는 일반 할 일 실시간 동기화
  useEffect(() => {
    if (!user) { setServerStandaloneTodos([]); return; }
    const ref = doc(db, "users", user.uid, "meta", "standaloneTodos");
    const unsub = onSnapshot(ref, (snapshot) => {
      const todos = readStandaloneTodos(snapshot.data());
      if (writerRef.current) writerRef.current.reconcile([{ id: STANDALONE_TODOS_CASE_ID, todos }]);
      setServerStandaloneTodos(todos);
    }, (error) => {
      console.error("일반 할 일 동기화 오류:", error);
    });
    return unsub;
  }, [user]);

  // 화면에 보이는 사건 = 서버 판본 + 아직 서버에 반영 중인 저장분
  const cases = useMemo(
    () => (writerRef.current ? writerRef.current.overlay(serverCases) : serverCases),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [serverCases, writerTick],
  );
  const standaloneTodos = useMemo(() => {
    if (!writerRef.current) return serverStandaloneTodos;
    const [pseudo] = writerRef.current.overlay([{ id: STANDALONE_TODOS_CASE_ID, todos: serverStandaloneTodos }]);
    return Array.isArray(pseudo?.todos) ? pseudo.todos : serverStandaloneTodos;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverStandaloneTodos, writerTick]);
  const casesRef = useRef(cases);
  casesRef.current = cases;
  const standaloneTodosRef = useRef(standaloneTodos);
  standaloneTodosRef.current = standaloneTodos;

  const selected = cases.find(c => c.id === selectedId);

  // 사건 저장: next 는 저장할 사건, base 는 그 수정의 출발점(화면이 보던 판본, 새 사건이면 null).
  // 바뀐 부분만 서버 최신 문서에 얹으므로, 그 사이 다른 기기·자동 동기화가 저장한 내용이 지워지지 않는다.
  // select=false: 캘린더·할 일 자동 동기화처럼 백그라운드 저장일 때는 보고 있던 사건을 바꾸지 않는다.
  const saveCase = useCallback((next, { base, select = true } = {}) => {
    const writer = writerRef.current;
    if (!user || !writer || !next?.id) return Promise.resolve("skipped");
    const clean = stripTransient(next);
    if (select) setSelectedId(clean.id);
    const from = base === undefined ? (casesRef.current.find(x => x.id === clean.id) || null) : base;
    const work = from
      ? writer.submit(clean.id, diffCase(from, clean))
      : writer.submit(clean.id, diffCase({ id: clean.id }, clean), { newCase: clean });
    work.catch(() => {}); // 실패는 상단 배너(writerState.error)로 알린다
    return work;
  }, [user]);

  // 캘린더에서 가져온 할일 일괄 삭제 (1회 마이그레이션) — 서버 판본을 받은 뒤에만
  const calTodoMigrated = useRef(false);
  useEffect(() => {
    if (!user || !casesSynced || cases.length === 0 || calTodoMigrated.current) return;
    calTodoMigrated.current = true;
    const dirty = cases.filter(c => (c.todos || []).some(t => t.fromCalendar));
    dirty.forEach(c => {
      saveCase({ ...c, todos: (c.todos || []).filter(t => !t.fromCalendar) }, { base: c, select: false });
    });
  }, [user, casesSynced, cases, saveCase]);

  // 사건분류 자동 재분류 (1회 마이그레이션) — 서버 판본을 받은 뒤에만
  const typeReclassified = useRef(false);
  useEffect(() => {
    if (!user || !casesSynced || cases.length === 0 || typeReclassified.current) return;
    if (localStorage.getItem("typeReclassified_v1")) { typeReclassified.current = true; return; }
    typeReclassified.current = true;
    localStorage.setItem("typeReclassified_v1", "1");

    let count = 0;
    for (const c of cases) {
      const newType = inferCaseType(c.caseNumber, c.court, c.title);
      // 민사로 분류된 것 중 새 카테고리에 해당하는 건만 변경
      if (c.type === "민사" && newType !== "민사") {
        saveCase({ ...c, type: newType }, { base: c, select: false });
        console.log(`[사건분류] "${c.title}" 민사 → ${newType}`);
        count++;
      }
    }
    if (count > 0) console.log(`[사건분류] ${count}건 재분류 완료`);
  }, [user, casesSynced, cases, saveCase]);

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

  // 기본은 진행 중 사건만. 종결 사건은 '종결' 목록을 고르거나 검색할 때만 보인다.
  const filtered = useMemo(
    () => filterCaseList(cases, { search, status: statusFilter, type: typeFilter }),
    [cases, search, statusFilter, typeFilter],
  );
  const statusCounts = useMemo(() => countCasesByListStatus(cases), [cases]);
  const searching = search.trim().length > 0;

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

  // 일반 할 일 저장: base 는 그 수정의 출발점(화면이 보던 목록). 바뀐 할 일만 서버 최신 목록에 얹는다.
  const saveStandaloneTodos = useCallback((standaloneCase, base) => {
    const writer = writerRef.current;
    if (!user || !writer) return Promise.resolve("skipped");
    const before = { id: STANDALONE_TODOS_CASE_ID, todos: Array.isArray(base?.todos) ? base.todos : standaloneTodosRef.current };
    const after = { id: STANDALONE_TODOS_CASE_ID, todos: Array.isArray(standaloneCase?.todos) ? standaloneCase.todos : [] };
    const work = writer.submit(STANDALONE_TODOS_CASE_ID, diffCase(before, after));
    work.catch(() => {});
    return work;
  }, [user]);

  // 업무일지 → 사건 기록 전용 저장: 서버 반영(트랜잭션 완료)을 확인해 결과를 배너로 알린다.
  //  - 서버에 닿지 않으면 저장 대기열이 연결될 때까지 들고 있다가 자동으로 보낸다(10초 넘으면 대기 안내).
  //  - base: 일지에서 기록을 만들 때 출발한 사건 판본 (없으면 현재 화면 판본)
  const saveCaseFromJournal = useCallback(async (c, base) => {
    if (!user) { setCaseSaveMsg({ type: "err", text: "로그인이 필요합니다. 로그아웃 후 다시 로그인하세요." }); throw new Error("로그인 필요"); }
    setCaseSaveMsg({ type: "pending", text: `사건 "${c.title || c.id}" 저장 확인 중…` });
    const work = saveCase(c, { base, select: true });
    const outcome = await Promise.race([
      work.then((result) => ({ result }), (error) => ({ error })),
      new Promise((res) => setTimeout(() => res({ timeout: true }), 10000)),
    ]);
    if (outcome.error) {
      setCaseSaveMsg({ type: "err", text: `✗ 서버 저장 실패: ${outcome.error.code || outcome.error.message}. 권한·문서 크기(1MB)를 확인하세요.` });
      throw outcome.error;
    }
    if (outcome.timeout) {
      setCaseSaveMsg({ type: "warn", text: "⏱ 서버 연결 대기 중(10초 초과). 연결되면 자동으로 저장합니다. 이 창을 닫지 마세요." });
      return;
    }
    if (outcome.result === "missing") {
      setCaseSaveMsg({ type: "err", text: "✗ 서버에 사건 문서가 없습니다(다른 기기에서 삭제되었을 수 있음)." });
      throw new Error("사건 문서 없음");
    }
    setCaseSaveMsg({ type: "ok", text: `✓ 사건 "${c.title || c.id}"에 저장 완료 (서버 확인됨)` });
  }, [user, saveCase]);

  const deleteCase = useCallback(async (caseId) => {
    if (!user) return;
    if (writerRef.current) writerRef.current.dropCase(caseId);
    await deleteDoc(doc(db, "users", user.uid, "cases", caseId));
    setMobileView("list");
  }, [user]);

  // 착수금 일괄 완납처리: 약정액 > 입금액인 사건 모두 paidAmount=amount (멱등)
  const bulkMarkRetainersPaid = useCallback(async () => {
    if (!user) return;
    const changed = computeRetainerPayups(cases);
    if (changed.length === 0) { alert("완납처리할 미입금 사건이 없습니다."); return; }
    if (!window.confirm(`착수금 미입금·부분입금 ${changed.length}건을 약정 착수금만큼 '입금 완료'로 일괄 처리할까요?`)) return;
    const byId = new Map(cases.map((c) => [c.id, c]));
    const works = changed.map((c) => saveCase(c, { base: byId.get(c.id) || null, select: false }));
    const outcome = await Promise.race([
      Promise.allSettled(works).then((rs) => rs.filter((r) => r.status === "rejected").length),
      new Promise((res) => setTimeout(() => res(-1), 15000)),
    ]);
    if (outcome === -1) alert(`${changed.length}건 완납처리를 저장 중입니다. 서버 연결이 확인되면 자동으로 반영됩니다.`);
    else if (outcome > 0) alert(`${changed.length}건 중 ${outcome}건 저장 실패. 상단 안내를 확인하세요.`);
    else alert(`${changed.length}건 착수금 완납처리 완료.`);
  }, [user, cases, saveCase]);

  // ── 기한 지난 할 일 1회 정리 (2026. 10. 7. 요청) ──────────────────────────
  // 사건·일반 할 일마다 바뀐 판본을 저장한다(바뀐 부분만 서버 최신 문서에 얹음).
  // 연결이 느리면 15초 뒤 결과를 먼저 돌려주고, 저장은 대기열이 이어서 한다.
  const saveTodoChanges = useCallback(async (changes) => {
    const works = changes.map((ch) => (ch.standalone
      ? saveStandaloneTodos({ todos: ch.next.todos }, { todos: ch.base.todos })
      : saveCase(ch.next, { base: ch.base, select: false })));
    return Promise.race([
      Promise.allSettled(works).then((rs) => ({ failed: rs.filter((r) => r.status === "rejected" || r.value === "missing").length })),
      new Promise((res) => setTimeout(() => res({ failed: 0, pending: true }), 15000)),
    ]);
  }, [saveCase, saveStandaloneTodos]);

  const todoCleanupRefs = useCallback(() => ({
    log: doc(db, "users", user.uid, "meta", "todoCleanup"),
    taskSync: doc(db, "users", user.uid, "meta", "taskSync"),
  }), [user]);

  // 요청 당시 기한이 지난 미완료 할 일을 계정당 한 번만 지운다(기준일 OVERDUE_ONCE_CUTOFF, 상시 기능 아님).
  //  - 기기 캐시가 아니라 서버 판본을 직접 읽어 계산한다.
  //  - 되돌리기 기록과 '정리함' 표시를 한 트랜잭션으로 먼저 남긴다. 다른 기기가 먼저 했으면 하지 않는다.
  //  - Google 할 일에서 온 항목은 숨김 기록을 남겨 다음 동기화 때 다시 들어오지 않게 한다.
  const runOverdueOnce = useCallback(async () => {
    if (!user) return null;
    const refs = todoCleanupRefs();
    const first = await getDocFromServer(refs.log);
    if (first.exists() && first.data().overdueOnce) return null;
    const [casesSnap, standaloneSnap] = await Promise.all([
      getDocsFromServer(collection(db, "users", user.uid, "cases")),
      getDocFromServer(doc(db, "users", user.uid, "meta", "standaloneTodos")),
    ]);
    const casesNow = casesSnap.docs.map((d) => normalizeCaseDoc({ ...d.data(), id: d.id }, todayStr));
    const standaloneNow = readStandaloneTodos(standaloneSnap.exists() ? standaloneSnap.data() : null);
    const { changes } = planOverdueOnce(casesNow, standaloneNow, OVERDUE_ONCE_CUTOFF);
    const at = new Date().toISOString();
    const entry = changes.length ? buildCleanupEntry(changes, at) : null;
    const hidden = entry ? hiddenTaskRecords(entry) : [];
    const claimed = await runTransaction(db, async (tx) => {
      const logSnap = await tx.get(refs.log);
      const data = logSnap.exists() ? logSnap.data() : {};
      if (data.overdueOnce) return false; // 다른 기기가 먼저 정리함
      const syncSnap = hidden.length ? await tx.get(refs.taskSync) : null;
      tx.set(refs.log, {
        ...(entry ? { entries: appendCleanupEntry(data.entries, entry) } : {}),
        overdueOnce: { at, cutoff: OVERDUE_ONCE_CUTOFF, count: entry ? entry.items.length : 0 },
        updatedAt: at,
      }, { merge: true });
      if (syncSnap) {
        tx.set(refs.taskSync, { deletedTasks: mergeHiddenTasks(syncSnap.exists() ? syncSnap.data().deletedTasks : [], hidden) }, { merge: true });
      }
      return true;
    });
    if (!claimed || !entry) return null;
    return saveTodoChanges(changes);
  }, [user, todoCleanupRefs, saveTodoChanges]);

  const overdueOnceStarted = useRef(false);
  useEffect(() => {
    if (!user || !casesSynced || overdueOnceStarted.current) return;
    overdueOnceStarted.current = true;
    runOverdueOnce()
      .catch((e) => console.warn("기한 지난 할 일 1회 정리 실패(다음에 앱을 열 때 다시 시도):", e))
      .finally(() => setOverdueOnceSettled(true));
  }, [user, casesSynced, runOverdueOnce]);

  // 정리 기록 구독: 가장 최근 정리를 위쪽 안내줄로 보여 준다(닫거나 되돌리기 전까지, 모든 기기에서)
  useEffect(() => {
    if (!user) { setTodoCleanupDoc(null); return undefined; }
    return onSnapshot(doc(db, "users", user.uid, "meta", "todoCleanup"),
      (snap) => setTodoCleanupDoc(snap.exists() ? snap.data() : null),
      (e) => console.warn("정리 기록 동기화 오류:", e));
  }, [user]);
  const cleanupNotice = useMemo(() => {
    const newest = newestCleanup(todoCleanupDoc?.entries);
    if (!newest || newest.undoneAt || todoCleanupDoc?.noticeClosedFor === newest.at) return null;
    return newest;
  }, [todoCleanupDoc]);

  // 정리 되돌리기: 지운 할 일을 원래 사건(또는 일반 할 일)에 다시 넣는다. 이미 있는 것은 넣지 않는다.
  const undoCleanupEntry = useCallback(async (at) => {
    if (!user) throw new Error("로그인이 필요합니다.");
    if (!casesSynced) throw new Error("서버 데이터를 확인하는 중입니다. 잠시 뒤 다시 시도해 주세요.");
    const refs = todoCleanupRefs();
    const snap = await getDocFromServer(refs.log);
    const entry = findCleanup(snap.exists() ? snap.data().entries : [], at);
    if (!entry || entry.undoneAt) return null;
    const { changes, missing, present, taskIds } = planCleanupUndo(casesRef.current, standaloneTodosRef.current, entry);
    const saved = changes.length ? await saveTodoChanges(changes) : { failed: 0 };
    const undoneAt = new Date().toISOString();
    await runTransaction(db, async (tx) => {
      const logSnap = await tx.get(refs.log);
      const syncSnap = taskIds.length ? await tx.get(refs.taskSync) : null;
      tx.set(refs.log, { entries: markCleanupUndone(logSnap.exists() ? logSnap.data().entries : [], at, undoneAt), updatedAt: undoneAt }, { merge: true });
      if (syncSnap && syncSnap.exists()) {
        tx.set(refs.taskSync, { deletedTasks: unhideTasks(syncSnap.data().deletedTasks, taskIds, at) }, { merge: true });
      }
    });
    return { restored: changes.reduce((n, ch) => n + ch.restored.length, 0), missing, present, ...saved };
  }, [user, casesSynced, todoCleanupRefs, saveTodoChanges]);

  const undoCleanupNotice = useCallback(async () => {
    if (!cleanupNotice || cleanupBusy) return;
    if (!window.confirm(`정리한 할 일 ${(cleanupNotice.items || []).length}건을 모두 되살릴까요?`)) return;
    setCleanupBusy(true);
    try {
      const r = await undoCleanupEntry(cleanupNotice.at);
      if (!r) return;
      const extra = [r.present ? `이미 있던 ${r.present}건 제외` : "", r.missing ? `사건이 없어진 ${r.missing}건 제외` : ""].filter(Boolean).join(", ");
      setCaseSaveMsg(r.failed
        ? { type: "err", text: `되살린 할 일 중 ${r.failed}곳을 저장하지 못했습니다. 새로고침해 확인해 주세요.` }
        : { type: r.pending ? "warn" : "ok", text: `할 일 ${r.restored}건을 되살렸습니다${extra ? `(${extra})` : ""}.${r.pending ? " 서버 연결이 느려 저장을 이어서 진행합니다." : ""}` });
    } catch (e) {
      setCaseSaveMsg({ type: "err", text: `되돌리기 실패: ${e.message || e}` });
    } finally {
      setCleanupBusy(false);
    }
  }, [cleanupNotice, cleanupBusy, undoCleanupEntry]);

  const closeCleanupNotice = useCallback(() => {
    if (!user || !cleanupNotice) return;
    setShowCleanupList(false);
    setDoc(doc(db, "users", user.uid, "meta", "todoCleanup"), { noticeClosedFor: cleanupNotice.at }, { merge: true })
      .catch((e) => console.warn("안내 닫기 저장 실패", e));
  }, [user, cleanupNotice]);

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
          id: Date.now() + 2,
          date: todayStr,
          content: result.timelineContent,
          activityType: "other",
        }];
      }

      saveCase(updated, { base: matchedCase });
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

      // '다시 보지 않기'로 무시한 일정 목록 (기기 간 공유)
      let ignoredEventIds = new Set();
      try {
        const snap = await getDoc(doc(db, "users", user.uid, "meta", "calendarSync"));
        if (snap.exists()) ignoredEventIds = new Set(snap.data().ignoredEventIds || []);
      } catch (e) { console.warn("캘린더 무시 목록 로드 실패", e); }

      // 동기화가 계산에 쓴 판본(base)을 함께 넘겨, 동기화로 바뀐 부분만 서버 최신 문서에 얹는다.
      // (저장은 대기열이 사건별로 순서대로 보내므로 여기서 기다리지 않는다)
      const { updates, newHearingCount, newCaseCount, skippedCount, unmatchedEvents } = syncEventsWithCases(data.items, cases, { ignoredEventIds });
      const baseById = new Map(cases.map(c => [c.id, c]));
      for (const [id, uc] of updates) saveCase(uc, { base: baseById.get(id) || null, select: false });

      // 회사업무 캘린더 → 공식결과메모
      const mergedCases = cases.map(c => updates.has(c.id) ? updates.get(c.id) : c);
      const mergedById = new Map(mergedCases.map(c => [c.id, c]));
      const workEvents = await fetchWorkCalendarEvents(token);
      const workResult = syncWorkEventsWithCases(workEvents, mergedCases);
      for (const [id, uc] of workResult.updates) saveCase(uc, { base: mergedById.get(id) || null, select: false });

      if (unmatchedEvents?.length > 0) {
        setUnmatchedCalendarEvents(unmatchedEvents);
      }

      setCalResult({ hearings: newHearingCount || 0, newCases: newCaseCount || 0, memos: workResult.newMemoCount || 0, total: data.items.length, skipped: skippedCount || 0, manual: unmatchedEvents?.length || 0 });
      setTimeout(() => setCalResult(null), 4000);
    } catch (e) {
      setCalResult({ error: e.message });
    } finally { setCalSyncing(false); }
  }, [googleToken, cases, user, saveCase, refreshGoogleToken]);

  // 수동 확인 LBOX 일정 영구 무시 (다음 동기화부터 숨김, 기기 간 공유)
  const ignoreUnmatchedCalendarEvent = useCallback(async (eventId) => {
    if (!user || !eventId) return;
    try {
      await setDoc(doc(db, "users", user.uid, "meta", "calendarSync"),
        { ignoredEventIds: arrayUnion(eventId) }, { merge: true });
    } catch (e) { console.warn("캘린더 일정 무시 저장 실패", e); }
  }, [user]);

  // 수동 확인 LBOX 일정을 선택한 사건에 기일로 추가
  const addUnmatchedCalendarEventToCase = useCallback(async (calendarItem, caseObj) => {
    const ev = calendarItem?.event || calendarItem;
    if (!ev || !caseObj) return;
    const merged = mergeCalendarEventIntoCase({ ...caseObj, hearings: [...(caseObj.hearings || [])], memos: [...(caseObj.memos || [])], timeline: [...(caseObj.timeline || [])] }, ev);
    saveCase(merged.caseObj, { base: caseObj });
  }, [saveCase]);

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

      // 영구 무시 목록·앱에서 지운 Google 할 일 기록 로드 (기기 간 공유)
      let ignoredIds = new Set();
      let deletedTasks = [];
      try {
        const snap = await getDoc(doc(db, "users", user.uid, "meta", "taskSync"));
        if (snap.exists()) {
          ignoredIds = new Set(snap.data().ignoredTaskIds || []);
          deletedTasks = snap.data().deletedTasks || [];
        }
      } catch (e) { console.warn("무시 목록 로드 실패", e); }
      // 앱에서 지운 Google 할 일은 다시 가져오지 않는다 (Google 쪽에서 기한을 바꾸면 다시 가져온다)
      const linkedIds = linkedTaskIds(cases, standaloneTodos);
      const liveTasks = tasks.filter(task => !isHiddenGoogleTask(task, deletedTasks, linkedIds));

      let tasksForCaseMatching = liveTasks;
      let standaloneAddedCount = 0;
      let standaloneUpdatedCount = 0;
      const standaloneTaskIds = new Set((standaloneTodos || []).map(t => t.calendarTaskId).filter(Boolean));
      if (standaloneTaskIds.size > 0) {
        let nextStandaloneTodos = standaloneTodos;
        for (const task of liveTasks) {
          if (!task.id || !standaloneTaskIds.has(task.id)) continue;
          const merged = mergeGoogleTaskIntoStandaloneTodos(nextStandaloneTodos, task);
          nextStandaloneTodos = merged.todos;
          if (merged.added) standaloneAddedCount++;
          if (merged.updated) standaloneUpdatedCount++;
        }
        if (standaloneAddedCount || standaloneUpdatedCount) {
          saveStandaloneTodos({ todos: nextStandaloneTodos }, { todos: standaloneTodos });
        }
        tasksForCaseMatching = liveTasks.filter(task => !standaloneTaskIds.has(task.id));
      }

      const { matched, unmatched } = matchTasksToCases(tasksForCaseMatching, cases);

      // 미매칭 중 (1) 이미 완료된 할일, (2) 영구 무시한 할일 제외
      const visibleUnmatched = unmatched.filter(({ task }) =>
        task.status !== "completed" && !ignoredIds.has(task.id));

      // 자동 매칭된 항목을 사건 할 일로 추가/갱신 (Google Tasks notes 포함)
      let addedCount = 0;
      let updatedCount = 0;
      const updatedCases = new Map();
      for (const { task, caseObj } of matched) {
        const ref = updatedCases.get(caseObj.id) || caseObj;
        const merged = mergeTaskIntoCaseTodos(ref, task);
        if (merged.added) addedCount++;
        if (merged.updated) updatedCount++;
        // 바뀐 것이 없으면 저장하지 않는다 (매번 연결된 사건 전체를 다시 저장하던 문제)
        if (merged.added || merged.updated) updatedCases.set(caseObj.id, merged.caseObj);
      }
      const taskBaseById = new Map(cases.map(c => [c.id, c]));
      for (const [id, uc] of updatedCases) saveCase(uc, { base: taskBaseById.get(id) || null, select: false });

      // 미매칭 태스크 모달 표시 (완료·무시 제외분만)
      if (visibleUnmatched.length > 0) {
        setUnmatchedTasks(visibleUnmatched);
      }

      setTaskResult({
        added: addedCount + standaloneAddedCount,
        updated: updatedCount + standaloneUpdatedCount,
        unmatched: visibleUnmatched.length,
        total: tasks.length,
      });
      setTimeout(() => setTaskResult(null), 4000);
    } catch (e) {
      setTaskResult({ error: e.message });
    } finally { setTaskSyncing(false); }
  }, [googleToken, cases, standaloneTodos, user, saveCase, saveStandaloneTodos, refreshGoogleToken]);

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
    saveCase(merged.caseObj, { base: caseObj });
    await ignoreUnmatchedTask(task.id);
  }, [saveCase, ignoreUnmatchedTask]);

  // 미매칭 태스크를 사건과 연결하지 않는 일반 할 일로 추가
  const addUnmatchedTaskToStandalone = useCallback(async (task) => {
    const merged = mergeGoogleTaskIntoStandaloneTodos(standaloneTodos, task);
    saveStandaloneTodos({ todos: merged.todos }, { todos: standaloneTodos });
    await ignoreUnmatchedTask(task.id);
  }, [standaloneTodos, saveStandaloneTodos, ignoreUnmatchedTask]);

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
    // 자동 동기화는 서버 판본을 받은 뒤에만 시작한다 (오래된 기기 캐시로 계산해 저장하지 않도록)
    if (!user || !googleToken || !casesSynced || cases.length === 0 || calSyncing || autoCalendarSyncStarted.current) return;
    autoCalendarSyncStarted.current = true;
    syncCalendar();
  }, [user, googleToken, casesSynced, cases.length, calSyncing, syncCalendar]);

  useEffect(() => {
    if (!user || !googleToken || !casesSynced || !overdueOnceSettled || cases.length === 0 || taskSyncing || autoTaskSyncStarted.current) return;
    autoTaskSyncStarted.current = true;
    syncTasks();
  }, [user, googleToken, casesSynced, overdueOnceSettled, cases.length, taskSyncing, syncTasks]);

  const runMigration = useCallback(async () => {
    if (!user) return;
    let token = googleToken;
    if (!token) {
      token = await refreshGoogleToken();
      if (!token) { alert("Google 인증이 필요합니다."); return; }
    }
    if (!window.confirm("구글 시트 '사건진행부'에서 민사/형사 사건을 가져옵니다.\n이미 앱에 있는 사건은 건드리지 않고, 없는 사건만 새로 추가합니다. 진행하시겠습니까?")) return;
    const report = (result) => alert(`시트의 민사 ${result.civil}건, 형사 ${result.criminal}건 중 새 사건 ${result.added}건을 추가했습니다. (이미 있는 사건 ${result.skipped}건은 그대로 둠)`);
    try {
      report(await migrateLegacyData(user.uid, token));
    } catch (e) {
      if (e.message.includes("인증") || e.message.includes("401")) {
        const newToken = await refreshGoogleToken();
        if (newToken) {
          report(await migrateLegacyData(user.uid, newToken));
        } else { alert("Google 인증 실패. 로그아웃 후 다시 로그인하세요."); }
      } else {
        alert("가져오기 오류: " + e.message);
      }
    }
  }, [user, googleToken, refreshGoogleToken]);

  // 내보내기·복원 전 백업·복원에 쓴 파일 주소를 기억해 둔다 (복원 창의 '최근 파일' 목록, 기기 간 공유)
  const recordRestoreSource = useCallback(async ({ url, title, kind }) => {
    if (!user || !url) return;
    try {
      await setDoc(doc(db, "users", user.uid, "meta", "exports"), {
        items: arrayUnion({ url, title: title || "", kind, at: new Date().toISOString() }),
      }, { merge: true });
    } catch (e) { console.warn("[복원] 파일 목록 기록 실패", e); }
  }, [user]);

  const loadRecentSources = useCallback(async () => {
    if (!user) return [];
    const snap = await getDoc(doc(db, "users", user.uid, "meta", "exports"));
    return recentSourceList(snap.exists() ? snap.data().items : []);
  }, [user]);

  const runExport = useCallback(async () => {
    if (!user || cases.length === 0) return;
    let token = googleToken;
    if (!token) {
      token = await refreshGoogleToken();
      if (!token) { alert("Google 인증이 필요합니다."); return; }
    }
    try {
      // 서버 판본 전체를 읽어, 사람이 읽는 시트와 '복원용 원본'(숨김 시트)을 함께 만든다
      const all = await collectAllUserData(user.uid);
      const exportCases = all.cases.map(c => normalizeCaseDoc(c, todayStr));
      const exportTitle = `사건관리 내보내기 ${new Date().toLocaleDateString("ko-KR")}`;
      const options = { title: exportTitle, raw: { data: all, info: { fromServer: all.fromServer, appBuild: __BUILD_TIME__ } } };
      let url = await exportToGoogleSheet(token, exportCases, all.journal, options);
      if (!url) {
        // 기존 토큰에 쓰기 권한 없음 → 새 권한으로 재인증
        provider.setCustomParameters({ prompt: "consent" });
        token = await refreshGoogleToken();
        provider.setCustomParameters({});
        if (!token) { alert("Google 인증 실패."); return; }
        url = await exportToGoogleSheet(token, exportCases, all.journal, options);
      }
      if (url) recordRestoreSource({ url, title: exportTitle, kind: "export" });
      if (url && !all.fromServer) alert("서버에 연결되지 않아 이 기기에 저장된 사본으로 내보냈습니다. 연결된 뒤 한 번 더 내보내기를 권합니다.");
      if (url) openSpreadsheetUrl(url);
      else alert("내보내기 실패. 로그아웃 후 다시 로그인해주세요.");
    } catch (e) {
      alert("내보내기 오류: " + e.message);
    }
  }, [user, cases, googleToken, refreshGoogleToken, recordRestoreSource]);

  // ── 데이터 복원 ────────────────────────────────────────────────────────────
  // Google 토큰이 필요한 작업: 없거나 만료되면 한 번 다시 로그인해 이어서 한다
  const withGoogleToken = useCallback(async (fn) => {
    let token = googleToken || await refreshGoogleToken();
    if (!token) throw new Error("Google 인증이 필요합니다.");
    try {
      return await fn(token);
    } catch (e) {
      if (!e?.authError) throw e;
      token = await refreshGoogleToken();
      if (!token) throw new Error("Google 인증이 필요합니다.");
      return fn(token);
    }
  }, [googleToken, refreshGoogleToken]);

  const readServerSnapshot = useCallback(async () => {
    try {
      const all = await collectAllUserData(user.uid, { requireServer: true });
      return { ...all, cases: all.cases.map((c) => normalizeCaseDoc(c, todayStr)) };
    } catch (e) {
      throw new Error(`서버에서 지금 데이터를 읽지 못했습니다(${e?.code || e?.message || e}). 서버에 연결되어 있어야 복원할 수 있습니다.`);
    }
  }, [user]);

  // 지난 시점(한국시간 날짜·시각)의 서버 데이터와 지금을 비교한다 (Firestore 과거 판본 조회)
  const analyzeRestoreAt = useCallback(async (dateStr, timeStr, { includeCrossCheck = true } = {}) => {
    if (!user) throw new Error("로그인이 필요합니다.");
    const readTime = kstToReadTime(dateStr, timeStr);
    if (!readTime) throw new Error("날짜와 시각을 확인해 주세요.");
    if (Date.parse(readTime) >= Date.now() - 60000) throw new Error("지난 시각을 골라 주세요(지금보다 1분 이상 앞선 시각).");
    const idToken = await user.getIdToken();
    const snapshot = await readUserSnapshotAt({ projectId: firebaseProjectId, uid: user.uid, idToken, readTime });
    const current = await readServerSnapshot();
    const plan = buildRestorePlan(
      { ...snapshot, cases: snapshot.cases.map((c) => normalizeCaseDoc(c, todayStr)) },
      { cases: current.cases, journal: current.journal },
      { ignoreTitles: SAMPLE_CASES.map((c) => c.title), includeCrossCheck },
    );
    const [y, m, d] = dateStr.split("-").map(Number);
    return { plan, label: `${y}. ${m}. ${d}. ${timeStr} 시점`, kind: "pitr" };
  }, [user, readServerSnapshot]);

  // 내보내기 파일(주소)과 지금 서버 데이터를 비교해 복원 후보를 만든다. 주소가 없으면 업무일지 기록만 대조.
  const analyzeRestore = useCallback(async (input, { includeCrossCheck = true } = {}) => {
    if (!user) throw new Error("로그인이 필요합니다.");
    let source = null;
    if (String(input || "").trim()) {
      const id = spreadsheetIdFromInput(input);
      if (!id) throw new Error("구글 시트 주소(https://docs.google.com/spreadsheets/d/…)를 확인해 주세요.");
      source = await withGoogleToken((token) => readRestoreSource(token, id));
      try { localStorage.setItem("restoreSourceUrl", sheetUrlFromId(id)); } catch { /* 저장 못 해도 진행 */ }
      recordRestoreSource({ url: sheetUrlFromId(id), title: source.fileTitle, kind: "source" });
    }
    const current = await readServerSnapshot();
    const snapshot = source ? source.snapshot : { source: "none", cases: [], journal: {} };
    const plan = buildRestorePlan(snapshot, { cases: current.cases, journal: current.journal }, {
      ignoreTitles: SAMPLE_CASES.map((c) => c.title),
      includeCrossCheck: !source || includeCrossCheck,
    });
    return { plan, label: source ? source.fileTitle : "업무일지 기록", kind: source ? source.kind : "journal" };
  }, [user, withGoogleToken, readServerSnapshot, recordRestoreSource]);

  // 고른 후보를 적용: ① 지금 데이터 전체를 백업 파일로 저장(실패하면 중단) ② 사건마다 고른 항목만 서버 최신 문서에 얹음
  // ③ 없어진 날짜의 업무일지만 새로 씀 ④ 되돌리기용 기록을 남김
  const applyRestore = useCallback(async (bundle, selectedIds, targetFor = {}) => {
    if (!user) throw new Error("로그인이 필요합니다.");
    const stamp = new Date();
    const at = stamp.toISOString();
    const all = await readServerSnapshot();
    const backupTitle = `사건관리 복원 전 백업 ${stamp.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`;
    let backupUrl = null;
    try {
      backupUrl = await withGoogleToken(async (token) => {
        const url = await exportToGoogleSheet(token, all.cases, all.journal, {
          raw: { data: all, info: { fromServer: true, appBuild: __BUILD_TIME__ } },
          title: backupTitle,
        });
        if (!url) throw Object.assign(new Error("Google 시트 권한이 필요합니다."), { authError: true });
        return url;
      });
    } catch (e) {
      throw new Error(`복원 전 백업을 만들지 못해 복원을 멈췄습니다: ${e.message || e}`);
    }
    recordRestoreSource({ url: backupUrl, title: backupTitle, kind: "backup" });

    let seq = Date.now();
    const { changes, journal } = applyPlanSelection(bundle.plan, selectedIds, all.cases, {
      makeId: () => ++seq, now: at, label: bundle.label, emptyCase, targetFor,
    });
    // 저장은 대기열이 서버 최신 문서에 얹는다. 연결이 끊겨 오래 걸리면 1분 뒤에는 결과를 먼저 보여 준다(대기열이 이어서 저장).
    const withTimeout = (work) => Promise.race([work, new Promise((res) => setTimeout(() => res("pending"), 60000))]);
    const results = await Promise.allSettled(changes.map((ch) => withTimeout(saveCase(ch.next, { base: ch.base, select: false }))));
    const failed = results.filter((r) => r.status === "rejected" || r.value === "missing").length;

    let journalCount = 0;
    for (const j of journal) {
      const ref = doc(db, "users", user.uid, "journal", j.date);
      const written = await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists()) return false; // 그 사이 생긴 일지는 건드리지 않는다
        tx.set(ref, { ...j.entry, _savedAt: at });
        return true;
      });
      if (written) journalCount++;
    }

    const okChanges = changes.filter((_, i) => results[i].status === "fulfilled" && results[i].value !== "missing");
    await setDoc(doc(db, "users", user.uid, "meta", "restoreLog"), {
      entries: arrayUnion({ at, source: bundle.label, backupUrl, cases: okChanges.map((c) => c.log), journalDates: journal.map((j) => j.date) }),
    }, { merge: true });

    const added = okChanges.reduce((n, c) => n + Object.values(c.log.added).reduce((m, ids) => m + ids.length, 0), 0);
    const status = okChanges.reduce((n, c) => n + c.log.status.length + Object.keys(c.log.info).length, 0);
    return { backupUrl, cases: okChanges.length, added, status, created: okChanges.filter((c) => c.created).length, journal: journalCount, failed };
  }, [user, readServerSnapshot, withGoogleToken, saveCase, recordRestoreSource]);

  const readRestoreLog = useCallback(async () => {
    const snap = await getDocFromServer(doc(db, "users", user.uid, "meta", "restoreLog"));
    const data = snap.exists() ? snap.data() : {};
    const undone = new Set(data.undone || []);
    const entries = (data.entries || []).filter((e) => e && !undone.has(e.at));
    return entries.sort((a, b) => String(a.at).localeCompare(String(b.at))).pop() || null;
  }, [user]);

  const loadLastRestore = useCallback(async () => {
    if (!user) return null;
    const last = await readRestoreLog();
    return last ? { at: last.at, source: last.source, caseCount: (last.cases || []).length, journalCount: (last.journalDates || []).length } : null;
  }, [user, readRestoreLog]);

  // 마지막 복원 되돌리기: 복원으로 더한 항목만 빼고, 바꾼 상태는 그 뒤 손대지 않은 것만 되돌린다.
  const undoLastRestore = useCallback(async () => {
    if (!user) throw new Error("로그인이 필요합니다.");
    const last = await readRestoreLog();
    if (!last) return null;
    const all = await readServerSnapshot();
    const byId = new Map(all.cases.map((c) => [c.id, c]));
    let cases = 0;
    let skipped = 0;
    for (const log of last.cases || []) {
      const cur = byId.get(log.caseId);
      if (!cur) continue;
      if (log.created) {
        // 복원으로 만든 사건: 그 뒤 새 항목을 더하지 않았을 때만 지운다
        const untouched = RESTORE_FIELDS.every((f) => (cur[f] || []).every((it) => (log.added?.[f] || []).map(String).includes(String(it?.id))));
        if (!untouched) { skipped++; continue; }
        if (writerRef.current) writerRef.current.dropCase(cur.id);
        await deleteDoc(doc(db, "users", user.uid, "cases", cur.id));
        cases++;
        continue;
      }
      saveCase(revertRestoreForCase(cur, log), { base: cur, select: false });
      cases++;
    }
    let journal = 0;
    for (const date of last.journalDates || []) {
      const ref = doc(db, "users", user.uid, "journal", date);
      const removed = await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        // 복원한 뒤 다시 저장한 일지는 지우지 않는다
        if (!snap.exists() || snap.data()?._savedAt !== last.at) return false;
        tx.delete(ref);
        return true;
      });
      if (removed) journal++; else skipped++;
    }
    await setDoc(doc(db, "users", user.uid, "meta", "restoreLog"), { undone: arrayUnion(last.at) }, { merge: true });
    return { cases, journal, skipped };
  }, [user, readRestoreLog, readServerSnapshot, saveCase]);

  const openRestore = useCallback((input = "") => {
    let fallback = "";
    try { fallback = localStorage.getItem("restoreSourceUrl") || ""; } catch { fallback = ""; }
    setRestoreDefaultInput(input || fallback);
    setShowRestore(true);
  }, []);

  // ?restore= 링크로 열었으면, 서버 데이터를 받은 뒤 복원 창을 그 파일로 채워 연다 (주소창에서는 바로 지운다)
  useEffect(() => {
    if (!restoreLink) return;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("restore")) {
        url.searchParams.delete("restore");
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      }
    } catch { /* 주소 정리 실패는 무시 */ }
    if (!user || !casesSynced) return;
    openRestore(restoreLink);
    setRestoreLink("");
  }, [restoreLink, user, casesSynced, openRestore]);

  // 자정을 넘기면 D-day·'오늘' 기준이 앱을 연 날짜에 머물러 있으므로 새로고침을 권한다
  useEffect(() => {
    const check = () => { if (localDateStr(new Date()) !== todayStr) setDayChanged(true); };
    const timer = setInterval(check, 60000);
    document.addEventListener("visibilitychange", check);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", check); };
  }, []);

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
        {/* 업무일지→사건 저장 결과 진단 배너 */}
        {caseSaveMsg && (
          <div className={`px-4 py-2 text-sm flex items-center justify-between gap-3 ${
            caseSaveMsg.type === "ok" ? "bg-emerald-600 text-white"
            : caseSaveMsg.type === "warn" ? "bg-amber-500 text-white"
            : caseSaveMsg.type === "pending" ? "bg-slate-700 text-white"
            : "bg-red-600 text-white"
          }`}>
            <span className="font-medium break-all">{caseSaveMsg.text}</span>
            <button onClick={() => setCaseSaveMsg(null)} className="flex-shrink-0 text-white/80 hover:text-white text-base leading-none px-1">✕</button>
          </div>
        )}
        {dayChanged && (
          <div className="px-4 py-2 text-sm flex items-center justify-between gap-3 bg-sky-600 text-white">
            <span className="font-medium">날짜가 바뀌었습니다. 새로고침하면 D-day와 '오늘' 기준이 오늘 날짜로 맞춰집니다.</span>
            <button onClick={() => window.location.reload()}
              className="flex-shrink-0 text-xs border border-white/60 rounded px-2 py-1 hover:bg-white/10">새로고침</button>
          </div>
        )}
        {/* 기한 지난 할 일 1회 정리 결과 (닫거나 되돌리기 전까지) */}
        {cleanupNotice && (
          <div className="px-4 py-2 text-sm bg-slate-700 text-white">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="font-medium">기한 지난 미완료 할 일 {(cleanupNotice.items || []).length}건을 정리했습니다.</span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => setShowCleanupList((v) => !v)}
                  className="text-xs border border-white/60 rounded px-2 py-1 hover:bg-white/10">{showCleanupList ? "목록 닫기" : "지운 목록"}</button>
                <button onClick={undoCleanupNotice} disabled={cleanupBusy}
                  className="text-xs border border-white/60 rounded px-2 py-1 hover:bg-white/10 disabled:opacity-50">{cleanupBusy ? "되살리는 중…" : "되돌리기"}</button>
                <button onClick={closeCleanupNotice} disabled={cleanupBusy} title="안내 닫기"
                  className="text-white/80 hover:text-white text-base leading-none px-1">✕</button>
              </div>
            </div>
            {showCleanupList && (
              <ul className="mt-2 max-h-48 overflow-y-auto text-xs text-slate-200 space-y-0.5">
                {(cleanupNotice.items || []).map((it, i) => (
                  <li key={i} className="break-words">
                    {it.caseTitle} · {it.todo?.text || "(내용 없음)"}<span className="text-slate-400"> (기한 {fmtDate(it.todo?.dueDate)})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {/* 사건 저장 대기·실패 안내 */}
        {writerState.waiting && (
          <div className="px-4 py-2 text-sm flex items-center justify-between gap-3 bg-amber-500 text-white">
            <span className="font-medium break-all">⏱ 서버 연결 대기 중 — 저장 대기 {writerState.pending}건. 연결되면 자동으로 저장합니다. 이 창을 닫지 마세요.</span>
            <button onClick={() => writerRef.current?.retryNow()}
              className="flex-shrink-0 text-xs border border-white/60 rounded px-2 py-1 hover:bg-white/10">지금 다시 시도</button>
          </div>
        )}
        {writerState.error && (
          <div className="px-4 py-2 text-sm flex items-center justify-between gap-3 bg-red-600 text-white">
            <span className="font-medium break-all">✗ 사건 저장 실패({writerState.error.code || writerState.error.message}). 새로고침해 서버에 저장된 내용을 확인해 주세요.</span>
            <button onClick={() => writerRef.current?.clearError()} className="flex-shrink-0 text-white/80 hover:text-white text-base leading-none px-1">✕</button>
          </div>
        )}
        {/* 헤더 */}
        <div style={{ background: "#0F172A" }} className="flex items-center justify-between px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3">
            <AppLogo size={32} />
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
            <button onClick={() => setShowStandaloneTodos(true)}
              className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white border border-slate-600 hover:border-slate-400 px-3 py-1.5 rounded-lg transition-colors">
              <span>📝</span> <span className="hidden sm:inline">일반 할 일</span>
            </button>
            <button onClick={syncCalendar} disabled={calSyncing || !casesSynced}
              title={casesSynced ? "LBOX·업무 캘린더 동기화" : "서버 데이터 확인 중…"}
              className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white border border-slate-600 hover:border-slate-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
              <span>📅</span> <span className="hidden sm:inline">{calSyncing ? "동기화 중…" : "캘린더"}</span>
            </button>
            <button onClick={syncTasks} disabled={taskSyncing || !casesSynced}
              title={casesSynced ? "Google Tasks 동기화" : "서버 데이터 확인 중…"}
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
                      className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                      title="옛 '사건진행부' 시트에서 앱에 없는 사건만 추가합니다 (내보내기 파일 복원은 '데이터 복원')"><span>📥</span> 사건진행부 가져오기</button>
                    <button onClick={() => { setShowAdv(false); runExport(); }}
                      className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-2"><span>📤</span> 내보내기 (사건+업무일지)</button>
                    <button onClick={() => { setShowAdv(false); openRestore(); }}
                      className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                      title="예전 내보내기 파일과 비교해 없어진 기록·되돌아간 상태를 되살립니다"><span>🛟</span> 데이터 복원</button>
                    <div className="px-3 py-1 mt-1 border-t border-slate-100 text-[10px] text-slate-400 uppercase tracking-wider">일괄 작업</div>
                    <button onClick={() => { setShowAdv(false); bulkMarkRetainersPaid(); }}
                      className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-2"><span>💰</span> 착수금 일괄 완납처리</button>
                  </div>
                </>
              )}
            </div>
            </>)}
            <div className="flex items-center gap-2 ml-2 pl-2 border-l border-slate-600">
              {!casesSynced && <span className="text-amber-300 text-[10px]" title="기기에 저장된 사본을 보여 주는 중입니다. 서버 데이터를 받으면 자동 동기화가 시작됩니다.">서버 확인 중…</span>}
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
            {calResult.error || `LBOX ${calResult.total}건 — 기일 ${calResult.hearings}건${calResult.newCases ? `, 신규사건 ${calResult.newCases}건` : ""}${calResult.memos ? `, 업무메모 ${calResult.memos}건` : ""}${calResult.manual ? ` · 수동확인 ${calResult.manual}건` : ""}${calResult.skipped && !calResult.manual ? ` · 미매칭 ${calResult.skipped}건` : ""}`}
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
        <StatsBar cases={cases} standaloneTodos={standaloneTodos} onOpenStandaloneTodos={() => setShowStandaloneTodos(true)} onSelectCase={(caseId, tab) => {
          setSelectedId(caseId);
          setActiveTab(tab || "overview");
          setMobileView("detail");
        }} />
        </>)}

        {/* 본문 */}
        {appMode === "journal" ? (
          <JournalApp user={user} cases={cases} onPushTask={pushTaskToCalendar} onUpdateCase={saveCaseFromJournal} />
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
              <div className="flex gap-1 flex-wrap items-center">
                {LIST_STATUSES.map(s => (
                  <button key={s} onClick={() => setStatusFilter(s)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      statusFilter === s && !searching
                        ? "bg-slate-800 text-white border-slate-800"
                        : "text-slate-500 border-slate-200 hover:border-slate-400"
                    }`}>{s} {statusCounts[s] ?? 0}</button>
                ))}
                {searching && <span className="text-[11px] text-slate-400 ml-1">검색 중: 종결 사건 포함</span>}
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
                <div className="text-center text-slate-400 text-sm py-10">{searching ? "검색 결과 없음" : statusFilter === "종결" ? "종결 사건이 없습니다" : "진행 중 사건이 없습니다"}</div>
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
                  {/* base: 이 화면이 보고 있던 판본 — 바뀐 부분만 서버 최신 문서에 얹는다 */}
                  {activeTab === "overview" && <OverviewTab c={selected} onUpdate={(next) => saveCase(next, { base: selected })} />}
                  {activeTab === "todos" && <TodosTab c={selected} onUpdate={(next) => saveCase(next, { base: selected })} onPushTodo={pushTaskToCalendar} onOpenBriefs={() => setActiveTab("briefs")} />}
                  {activeTab === "briefs" && <BriefsTab c={selected} onUpdate={(next) => saveCase(next, { base: selected })} />}
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
          standaloneTodos={standaloneTodos}
          onClose={() => setShowSearch(false)}
          onOpenStandaloneTodos={() => {
            setShowSearch(false);
            setShowStandaloneTodos(true);
          }}
          onOpen={(caseId, tab) => {
            setSelectedId(caseId);
            setActiveTab(tab || "overview");
            setMobileView("detail");
            setShowSearch(false);
          }}
        />
      )}
      {showAI && <AiParseModal cases={cases} onClose={() => setShowAI(false)} onApply={applyAI} />}
      {showStandaloneTodos && (
        <StandaloneTodosModal
          todos={standaloneTodos}
          onUpdate={saveStandaloneTodos}
          onPushTodo={pushTaskToCalendar}
          onClose={() => setShowStandaloneTodos(false)}
        />
      )}
      {unmatchedTasks && (
        <UnmatchedTasksModal
          tasks={unmatchedTasks}
          cases={cases}
          onAddToCase={addUnmatchedTaskToCase}
          onAddStandalone={addUnmatchedTaskToStandalone}
          onIgnore={ignoreUnmatchedTask}
          onClose={() => setUnmatchedTasks(null)}
        />
      )}
      {unmatchedCalendarEvents && (
        <UnmatchedCalendarEventsModal
          events={unmatchedCalendarEvents}
          cases={cases}
          onAddToCase={addUnmatchedCalendarEventToCase}
          onIgnore={ignoreUnmatchedCalendarEvent}
          onClose={() => setUnmatchedCalendarEvents(null)}
        />
      )}
      {showRestore && (
        <RestoreModal
          defaultInput={restoreDefaultInput}
          onAnalyze={analyzeRestore}
          onAnalyzeAt={analyzeRestoreAt}
          onApply={applyRestore}
          loadLastRestore={loadLastRestore}
          loadRecentSources={loadRecentSources}
          onUndo={undoLastRestore}
          onClose={() => setShowRestore(false)}
        />
      )}
      {showForm && (
        <CaseFormModal
          initial={editCase}
          onSave={(form) => saveCase(form, { base: editCase && editCase.id && !editCase._isNew ? editCase : null })}
          onClose={() => { setShowForm(false); setEditCase(null); }}
        />
      )}
    </>
  );
}
