import { useState, useMemo, useCallback, useEffect } from "react";
import { auth, provider, db } from "./firebase";
import { onAuthStateChanged, signOut, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch } from "firebase/firestore";
import { TYPES, STATUSES, todayStr, emptyCase, SAMPLE_CASES } from "./utils";
import { TypeBadge } from "./components/Badges";
import LoginScreen from "./components/LoginScreen";
import StatsBar from "./components/StatsBar";
import CaseItem from "./components/CaseItem";
import OverviewTab from "./components/OverviewTab";
import DocumentsTab from "./components/DocumentsTab";
import TodosTab from "./components/TodosTab";
import AiParseModal from "./components/AiParseModal";
import CaseFormModal from "./components/CaseFormModal";
import { fetchCalendarEvents, syncEventsWithCases } from "./calendarSync";

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [cases, setCases] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [typeFilter, setTypeFilter] = useState("전체");
  const [activeTab, setActiveTab] = useState("overview");
  const [showForm, setShowForm] = useState(false);
  const [editCase, setEditCase] = useState(null);
  const [showAI, setShowAI] = useState(false);
  const [mobileView, setMobileView] = useState("list");
  const [googleToken, setGoogleToken] = useState(() => sessionStorage.getItem("googleToken"));
  const [calSyncing, setCalSyncing] = useState(false);
  const [calResult, setCalResult] = useState(null);

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

  // 동적 타이틀
  useEffect(() => {
    document.title = selected ? `${selected.title} — 사건 관리` : "사건 관리";
  }, [selected]);

  const filtered = useMemo(() => cases.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q || c.title.toLowerCase().includes(q) || c.client.toLowerCase().includes(q)
      || c.caseNumber?.toLowerCase().includes(q);
    const matchStatus = statusFilter === "전체" || c.status === statusFilter;
    const matchType = typeFilter === "전체" || c.type === typeFilter;
    return matchSearch && matchStatus && matchType;
  }), [cases, search, statusFilter, typeFilter]);

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

  const applyAI = useCallback((result, matchedCase) => {
    if (matchedCase) {
      const updated = { ...matchedCase };

      // 카테고리 분류된 메모 추가
      const cat = result.memoCategory || "일반메모";
      const title = result.memoTitle || "AI 파싱 메모";
      const content = result.memoContent || result.memo || "";
      if (title || content) {
        updated.memos = [...(updated.memos || []), {
          id: Date.now(), category: cat, title, content, date: todayStr,
        }];
      }

      // 기일 추가
      if (result.hearingDate && result.hearingType) {
        updated.hearings = [...(updated.hearings || []), {
          id: Date.now() + 1, date: result.hearingDate, type: result.hearingType, result: ""
        }];
      }

      // 진행경과 추가
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
      // 매칭 사건 없이 호출된 경우 → 새 사건 등록 폼
      const nc = emptyCase();
      if (result.caseIdentifiers?.length) nc.title = result.caseIdentifiers[0];
      if (result.memoContent || result.memo) {
        nc.memos = [{ id: Date.now(), category: result.memoCategory || "일반메모",
          title: result.memoTitle || "메모", content: result.memoContent || result.memo, date: todayStr }];
      }
      if (result.hearingDate && result.hearingType) {
        nc.hearings = [{ id: Date.now() + 1, date: result.hearingDate, type: result.hearingType, result: "" }];
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

      const { updates, newTodoCount } = syncEventsWithCases(data.items, cases);
      for (const [, uc] of updates) await saveCase(uc);

      setCalResult({ count: newTodoCount, total: data.items.length });
      setTimeout(() => setCalResult(null), 4000);
    } catch (e) {
      setCalResult({ error: e.message });
    } finally { setCalSyncing(false); }
  }, [googleToken, cases, saveCase, refreshGoogleToken]);

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
            <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center text-white text-xs font-bold">⚖</div>
            <span className="text-white font-bold text-base tracking-tight hidden sm:inline">사건 관리</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={syncCalendar} disabled={calSyncing}
              className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white border border-slate-600 hover:border-slate-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
              <span>📅</span> <span className="hidden sm:inline">{calSyncing ? "동기화 중…" : "캘린더"}</span>
            </button>
            <button onClick={() => setShowAI(true)}
              className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white border border-slate-600 hover:border-slate-400 px-3 py-1.5 rounded-lg transition-colors">
              <span>✨</span> <span className="hidden sm:inline">AI 파싱</span>
            </button>
            <button onClick={() => { setEditCase(null); setShowForm(true); }}
              className="flex items-center gap-1.5 text-xs bg-indigo-500 hover:bg-indigo-400 text-white px-3 py-1.5 rounded-lg transition-colors font-semibold">
              <span>+</span> <span className="hidden sm:inline">새 사건</span>
            </button>
            <div className="flex items-center gap-2 ml-2 pl-2 border-l border-slate-600">
              <span className="text-slate-300 text-xs hidden sm:inline">{user.displayName}</span>
              <button onClick={() => { sessionStorage.removeItem("googleToken"); setGoogleToken(null); signOut(auth); }}
                className="text-xs text-slate-400 hover:text-white border border-slate-600 hover:border-slate-400 px-2.5 py-1.5 rounded-lg transition-colors">
                로그아웃
              </button>
            </div>
          </div>
        </div>

        {/* 캘린더 동기화 결과 알림 */}
        {calResult && (
          <div className={`text-xs px-4 py-1.5 text-center font-medium ${
            calResult.error ? "bg-red-500 text-white" : "bg-emerald-500 text-white"
          }`}>
            {calResult.error || `캘린더 일정 ${calResult.total}건 확인, ${calResult.count}건 할 일 추가`}
          </div>
        )}

        {/* 통계 바 */}
        <StatsBar cases={cases} />

        {/* 본문 */}
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
                  {[["overview", "개요"], ["todos", "할 일"], ["documents", "문서"]].map(([key, label]) => (
                    <button key={key} onClick={() => setActiveTab(key)}
                      className={`py-2.5 px-1 mr-5 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === key
                          ? "border-indigo-500 text-indigo-600"
                          : "border-transparent text-slate-400 hover:text-slate-600"
                      }`}>{label}</button>
                  ))}
                </div>
                <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
                  {activeTab === "overview"
                    ? <OverviewTab c={selected} onUpdate={saveCase} />
                    : activeTab === "todos"
                    ? <TodosTab c={selected} onUpdate={saveCase} />
                    : <DocumentsTab c={selected} onUpdate={saveCase} />
                  }
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-300 text-sm">
                좌측에서 사건을 선택하세요
              </div>
            )}
          </div>
        </div>
      </div>

      {showAI && <AiParseModal cases={cases} onClose={() => setShowAI(false)} onApply={applyAI} />}
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
