import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  subscribeJournal, saveJournalEntry, deleteJournalEntry, emptyJournalEntry,
} from "../../journalStore";
import {
  parseJsonArray, carryForwardTomorrowTasks, carryForwardPendingDocs,
  buildLearnedTopicGroups, searchLearnedItems, buildLearnedArchiveStats,
  buildLearnedTopicOptions,
} from "../../journalLogic";
import ChecklistEditor from "./ChecklistEditor";
import JournalMigratePanel from "./JournalMigratePanel";

const DEFAULT_TOPICS = ["법리·판례", "실무 팁", "절차적 교훈", "문서작성", "증거/입증", "상담/수임", "커뮤니케이션", "기타"];

function todayKey() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}
function fmtDateLabel(k) {
  if (!k) return "";
  const d = new Date(k + "T00:00:00");
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

// entry(문자열 필드) → form(구조화)
function entryToForm(entry, dateKey) {
  const e = entry || emptyJournalEntry(dateKey);
  return {
    entryDate: e.entryDate || dateKey,
    arrivalTime: e.arrivalTime || "",
    leaveTime: e.leaveTime || "",
    todayWork: e.todayWork || "",
    callNotes: e.callNotes || "",
    writtenDocs: e.writtenDocs || "",
    etc: e.etc || "",
    todayTasks: parseJsonArray(e.todayTasks),
    tomorrowTasks: parseJsonArray(e.tomorrowTasks),
    pendingDocItems: parseJsonArray(e.pendingDocItems),
    delegatedItems: parseJsonArray(e.delegatedItems),
    learnedItems: parseJsonArray(e.learnedItems),
    // 통과 보존 필드
    submittedDocItems: e.submittedDocItems || "",
    pendingDocCompletions: e.pendingDocCompletions || "",
    eventMemos: e.eventMemos || "",
  };
}

// form → entry(문자열 필드)
function formToEntry(form) {
  return {
    entryDate: form.entryDate,
    arrivalTime: form.arrivalTime,
    leaveTime: form.leaveTime,
    todayWork: form.todayWork,
    callNotes: form.callNotes,
    writtenDocs: form.writtenDocs,
    etc: form.etc,
    todayTasks: JSON.stringify(form.todayTasks || []),
    tomorrowTasks: JSON.stringify(form.tomorrowTasks || []),
    pendingDocItems: JSON.stringify(form.pendingDocItems || []),
    pendingDocs: (form.pendingDocItems || []).map((i) => i.text).join("\n"),
    delegatedItems: JSON.stringify(form.delegatedItems || []),
    delegated: (form.delegatedItems || []).map((i) => `${i.assignee ? i.assignee + ": " : ""}${i.text}`).join("\n"),
    learnedItems: JSON.stringify(form.learnedItems || []),
    learned: (form.learnedItems || []).map((i) => `[${i.topic}] ${i.title} — ${i.content}`).join("\n"),
    submittedDocItems: form.submittedDocItems || "",
    pendingDocCompletions: form.pendingDocCompletions || "",
    eventMemos: form.eventMemos || "",
  };
}

function entryPreview(entry) {
  const parts = [];
  if (entry.todayWork) parts.push(entry.todayWork.replace(/\n/g, " "));
  const tasks = parseJsonArray(entry.todayTasks);
  if (tasks.length) parts.push(`할일 ${tasks.length}`);
  const learned = parseJsonArray(entry.learnedItems);
  if (learned.length) parts.push(`배운점 ${learned.length}`);
  return parts.join(" · ").slice(0, 60) || "(빈 일지)";
}

const SectionLabel = ({ children, hint }) => (
  <div className="flex items-baseline gap-2 mb-1.5 mt-4">
    <h3 className="text-sm font-semibold text-slate-700">{children}</h3>
    {hint && <span className="text-xs text-slate-400">{hint}</span>}
  </div>
);

export default function JournalApp({ user, cases = [], onPushTask = null }) {
  const [entries, setEntries] = useState({});
  const [view, setView] = useState("write"); // write | list | search | learned | migrate
  const [currentDate, setCurrentDate] = useState(todayKey());
  const [form, setForm] = useState(() => entryToForm(null, todayKey()));
  const [dirty, setDirty] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [search, setSearch] = useState("");
  const [learnedTopic, setLearnedTopic] = useState("전체");
  const loadedDateRef = useRef(null);
  const formRef = useRef(form);
  useEffect(() => { formRef.current = form; }, [form]);

  // 실시간 구독
  useEffect(() => {
    if (!user) { setEntries({}); return; }
    return subscribeJournal(user.uid, setEntries);
  }, [user]);

  // 현재 날짜의 일지 로드 (구독으로 entries 갱신될 때 + 날짜 변경 시)
  useEffect(() => {
    // 편집 중(dirty)이면 덮어쓰지 않음
    if (dirty && loadedDateRef.current === currentDate) return;
    const base = entries[currentDate] || null;
    const f = entryToForm(base, currentDate);
    // 저장 이력이 없는 새 날짜에만 어제 '내일 할 일'/제출 예정 서면을 자동 이월
    // (저장된(빈) 일지에는 이월하지 않아, 사용자가 지운 항목이 되살아나지 않음)
    if (!base) {
      const carriedTasks = carryForwardTomorrowTasks(entries, currentDate);
      const carriedDocs = carryForwardPendingDocs(entries, currentDate);
      if (carriedTasks.length) f.todayTasks = carriedTasks;
      if (carriedDocs.length) f.pendingDocItems = carriedDocs;
    }
    setForm(f);
    loadedDateRef.current = currentDate;
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate, entries, user]);

  const update = useCallback((patch) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    if (!user) return;
    const entry = formToEntry({ ...form, entryDate: currentDate });
    await saveJournalEntry(user.uid, currentDate, entry);
    setDirty(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
  }, [user, form, currentDate]);

  const openDate = useCallback((k) => {
    setCurrentDate(k);
    setView("write");
  }, []);

  // 일지 할일 → 구글 캘린더 푸시: 이벤트 등록 후 form 항목에 eventId 저장 + 즉시 저장
  // (부수효과를 setState 업데이터 밖에서 수행 — StrictMode 이중 호출/이중 저장 방지)
  const handlePushItem = useCallback(async (item, fieldName) => {
    if (!onPushTask) throw new Error("캘린더 연동을 사용할 수 없습니다.");
    const eventId = await onPushTask({
      eventId: item.googleEventId, title: item.text, details: item.details, date: item.dueDate,
    });
    const cur = formRef.current;
    const arr = (cur[fieldName] || []).map((it) =>
      it.id === item.id ? { ...it, googleEventId: eventId } : it);
    const next = { ...cur, [fieldName]: arr };
    setForm(next);
    if (user) {
      saveJournalEntry(user.uid, currentDate, formToEntry({ ...next, entryDate: currentDate }))
        .catch((e) => console.warn("[journal] 캘린더 후 저장 실패", e));
    }
    return eventId;
  }, [onPushTask, user, currentDate]);

  const removeEntry = useCallback(async (k) => {
    if (!user) return;
    if (!window.confirm(`${k} 일지를 삭제하시겠습니까?`)) return;
    await deleteJournalEntry(user.uid, k);
    if (k === currentDate) { setCurrentDate(todayKey()); setView("write"); }
  }, [user, currentDate]);

  const recentDates = useMemo(
    () => Object.keys(entries).sort((a, b) => b.localeCompare(a)),
    [entries]
  );

  const learnedGroups = useMemo(() => buildLearnedTopicGroups(entries), [entries]);
  const learnedStats = useMemo(
    () => buildLearnedArchiveStats(entries, todayKey().slice(0, 7)),
    [entries]
  );
  const topicOptions = useMemo(() => {
    const fromData = buildLearnedTopicOptions(entries);
    return Array.from(new Set([...DEFAULT_TOPICS, ...fromData]));
  }, [entries]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return recentDates
      .map((k) => ({ k, e: entries[k] }))
      .filter(({ e }) => {
        const hay = [e.todayWork, e.callNotes, e.writtenDocs, e.etc, e.learned,
          e.todayTasks, e.tomorrowTasks, e.pendingDocs, e.delegated]
          .filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      });
  }, [search, recentDates, entries]);

  const navBtn = (key, icon, label) => (
    <button
      onClick={() => setView(key)}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
        view === key ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-500 hover:bg-slate-50"
      }`}>
      <span>{icon}</span> {label}
    </button>
  );

  return (
    <div className="flex flex-1 min-h-0">
      {/* 일지 사이드바 */}
      <div className="hidden md:flex w-60 flex-shrink-0 bg-white border-r border-slate-100 flex-col">
        <div className="p-3 space-y-0.5">
          {navBtn("write", "✏️", "오늘 일지 작성")}
          {navBtn("list", "📋", "일지 목록")}
          {navBtn("search", "🔍", "전체 검색")}
          {navBtn("learned", "💡", "배운 점 모아보기")}
          {navBtn("migrate", "📦", "데이터 가져오기")}
        </div>
        <div className="px-3 pt-2 pb-1 text-[11px] font-medium text-slate-400 uppercase tracking-wider">최근 일지</div>
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {recentDates.slice(0, 40).map((k) => (
            <button
              key={k}
              onClick={() => openDate(k)}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg mb-0.5 ${
                k === currentDate && view === "write" ? "bg-indigo-50" : "hover:bg-slate-50"
              }`}>
              <div className="text-xs font-mono text-indigo-500">{k}</div>
              <div className="text-[11px] text-slate-400 truncate">{entryPreview(entries[k])}</div>
            </button>
          ))}
          {recentDates.length === 0 && (
            <div className="text-xs text-slate-300 px-2 py-2">일지가 없습니다.</div>
          )}
        </div>
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto bg-slate-50">
        {view === "write" && (
          <div className="max-w-3xl mx-auto px-4 sm:px-8 py-6">
            {/* 헤더 */}
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <div className="flex items-center gap-3">
                <input
                  type="date"
                  value={currentDate}
                  onChange={(e) => setCurrentDate(e.target.value)}
                  className="input font-mono text-sm w-44"
                />
                <span className="text-sm text-slate-500">{fmtDateLabel(currentDate)}</span>
              </div>
              <div className="flex items-center gap-2">
                {savedFlash && <span className="text-xs text-emerald-600">✓ 저장됨</span>}
                {dirty && <span className="text-xs text-amber-500">● 미저장</span>}
                <button onClick={save} className="btn-primary text-sm">저장</button>
              </div>
            </div>

            {/* 출퇴근 시간 */}
            <div className="flex gap-3 mb-2">
              <label className="text-xs text-slate-500 flex items-center gap-2">
                출근
                <input type="time" value={form.arrivalTime}
                  onChange={(e) => update({ arrivalTime: e.target.value })}
                  className="input text-xs w-28" />
              </label>
              <label className="text-xs text-slate-500 flex items-center gap-2">
                퇴근
                <input type="time" value={form.leaveTime}
                  onChange={(e) => update({ leaveTime: e.target.value })}
                  className="input text-xs w-28" />
              </label>
            </div>

            <SectionLabel hint="사건별 진행·서면·회의·행정">오늘 업무</SectionLabel>
            <textarea value={form.todayWork} onChange={(e) => update({ todayWork: e.target.value })}
              className="input w-full min-h-[120px] text-sm leading-relaxed"
              placeholder={"[사건별 진행]\n- 2024가합1234 / 준비서면 초안\n[회의·상담]\n- 14:00 의뢰인 미팅"} />

            <SectionLabel hint="📝 상세 · 📅 캘린더 등록 · 체크 시 이월 안 됨">오늘 할 일</SectionLabel>
            <ChecklistEditor items={form.todayTasks} cases={cases} showCase showDetails
              field="todayTasks" onPushItem={onPushTask ? handlePushItem : null}
              onChange={(v) => update({ todayTasks: v })} placeholder="오늘 처리할 업무 입력 후 Enter" />

            <SectionLabel hint="미완료 시 다음 날 '오늘 할 일'로 자동 이월">내일 할 일</SectionLabel>
            <ChecklistEditor items={form.tomorrowTasks} cases={cases} showCase showDetails
              field="tomorrowTasks" onPushItem={onPushTask ? handlePushItem : null}
              onChange={(v) => update({ tomorrowTasks: v })} placeholder="내일 할 업무 입력 후 Enter" />

            <SectionLabel hint="제출 전까지 매일 이월 · 사건 연결 · 캘린더 등록 가능">제출 예정 서면</SectionLabel>
            <ChecklistEditor items={form.pendingDocItems} cases={cases} showCase showDetails
              field="pendingDocItems" onPushItem={onPushTask ? handlePushItem : null}
              onChange={(v) => update({ pendingDocItems: v })} placeholder="제출 예정 서면 입력 후 Enter" />

            <SectionLabel hint="담당자별 · 상세·캘린더 등록 가능">위임 업무</SectionLabel>
            <ChecklistEditor items={form.delegatedItems} showAssignee showDate showDetails
              field="delegatedItems" onPushItem={onPushTask ? handlePushItem : null}
              onChange={(v) => update({ delegatedItems: v })} placeholder="위임 업무 입력 후 Enter" />

            <SectionLabel>통화·상담 메모</SectionLabel>
            <textarea value={form.callNotes} onChange={(e) => update({ callNotes: e.target.value })}
              className="input w-full min-h-[80px] text-sm" placeholder={"[상대방] [시각] [내용] [후속조치]"} />

            <LearnedEditor items={form.learnedItems} topics={topicOptions}
              onChange={(v) => update({ learnedItems: v })} />

            <SectionLabel>기타</SectionLabel>
            <textarea value={form.etc} onChange={(e) => update({ etc: e.target.value })}
              className="input w-full min-h-[60px] text-sm" placeholder="기타 메모" />

            <div className="flex justify-between items-center mt-6">
              <button onClick={() => removeEntry(currentDate)}
                className="text-xs text-red-400 hover:text-red-600">이 날짜 일지 삭제</button>
              <button onClick={save} className="btn-primary text-sm">저장</button>
            </div>
          </div>
        )}

        {view === "list" && (
          <div className="max-w-3xl mx-auto px-4 sm:px-8 py-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4">일지 목록 <span className="text-sm font-normal text-slate-400">({recentDates.length})</span></h2>
            <div className="space-y-2">
              {recentDates.map((k) => (
                <div key={k} className="bg-white rounded-xl border border-slate-100 p-4 flex items-center justify-between gap-4 hover:border-indigo-200 transition-colors">
                  <button onClick={() => openDate(k)} className="text-left flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-700">{fmtDateLabel(k)}</div>
                    <div className="text-xs text-slate-400 truncate mt-0.5">{entryPreview(entries[k])}</div>
                  </button>
                  <button onClick={() => removeEntry(k)} className="text-xs text-slate-300 hover:text-red-500 flex-shrink-0">삭제</button>
                </div>
              ))}
              {recentDates.length === 0 && <div className="text-sm text-slate-400 py-10 text-center">아직 작성한 일지가 없습니다.</div>}
            </div>
          </div>
        )}

        {view === "search" && (
          <div className="max-w-3xl mx-auto px-4 sm:px-8 py-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4">전체 검색</h2>
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              className="input w-full text-sm mb-4" placeholder="일지 내용 검색 (업무·메모·서면·할일)" autoFocus />
            <div className="space-y-2">
              {searchResults.map(({ k, e }) => (
                <button key={k} onClick={() => openDate(k)}
                  className="w-full text-left bg-white rounded-xl border border-slate-100 p-4 hover:border-indigo-200 transition-colors">
                  <div className="text-sm font-semibold text-slate-700">{fmtDateLabel(k)}</div>
                  <div className="text-xs text-slate-400 truncate mt-0.5">{entryPreview(e)}</div>
                </button>
              ))}
              {search.trim() && searchResults.length === 0 && (
                <div className="text-sm text-slate-400 py-10 text-center">검색 결과가 없습니다.</div>
              )}
            </div>
          </div>
        )}

        {view === "learned" && (
          <div className="max-w-3xl mx-auto px-4 sm:px-8 py-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="text-lg font-bold text-slate-800">배운 점 모아보기</h2>
              <div className="text-xs text-slate-400">
                총 {learnedStats.totalItems}개 · {learnedStats.totalTopics}개 주제 · 이달 {learnedStats.monthItems}개
              </div>
            </div>
            <div className="flex gap-1.5 flex-wrap mb-4">
              {["전체", ...learnedGroups.map((g) => g.topic)].map((t) => (
                <button key={t} onClick={() => setLearnedTopic(t)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    learnedTopic === t ? "bg-slate-800 text-white border-slate-800" : "text-slate-500 border-slate-200 hover:border-slate-400"
                  }`}>{t}</button>
              ))}
            </div>
            <div className="space-y-4">
              {learnedGroups
                .filter((g) => learnedTopic === "전체" || g.topic === learnedTopic)
                .map((g) => (
                  <div key={g.topic} className="bg-white rounded-xl border border-slate-100 p-5">
                    <h3 className="text-base font-bold text-slate-800 mb-3">{g.topic} <span className="text-xs font-normal text-slate-400">({g.items.length})</span></h3>
                    <div className="space-y-3">
                      {g.items.map((it) => (
                        <div key={it.id} className="border-l-2 border-indigo-100 pl-3">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-medium text-slate-700">{it.title}</span>
                            {it.subtopic && <span className="text-xs text-slate-400">{it.subtopic}</span>}
                            <button onClick={() => openDate(it.date)} className="text-[11px] text-indigo-400 hover:underline ml-auto font-mono">{it.date}</button>
                          </div>
                          {it.content && <div className="text-sm text-slate-500 mt-0.5 whitespace-pre-wrap leading-relaxed">{it.content}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              {learnedGroups.length === 0 && (
                <div className="text-sm text-slate-400 py-10 text-center">기록된 배운 점이 없습니다.</div>
              )}
            </div>
          </div>
        )}

        {view === "migrate" && (
          <JournalMigratePanel user={user} existing={entries} />
        )}
      </div>
    </div>
  );
}

// 배운 점 입력기
function LearnedEditor({ items = [], topics = [], onChange }) {
  const [topic, setTopic] = useState(topics[0] || "기타");
  const [subtopic, setSubtopic] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const add = () => {
    if (!title.trim() && !content.trim()) return;
    onChange([...items, {
      id: `learned_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      topic: topic || "기타", subtopic: subtopic.trim(),
      title: title.trim() || "(제목 없음)", content: content.trim(),
      date: new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }),
    }]);
    setSubtopic(""); setTitle(""); setContent("");
  };
  const remove = (id) => onChange(items.filter((i) => i.id !== id));

  return (
    <>
      <SectionLabel hint="주제별로 모아 복기">오늘 배운 점</SectionLabel>
      {items.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {items.map((it) => (
            <div key={it.id} className="bg-white border border-slate-100 rounded-lg px-3 py-2 flex items-start gap-2 group">
              <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 flex-shrink-0">{it.topic}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-700">{it.title}</div>
                {it.content && <div className="text-xs text-slate-500 whitespace-pre-wrap">{it.content}</div>}
              </div>
              <button onClick={() => remove(it.id)} className="text-slate-300 hover:text-red-500 text-sm opacity-0 group-hover:opacity-100">✕</button>
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        <select value={topic} onChange={(e) => setTopic(e.target.value)} className="input text-xs">
          {topics.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input value={subtopic} onChange={(e) => setSubtopic(e.target.value)} className="input text-xs" placeholder="세부 분류(선택)" />
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="input text-xs col-span-2" placeholder="제목" />
        <textarea value={content} onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); add(); } }}
          className="input text-xs col-span-2 min-h-[60px]" placeholder="내용 (⌘/Ctrl+Enter 로 추가)" />
        <button onClick={add} className="btn-ghost text-xs col-span-2">+ 배운 점 추가</button>
      </div>
    </>
  );
}
