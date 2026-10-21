import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  subscribeJournal, saveJournalEntryMerged, deleteJournalEntry, emptyJournalEntry,
} from "../../journalStore";
import { mergeJournalEntries } from "../../journalMerge";
import { saveJournalDraft, loadJournalDraft, clearJournalDraft, draftDiffersFromForm } from "../../journalDraft";
import {
  parseJsonArray, carryForwardTasks,
  buildLearnedTopicGroups, searchLearnedItems, buildLearnedArchiveStats,
  buildLearnedTopicOptions,
  diffResolvedItems, createTaskCompletion, mergeCompletions, pruneCompletionsForActive,
  carryForwardDelegatedTasks, createDelegatedCompletion, rescheduleDelegatedTask,
  dropResurrectedPendingDocs, dropResurrectedTodayTasks, dropResurrectedDelegatedTasks,
  findStaleCarriedTodayTasks, latestEntryDateBefore,
} from "../../journalLogic";
import ChecklistEditor from "./ChecklistEditor";
import WorkLogEditor from "./WorkLogEditor";
import LegacyFields, { legacyFieldCount } from "./LegacyFields";
import JournalMigratePanel from "./JournalMigratePanel";
import DelegatedPanel from "./DelegatedPanel";
import ConsultPanel from "./ConsultPanel";
import { consultsForDate } from "../../consultations";
import { frequentAssignees, addDaysToKey } from "../../journalView";
import { workTimelineEntry, workClientRequestMemo, countUnrecordedWork } from "../../journalWork";
import { upsertTimelineEntry, upsertCaseMemo } from "../../caseLink";

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
    todayTaskCompletions: e.todayTaskCompletions || "",
    tomorrowTasks: parseJsonArray(e.tomorrowTasks),
    pendingDocItems: parseJsonArray(e.pendingDocItems),
    delegatedItems: parseJsonArray(e.delegatedItems),
    delegatedCompletions: e.delegatedCompletions || "",
    learnedItems: parseJsonArray(e.learnedItems),
    // 사건 연동 기록
    caseProgressItems: parseJsonArray(e.caseProgressItems),
    callLogItems: parseJsonArray(e.callLogItems),
    // 오늘 한 일(오늘 업무·진행 기록·통화 메모·기타를 합친 목록)
    workItems: parseJsonArray(e.workItems),
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
    todayTaskCompletions: form.todayTaskCompletions || "",
    tomorrowTasks: JSON.stringify(form.tomorrowTasks || []),
    pendingDocItems: JSON.stringify(form.pendingDocItems || []),
    pendingDocs: (form.pendingDocItems || []).map((i) => i.text).join("\n"),
    delegatedItems: JSON.stringify(form.delegatedItems || []),
    delegated: (form.delegatedItems || []).map((i) => `${i.done ? "[완료] " : ""}${i.assignee ? i.assignee + ": " : ""}${i.text}`).join("\n"),
    delegatedCompletions: form.delegatedCompletions || "",
    learnedItems: JSON.stringify(form.learnedItems || []),
    learned: (form.learnedItems || []).map((i) => `[${i.topic}] ${i.title} — ${i.content}`).join("\n"),
    caseProgressItems: JSON.stringify(form.caseProgressItems || []),
    callLogItems: JSON.stringify(form.callLogItems || []),
    workItems: JSON.stringify(form.workItems || []),
    submittedDocItems: form.submittedDocItems || "",
    pendingDocCompletions: form.pendingDocCompletions || "",
    eventMemos: form.eventMemos || "",
  };
}

function entryPreview(entry) {
  const parts = [];
  if (entry.todayWork) parts.push(entry.todayWork.replace(/\n/g, " "));
  const work = parseJsonArray(entry.workItems);
  if (work.length) parts.push(`한 일 ${work.length}`);
  const calls = parseJsonArray(entry.callLogItems);
  if (calls.length) parts.push(`통화 ${calls.length}`);
  const tasks = parseJsonArray(entry.todayTasks);
  if (tasks.length) parts.push(`할일 ${tasks.length}`);
  const delegated = parseJsonArray(entry.delegatedItems);
  if (delegated.length) {
    const pendingDelegated = delegated.filter((item) => item && !item.done).length;
    parts.push(`위임 ${pendingDelegated}/${delegated.length}`);
  }
  const learned = parseJsonArray(entry.learnedItems);
  if (learned.length) parts.push(`배운점 ${learned.length}`);
  return parts.join(" · ").slice(0, 60) || "(빈 일지)";
}

// 접을 수 있는 칸: 비어 있으면 접어 두고 건수 배지만 보인다(누르면 펼침).
// 날짜를 바꾸면 펼침 상태가 처음으로 돌아가도록 부르는 쪽에서 key 에 날짜를 넣는다.
function Section({ title, hint, count = 0, badge = null, defaultOpen = null, children }) {
  const [manual, setManual] = useState(null);
  const open = manual ?? (defaultOpen ?? count > 0);
  const label = badge ?? (count > 0 ? `${count}` : "");
  return (
    <div className="mt-3">
      <button type="button" onClick={() => setManual(!open)}
        className="w-full flex items-center gap-2 py-1 text-left group">
        <span className="text-[10px] text-slate-400 w-3">{open ? "▾" : "▸"}</span>
        <h3 className="text-sm font-semibold text-slate-700 group-hover:text-slate-900">{title}</h3>
        {label && <span className="text-[11px] text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-1.5 leading-4">{label}</span>}
        {open && hint && <span className="text-xs text-slate-400 truncate">{hint}</span>}
      </button>
      {open && <div className="mt-1 pl-5">{children}</div>}
    </div>
  );
}

function fmtStamp(iso) {
  try { return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return iso || ""; }
}

const isOfflineError = (e) => e?.code === "unavailable" || e?.code === "deadline-exceeded" || e?.code === "timeout"
  || /offline|network|failed to fetch/i.test(String(e?.message || ""));

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error("서버 응답 없음"), { code: "timeout" })), ms)),
  ]);
}

// 저장 충돌 선택 창: 같은 항목을 이 기기와 다른 기기가 서로 다르게 바꾼 경우만 묻는다
function JournalConflictDialog({ conflicts, onResolve, onCancel }) {
  const [choices, setChoices] = useState(() => Object.fromEntries(conflicts.map((c) => [c.id, "mine"])));
  const Row = ({ c, side, text }) => (
    <label className={`flex items-start gap-2 rounded-lg border px-3 py-2 cursor-pointer ${choices[c.id] === side ? "border-indigo-400 bg-indigo-50" : "border-slate-200"}`}>
      <input type="radio" className="mt-1" checked={choices[c.id] === side} onChange={() => setChoices((p) => ({ ...p, [c.id]: side }))} />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] text-slate-500">{side === "mine" ? "이 기기(지금 화면)" : "다른 기기(서버에 저장된 것)"}</span>
        <span className="block text-sm text-slate-700 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">{text || "(비어 있음)"}</span>
      </span>
    </label>
  );
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[92vh]">
        <div className="px-5 py-3.5 rounded-t-2xl" style={{ background: "#1E293B" }}>
          <div className="text-white font-semibold">다른 기기에서 바뀐 내용과 겹칩니다</div>
          <div className="text-slate-400 text-xs mt-0.5">겹치지 않는 내용은 이미 합쳤습니다. 아래 {conflicts.length}건만 어느 쪽을 남길지 골라 주세요.</div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {conflicts.map((c) => (
            <div key={c.id} className="space-y-1.5">
              <div className="text-xs font-semibold text-slate-600">{c.label}</div>
              <Row c={c} side="mine" text={c.mine} />
              <Row c={c} side="theirs" text={c.theirs} />
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button className="btn-ghost text-sm" onClick={onCancel}>저장하지 않고 닫기</button>
          <button className="btn-primary text-sm" onClick={() => onResolve(choices)}>고른 대로 합쳐 저장</button>
        </div>
      </div>
    </div>
  );
}

export default function JournalApp({
  user, cases = [], onPushTask = null, onUpdateCase = null, onDirtyChange = null,
  consultations = {}, onSaveConsultMemo = null, onCreateCaseFromConsult = null,
}) {
  const [entries, setEntries] = useState({});
  const [view, setView] = useState("write"); // write | list | search | learned | migrate
  const [currentDate, setCurrentDate] = useState(todayKey());
  const [form, setForm] = useState(() => entryToForm(null, todayKey()));
  const [dirty, setDirty] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [search, setSearch] = useState("");
  const [learnedTopic, setLearnedTopic] = useState("전체");
  const loadedDateRef = useRef(null);
  // 마지막으로 폼에 반영한 서버 판본(_savedAt). 이 값이 그대로면 스냅샷이 와도 폼을 다시 만들지 않는다.
  const loadedSavedAtRef = useRef(null);
  // 지금 폼이 서버 판본으로 만들어졌는지 (false = 기기 캐시로 만든 폼)
  const formFromServerRef = useRef(false);
  // 이 기기에서 저장한 판본(_savedAt) — 다른 기기 저장과 구별용
  const ownSavedAtRef = useRef(new Set());
  const formRef = useRef(form);
  useEffect(() => { formRef.current = form; }, [form]);
  const casesRef = useRef(cases);
  useEffect(() => { casesRef.current = cases; }, [cases]);
  // 서버 판본을 받았는지 / 서버 응답이 없어 기기 사본으로 진행하는지
  const [entriesFromServer, setEntriesFromServer] = useState(false);
  const [offlineFallback, setOfflineFallback] = useState(false);
  const entriesReady = entriesFromServer || offlineFallback;
  const [cleanedNotice, setCleanedNotice] = useState(null); // { date, count }
  // 저장된 일지에 섞여 든 옛 항목(직전 일지에 없던 것) — 자동으로 지우지 않고 보여 준다
  const [staleSuggestion, setStaleSuggestion] = useState(null); // { date, prevDate, docs, tasks }
  const [staleFormNotice, setStaleFormNotice] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  // 이 화면이 출발한 서버 판본(저장 때 3자 병합의 기준)
  const baseEntryRef = useRef(null);
  const dirtyRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState(null); // { tone: "info"|"warn"|"err", text }
  const [conflictState, setConflictState] = useState(null); // { conflicts }
  const [draftOffer, setDraftOffer] = useState(null); // 이 기기에 남은 초안
  const retryOnOnlineRef = useRef(false);

  dirtyRef.current = dirty;

  // 상위(App)에 미저장 여부를 알린다 — 사건 화면으로 바꾸거나 로그아웃할 때 경고하는 데 쓴다
  useEffect(() => { if (onDirtyChange) onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => { if (onDirtyChange) onDirtyChange(false); }, [onDirtyChange]);

  // 작성 중인 내용을 이 기기에 초안으로 자동 보관한다(입력이 멈추고 0.4초 뒤)
  const flushDraft = useCallback(() => {
    if (!user || !dirtyRef.current || loadedDateRef.current !== currentDate) return;
    saveJournalDraft(user.uid, currentDate, { form: formRef.current, base: baseEntryRef.current });
  }, [user, currentDate]);
  useEffect(() => {
    if (!dirty) return undefined;
    const t = setTimeout(flushDraft, 400);
    return () => clearTimeout(t);
  }, [form, dirty, flushDraft]);

  // 창을 닫거나 앱을 내릴 때: 초안을 바로 남기고, 저장하지 않은 내용이 있으면 닫기 전에 묻는다
  useEffect(() => {
    const onBeforeUnload = (e) => {
      flushDraft();
      if (dirtyRef.current) { e.preventDefault(); e.returnValue = ""; return ""; }
      return undefined;
    };
    const onHide = () => { if (document.visibilityState === "hidden") flushDraft(); };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onHide);
      flushDraft(); // 화면을 떠날 때(사건 화면으로 바꾸기 등)
    };
  }, [flushDraft]);

  // 저장하지 않은 채 다른 날짜로 옮길 때 확인한다
  const confirmLeave = useCallback(() => {
    if (!dirtyRef.current) return true;
    flushDraft();
    return window.confirm("저장하지 않은 내용이 있습니다.\n다른 날짜로 옮기면 이 화면의 입력은 이 기기에 초안으로만 남습니다(이 날짜를 다시 열면 복구할 수 있습니다). 옮길까요?");
  }, [flushDraft]);
  const changeDate = useCallback((k) => {
    if (!k || k === currentDate) return;
    if (!confirmLeave()) return;
    setCurrentDate(k);
  }, [currentDate, confirmLeave]);

  const restoreDraft = useCallback(() => {
    const d = draftOffer;
    if (!d) return;
    setForm(d.form);
    formRef.current = d.form;
    // 초안이 출발한 서버 판본을 기준으로 삼아, 저장할 때 그 뒤 다른 기기 변경과 합친다
    baseEntryRef.current = d.base || null;
    setDirty(true);
    setDraftOffer(null);
  }, [draftOffer]);
  const discardDraft = useCallback(() => {
    if (user) clearJournalDraft(user.uid, currentDate);
    setDraftOffer(null);
  }, [user, currentDate]);

  // 실시간 구독
  // 기기 캐시(오래된 사본일 수 있음)만 받은 상태에서는 작성 폼을 만들지 않는다. 캐시로 이월을 계산하면
  // 이미 처리한 항목이 되살아나기 때문이다. 8초 안에 서버 응답이 없으면 오프라인으로 보고 사본으로 진행한다.
  useEffect(() => {
    setEntriesFromServer(false);
    setOfflineFallback(false);
    if (!user) { setEntries({}); return undefined; }
    const timer = setTimeout(() => setOfflineFallback(true), 8000);
    const unsub = subscribeJournal(user.uid, (map, meta) => {
      setEntries(map);
      if (!meta?.fromCache) { setEntriesFromServer(true); clearTimeout(timer); }
    });
    return () => { clearTimeout(timer); unsub(); };
  }, [user]);

  // 현재 날짜의 일지 로드 (구독으로 entries 갱신될 때 + 날짜 변경 시)
  useEffect(() => {
    if (!entriesReady) return;
    // 편집 중(dirty)이면 덮어쓰지 않음 — 다만 기기 사본으로 만든 폼이면 서버 판본이 왔음을 알린다
    if (dirty && loadedDateRef.current === currentDate) {
      if (entriesFromServer && !formFromServerRef.current) setStaleFormNotice(true);
      return;
    }
    const base = entries[currentDate] || null;
    // 같은 날짜가 이미 로드되어 있고 서버 판본(_savedAt)도 그대로면 폼을 다시 만들지 않는다.
    // 저장 반향이나 다른 날짜 문서의 스냅샷마다 폼이 리셋되어, 입력 중 한글 조합이 끊기고
    // (초성만 남음) 값이 롤백되던 문제를 막는다. 단, 기기 사본으로 만든 폼은 서버 판본이 오면 다시 만든다.
    const sameVersion = loadedDateRef.current === currentDate && ((base && base._savedAt) || null) === loadedSavedAtRef.current;
    if (sameVersion && (formFromServerRef.current || !entriesFromServer)) return;
    const f = entryToForm(base, currentDate);
    // 저장 이력이 없는 새 날짜에만 어제 '내일 할 일'/제출 예정 서면을 자동 이월
    // (저장된(빈) 일지에는 이월하지 않아, 사용자가 지운 항목이 되살아나지 않음)
    // 위임 업무는 완료/취소 전까지 회수 추적이 필요하므로 저장된 날짜에도 과거 미완료 항목을 병합한다.
    f.delegatedItems = carryForwardDelegatedTasks(entries, currentDate);
    // 할 일은 직전 일지의 미완료 할 일과 예전 '내일 할 일'을 받는다. 제출 예정 서면 칸은 없앴으므로 이월하지 않는다
    // (예전 일지의 서면 목록은 「예전 칸」에 그대로 보인다).
    if (!base) {
      const carriedTasks = carryForwardTasks(entries, currentDate);
      if (carriedTasks.length) f.todayTasks = carriedTasks;
    }
    // 이미 처리한(앞선 날짜에 완료 기록이 있는) 항목이 되살아나 저장돼 있으면 목록에서 거둔다
    const docs = dropResurrectedPendingDocs(entries, currentDate, f.pendingDocItems);
    const tasks = dropResurrectedTodayTasks(entries, currentDate, f.todayTasks);
    const delegated = dropResurrectedDelegatedTasks(entries, currentDate, f.delegatedItems);
    f.pendingDocItems = docs.items;
    f.todayTasks = tasks.items;
    f.delegatedItems = delegated.items;
    const cleanedCount = docs.dropped.length + tasks.dropped.length + delegated.dropped.length;
    setCleanedNotice(cleanedCount ? { date: currentDate, count: cleanedCount } : null);
    const staleTasks = base ? findStaleCarriedTodayTasks(entries, currentDate, f.todayTasks) : [];
    setStaleSuggestion(staleTasks.length
      ? { date: currentDate, prevDate: latestEntryDateBefore(entries, currentDate), docs: [], tasks: staleTasks }
      : null);
    setForm(f);
    loadedDateRef.current = currentDate;
    loadedSavedAtRef.current = (base && base._savedAt) || null;
    baseEntryRef.current = base;
    formFromServerRef.current = entriesFromServer;
    setStaleFormNotice(false);
    setDirty(false);
    // 저장하지 않고 닫은 초안이 이 기기에 남아 있으면 복구를 제안한다
    const draft = user ? loadJournalDraft(user.uid, currentDate) : null;
    if (draft && draftDiffersFromForm(draft, f)) setDraftOffer(draft);
    else {
      setDraftOffer(null);
      if (draft && user) clearJournalDraft(user.uid, currentDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate, entries, user, entriesReady, entriesFromServer, reloadTick]);

  // 기기 사본으로 만든 폼을 버리고 서버 판본으로 다시 만든다 (입력 중이던 내용은 버려진다)
  const reloadFromServer = useCallback(() => {
    loadedSavedAtRef.current = Symbol("reload");
    formFromServerRef.current = false;
    setStaleFormNotice(false);
    setDirty(false);
    setReloadTick((t) => t + 1);
  }, []);

  const update = useCallback((patch) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }, []);

  // 오늘 할 일 변경: 체크(done)·삭제된 항목은 완료 기록(todayTaskCompletions)에 남겨
  // 다음 날 carry-forward 가 되살리지 않게 한다.
  const handleTodayTasksChange = useCallback((v) => {
    const now = new Date().toISOString();
    setForm((prev) => {
      const records = diffResolvedItems(prev.todayTasks, v).map((it) => createTaskCompletion(it, now));
      const merged = mergeCompletions(prev.todayTaskCompletions, records);
      return { ...prev, todayTasks: v, todayTaskCompletions: pruneCompletionsForActive(merged, v) };
    });
    setDirty(true);
  }, []);

  // 위임 업무 변경: 체크·삭제된 항목을 완료 기록(delegatedCompletions)에 남겨
  // 다음 날 미확인 위임 업무로 되살아나지 않게 한다.
  const handleDelegatedChange = useCallback((v) => {
    const now = new Date().toISOString();
    setForm((prev) => {
      const records = diffResolvedItems(prev.delegatedItems, v)
        .map((it) => createDelegatedCompletion(it, now, it.sourceDate || currentDate));
      const merged = mergeCompletions(prev.delegatedCompletions, records);
      return { ...prev, delegatedItems: v, delegatedCompletions: pruneCompletionsForActive(merged, v) };
    });
    setDirty(true);
  }, [currentDate]);

  // 확인 결과 보완 등이 생긴 경우, 업무를 새로 만들지 않고 같은 위임 업무의
  // 확인기한과 변경 사유를 조정 이력으로 누적한다.
  const handleDelegatedReschedule = useCallback((item, { dueDate, reason }) => {
    const changedAt = new Date().toISOString();
    setForm((prev) => ({
      ...prev,
      delegatedItems: (prev.delegatedItems || []).map((existing) => (
        existing.id === item.id
          ? rescheduleDelegatedTask(existing, dueDate, { changedAt, changedDate: currentDate, reason }) || existing
          : existing
      )),
    }));
    setDirty(true);
  }, [currentDate]);

  // 섞여 든 옛 항목을 목록에서 뺀다 — 완료 기록을 남겨 다른 기기·다음 날에도 다시 나오지 않게 한다
  const removeStaleItems = useCallback(() => {
    const sug = staleSuggestion;
    if (!sug) return;
    const cur = formRef.current;
    const taskIds = new Set(sug.tasks.map((i) => i.id));
    if (taskIds.size) handleTodayTasksChange((cur.todayTasks || []).filter((i) => !taskIds.has(i.id)));
    setStaleSuggestion(null);
  }, [staleSuggestion, handleTodayTasksChange]);

  // 이 기기에서 저장할 때 쓸 판본 표시(_savedAt)를 만들어 기억해 둔다
  const nextOwnStamp = useCallback(() => {
    const stamp = new Date().toISOString();
    ownSavedAtRef.current.add(stamp);
    return stamp;
  }, []);

  // 병합 저장: 저장 직전에 서버 판본을 다시 읽어(트랜잭션) 이 화면이 출발한 판본(base)과 비교해 항목 단위로 합친다.
  //  - 다른 기기만 바꾼 항목은 그쪽을, 이 화면만 바꾼 항목은 이 화면 것을 남긴다(덮어쓰지 않음).
  //  - 같은 항목을 양쪽이 다르게 바꿨으면 저장하지 않고 충돌 목록을 돌려준다(choices 로 골라 다시 부른다).
  // 반환: { status: "saved" | "conflict" | "offline" | "error" | "skipped", ... }
  const persist = useCallback(async (nextForm, { choices = {} } = {}) => {
    if (!user) return { status: "skipped" };
    if (typeof navigator !== "undefined" && navigator.onLine === false) return { status: "offline" };
    const mine = formToEntry({ ...nextForm, entryDate: currentDate });
    const base = baseEntryRef.current;
    const stamp = nextOwnStamp();
    let res;
    try {
      res = await withTimeout(saveJournalEntryMerged(user.uid, currentDate, (latest) => {
        const r = mergeJournalEntries(base, mine, latest, choices);
        if (r.unresolved.length) return { unresolved: r.unresolved, conflicts: r.conflicts };
        // 목록에서 만드는 요약 글(서면·위임·배운 점)은 합친 목록으로 다시 만들고, 모르는 필드는 그대로 둔다
        const normalized = formToEntry(entryToForm({ ...r.merged, entryDate: currentDate }, currentDate));
        return { entry: { ...r.merged, ...normalized }, otherChanged: r.otherChanged };
      }, stamp), 20000);
    } catch (e) {
      return { status: isOfflineError(e) ? "offline" : "error", error: e };
    }
    if (!res.saved) return { status: "conflict", conflicts: res.unresolved || [] };
    baseEntryRef.current = res.saved;
    loadedSavedAtRef.current = res.saved._savedAt;
    // 저장하는 동안 더 입력하지 않았을 때만 화면을 저장본으로 맞추고 '미저장'을 끈다
    const untouched = formRef.current === nextForm;
    if (untouched) {
      if (res.otherChanged) setForm(entryToForm(res.saved, currentDate));
      setDirty(false);
      clearJournalDraft(user.uid, currentDate);
    }
    return { status: "saved", otherChanged: !!res.otherChanged };
  }, [user, currentDate, nextOwnStamp]);

  const reportSave = useCallback((r, { auto = false, choices = {} } = {}) => {
    if (r.status === "saved") {
      retryOnOnlineRef.current = false;
      setCleanedNotice(null);
      setSaveNotice(r.otherChanged ? { tone: "info", text: "다른 기기에서 저장한 내용과 합쳐 저장했습니다." } : null);
      if (!auto) { setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1800); }
      return;
    }
    setDirty(true);
    if (r.status === "conflict") {
      if (auto) setSaveNotice({ tone: "warn", text: "다른 기기에서 바뀐 내용과 겹쳐 자동으로 저장하지 못했습니다. '저장'을 눌러 정리해 주세요." });
      else setConflictState({ conflicts: r.conflicts, prior: choices }); // 앞서 고른 것은 다음 저장에 이어 쓴다
    } else if (r.status === "offline") {
      retryOnOnlineRef.current = true;
      setSaveNotice({ tone: "warn", text: "서버에 연결되지 않아 저장하지 못했습니다. 입력은 이 기기에 초안으로 보관되어 있고, 연결되면 자동으로 다시 저장합니다." });
    } else if (r.status === "error") {
      setSaveNotice({ tone: "err", text: `저장하지 못했습니다(${r.error?.code || r.error?.message || "오류"}). 입력은 이 기기에 초안으로 보관되어 있습니다.` });
    }
  }, []);

  const save = useCallback(async (choices) => {
    if (!user || !entriesReady || saving) return;
    setSaving(true);
    setConflictState(null);
    // 저장 직전 초안도 남겨 둔다(저장이 실패해도 입력이 남도록)
    saveJournalDraft(user.uid, currentDate, { form: formRef.current, base: baseEntryRef.current });
    const used = choices && typeof choices === "object" && !choices.nativeEvent ? choices : {};
    const r = await persist(formRef.current, { choices: used });
    setSaving(false);
    reportSave(r, { choices: used });
  }, [user, entriesReady, saving, currentDate, persist, reportSave]);

  // 연결이 돌아오면, 연결이 없어 못 한 저장을 다시 한다
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onOnline = () => { if (retryOnOnlineRef.current && dirtyRef.current) saveRef.current(); };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  const openDate = useCallback((k) => {
    if (k !== currentDate && !confirmLeave()) return;
    setCurrentDate(k);
    setView("write");
  }, [currentDate, confirmLeave]);

  // 일지 할일 → 구글 캘린더 푸시: 이벤트 등록 후 form 항목에 eventId 저장 + 즉시 저장
  // (부수효과를 setState 업데이터 밖에서 수행 — StrictMode 이중 호출/이중 저장 방지)
  const handlePushItem = useCallback(async (item, fieldName) => {
    if (!onPushTask) throw new Error("캘린더 연동을 사용할 수 없습니다.");
    const eventId = await onPushTask({
      eventId: item.googleEventId, title: item.text, details: item.details, date: item.dueDate,
    });
    const cur = formRef.current;
    const arr = (cur[fieldName] || []).map((it) =>
      it.id === item.id ? { ...it, googleEventId: eventId, needsCalendarSync: false } : it);
    const next = { ...cur, [fieldName]: arr };
    setForm(next);
    formRef.current = next;
    setDirty(true);
    persist(next).then((r) => reportSave(r, { auto: true }))
      .catch((e) => console.warn("[journal] 캘린더 후 저장 실패", e));
    return eventId;
  }, [onPushTask, persist, reportSave]);

  // ── 일지 → 사건 기록 (공통: 사건 갱신 후 일지 항목에 연동 식별자 기록 + 즉시 저장) ──
  // baseCase: 기록을 만들 때 출발한 사건 판본 — 바뀐 부분만 서버 최신 사건 문서에 얹는다
  const applyCaseRecord = useCallback(async (fieldName, itemId, patch, updatedCase, baseCase) => {
    if (!onUpdateCase) throw new Error("사건 연동을 사용할 수 없습니다.");
    await onUpdateCase(updatedCase, baseCase);
    const cur = formRef.current;
    const arr = (cur[fieldName] || []).map((it) => (it.id === itemId ? { ...it, ...patch } : it));
    const next = { ...cur, [fieldName]: arr };
    setForm(next);
    formRef.current = next;
    setDirty(true);
    persist(next).then((r) => reportSave(r, { auto: true }))
      .catch((e) => console.warn("[journal] 사건 기록 후 저장 실패", e));
  }, [onUpdateCase, persist, reportSave]);

  // 오늘 한 일 → 사건 진행경과(+ 의뢰인요청 체크 시 의뢰인요청 메모). 다시 누르면 같은 기록을 고친다.
  const handleRecordWork = useCallback(async (item) => {
    const c = casesRef.current.find((x) => x.id === item.caseId);
    if (!c) throw new Error("선택한 사건을 찾을 수 없습니다.");
    const timelineId = item.timelineId || Date.now();
    let updated = upsertTimelineEntry(c, { id: timelineId, ...workTimelineEntry(item, currentDate) });
    const patch = { timelineId, recordedAt: new Date().toISOString() };
    const memo = workClientRequestMemo(item, currentDate);
    if (memo) {
      const memoId = item.memoId || Date.now() + 1;
      updated = upsertCaseMemo(updated, { id: memoId, ...memo });
      patch.memoId = memoId;
    }
    await applyCaseRecord("workItems", item.id, patch, updated, c);
  }, [applyCaseRecord, currentDate]);

  const removeEntry = useCallback(async (k) => {
    if (!user) return;
    if (!window.confirm(`${k} 일지를 삭제하시겠습니까?\n\n이 날짜에 남긴 완료 처리 기록도 함께 지워져, 이미 처리한 할 일·서면이 다음 날 다시 이월될 수 있습니다.`)) return;
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
        const hay = [e.todayWork, e.callNotes, e.writtenDocs, e.etc, e.learned, e.workItems, e.caseProgressItems, e.callLogItems,
          e.todayTasks, e.tomorrowTasks, e.pendingDocs, e.pendingDocItems, e.delegated, e.delegatedItems]
          .filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      });
  }, [search, recentDates, entries]);

  const pendingDelegatedItems = useMemo(() => (
    (form.delegatedItems || []).filter((item) => item && item.text && !item.done)
  ), [form.delegatedItems]);

  const assigneeOptions = useMemo(() => frequentAssignees(entries), [entries]);

  // 「오늘 일정·상담」: 그 날짜의 사건 기일(보기만) + 수임 전 상담 일정
  const dayConsults = useMemo(() => consultsForDate(consultations, currentDate), [consultations, currentDate]);
  const dayHearings = useMemo(() => {
    const out = [];
    (cases || []).forEach((c) => (c?.hearings || []).forEach((h, i) => {
      if (h && h.date === currentDate) out.push({ key: `${c.id}-${h.id ?? i}`, caseTitle: c.title || "", time: h.time || "", type: h.type || "기일", result: h.result || "" });
    }));
    return out.sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
  }, [cases, currentDate]);

  const dailyCheckItems = useMemo(() => {
    const items = [];
    const dueTasks = (form.todayTasks || [])
      .filter((item) => item && item.text && !item.done && (!item.dueDate || item.dueDate <= currentDate)).length;
    const unrecordedWork = countUnrecordedWork(form.workItems);
    if (pendingDelegatedItems.length) items.push(`미확인 위임 업무 ${pendingDelegatedItems.length}건`);
    if (dueTasks) items.push(`오늘까지 할 일(날짜 없는 것 포함) 미완료 ${dueTasks}건`);
    if (unrecordedWork) items.push(`사건을 골랐지만 사건에 기록하지 않은 오늘 한 일 ${unrecordedWork}건`);
    return items;
  }, [form, pendingDelegatedItems, currentDate]);

  const openTaskCount = (form.todayTasks || []).filter((i) => i && i.text && !i.done).length;
  const legacyCount = useMemo(() => legacyFieldCount(form), [form]);

  const runDailyCloseCheck = useCallback(() => {
    if (!dailyCheckItems.length) {
      window.alert("오늘 마감 점검 완료: 미확인 항목이 없습니다.");
      return;
    }
    window.alert(`오늘 마감 점검\n\n${dailyCheckItems.map((item) => `- ${item}`).join("\n")}`);
  }, [dailyCheckItems]);

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
          {/* 「데이터 가져오기」(옛 일지 앱 이전)는 끝난 일이라 메뉴에서 숨긴다 */}
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
        {view === "write" && !entriesReady && (
          <div className="max-w-3xl mx-auto px-4 sm:px-8 py-16 text-center text-sm text-slate-400">
            업무일지를 서버에서 불러오는 중입니다…
            <div className="text-xs text-slate-300 mt-1">기기에 남은 옛 사본으로 이월 목록을 만들지 않도록, 서버 판본을 받은 뒤 작성 화면을 엽니다.</div>
          </div>
        )}
        {view === "write" && entriesReady && (
          <div className="max-w-3xl mx-auto px-4 sm:px-8 py-6">
            {offlineFallback && !entriesFromServer && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                서버에 연결되지 않아 이 기기에 저장된 사본으로 보여 줍니다. 다른 기기에서 처리한 내용이 빠져 있을 수 있으니, 연결된 뒤 확인하고 저장하세요.
              </div>
            )}
            {staleFormNotice && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-center gap-2 flex-wrap">
                <span className="flex-1 min-w-0">서버 판본이 도착했습니다. 지금 화면은 기기 사본으로 만든 것이라 이월 항목이 다를 수 있습니다.</span>
                <button onClick={reloadFromServer}
                  className="flex-shrink-0 px-2 py-1 rounded border border-amber-300 hover:bg-amber-100">서버 기준으로 다시 불러오기(입력 내용 버림)</button>
              </div>
            )}
            {staleSuggestion && staleSuggestion.date === currentDate && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                <div className="font-medium mb-1">
                  직전 일지({staleSuggestion.prevDate})에 없던 옛 항목 {staleSuggestion.docs.length + staleSuggestion.tasks.length}건이 이 날짜 목록에 들어 있습니다.
                </div>
                <div className="text-amber-800 mb-1.5">이미 처리한 항목이 예전 이월 방식 때문에 되살아난 것일 수 있습니다. 확인 후 빼면 완료한 것으로 기록되어 다시 나오지 않습니다.</div>
                <ul className="list-disc pl-5 space-y-0.5 mb-2">
                  {staleSuggestion.docs.map((i) => <li key={`d-${i.id}`}>제출 예정 서면: {i.text}{i.dueDate ? ` (~${i.dueDate})` : ""} <span className="text-amber-600">· {i.sourceDate} 기록</span></li>)}
                  {staleSuggestion.tasks.map((i) => <li key={`t-${i.id}`}>할 일: {i.text} <span className="text-amber-600">· {i.sourceDate} 기록</span></li>)}
                </ul>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={removeStaleItems} className="px-2 py-1 rounded border border-amber-300 bg-white hover:bg-amber-100">이 {staleSuggestion.docs.length + staleSuggestion.tasks.length}건 목록에서 빼기(처리한 것으로 기록)</button>
                  <button onClick={() => setStaleSuggestion(null)} className="px-2 py-1 rounded border border-amber-200 hover:bg-amber-100">그대로 두기</button>
                </div>
              </div>
            )}
            {cleanedNotice && cleanedNotice.date === currentDate && (
              <div className="mb-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 flex items-start gap-2">
                <span className="flex-1 min-w-0">이미 처리한 항목 {cleanedNotice.count}건이 다시 나타나 있어 목록에서 정리했습니다(앞선 날짜의 완료 기록 기준). 저장하면 정리된 목록이 보관됩니다.</span>
                <button onClick={() => setCleanedNotice(null)} className="flex-shrink-0 text-slate-400 hover:text-slate-600">✕</button>
              </div>
            )}
            {draftOffer && (
              <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900 flex items-center gap-2 flex-wrap">
                <span className="flex-1 min-w-0">이 기기에 저장하지 않은 초안이 있습니다({fmtStamp(draftOffer.at)} 작성). 복구하면 그 내용으로 이어서 쓰고, 저장할 때 그 뒤 다른 기기에서 바뀐 내용과 합칩니다.</span>
                <button onClick={restoreDraft} className="flex-shrink-0 px-2 py-1 rounded border border-indigo-300 bg-white hover:bg-indigo-100">초안 복구</button>
                <button onClick={discardDraft} className="flex-shrink-0 px-2 py-1 rounded border border-indigo-200 hover:bg-indigo-100">버리기</button>
              </div>
            )}
            {saveNotice && (
              <div className={`mb-3 rounded-lg border px-3 py-2 text-xs flex items-start gap-2 ${
                saveNotice.tone === "err" ? "border-red-200 bg-red-50 text-red-700"
                : saveNotice.tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
                <span className="flex-1 min-w-0">{saveNotice.text}</span>
                <button onClick={() => setSaveNotice(null)} className="flex-shrink-0 opacity-60 hover:opacity-100">✕</button>
              </div>
            )}
            {/* 헤더 */}
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <div className="flex items-center gap-3">
                <input
                  type="date"
                  value={currentDate}
                  onChange={(e) => changeDate(e.target.value)}
                  className="input font-mono text-sm w-44"
                />
                <span className="text-sm text-slate-500">{fmtDateLabel(currentDate)}</span>
              </div>
              <div className="flex items-center gap-2">
                {savedFlash && <span className="text-xs text-emerald-600">✓ 저장됨</span>}
                {dirty && <span className="text-xs text-amber-500">● 미저장</span>}
                <button onClick={runDailyCloseCheck} className="btn-ghost text-sm">마감 점검</button>
                <button onClick={() => save()} disabled={saving} className="btn-primary text-sm">{saving ? "저장 중…" : "저장"}</button>
              </div>
            </div>

            {/* 출퇴근 시간은 쓰지 않아 숨긴다(저장된 값은 그대로 둔다) */}

            <DelegatedPanel items={form.delegatedItems} cases={cases} currentDate={currentDate}
              assignees={assigneeOptions}
              onChange={handleDelegatedChange} onReschedule={handleDelegatedReschedule}
              onPushItem={onPushTask ? handlePushItem : null} field="delegatedItems" />

            <Section key={`schedule-${currentDate}`} title="오늘 일정·상담" count={dayHearings.length + dayConsults.length}
              hint="기일은 보기만 · 상담 메모는 「메모 저장」으로 바로 저장">
              <ConsultPanel hearings={dayHearings} consults={dayConsults}
                onSaveMemo={onSaveConsultMemo} onCreateCase={onCreateCaseFromConsult} />
            </Section>

            <Section key={`tasks-${currentDate}`} title="할 일" count={openTaskCount} defaultOpen
              hint="날짜를 달면 그날까지 매일 따라옴 · 체크하면 끝">
              <ChecklistEditor items={form.todayTasks} cases={cases} showCase showDetails
                field="todayTasks" onPushItem={onPushTask ? handlePushItem : null}
                today={currentDate}
                quickDates={[{ label: "오늘", value: currentDate }, { label: "내일", value: addDaysToKey(currentDate, 1) }]}
                onChange={handleTodayTasksChange} placeholder="할 일 입력 후 Enter (사건 없이도 됨)" emptyHint="남은 할 일이 없습니다." />
            </Section>

            <Section key={`work-${currentDate}`} title="오늘 한 일" count={(form.workItems || []).length} defaultOpen
              hint="사건을 고른 것만 '사건에 기록' → 진행경과">
              <WorkLogEditor items={form.workItems} cases={cases} defaultDate={currentDate}
                onRecord={onUpdateCase ? handleRecordWork : null}
                onChange={(v) => update({ workItems: v })} />
            </Section>

            <Section key={`learned-${currentDate}`} title="배운 점" count={(form.learnedItems || []).length} defaultOpen={false}
              hint="주제별로 모아 복기">
              <LearnedEditor items={form.learnedItems} topics={topicOptions}
                onChange={(v) => update({ learnedItems: v })} />
            </Section>

            {legacyCount > 0 && (
              <Section key={`legacy-${currentDate}`} title="예전 칸" count={legacyCount} defaultOpen={false} hint="읽기 전용">
                <LegacyFields form={form} />
              </Section>
            )}

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
      {conflictState && (
        <JournalConflictDialog
          conflicts={conflictState.conflicts}
          onResolve={(choices) => save({ ...(conflictState.prior || {}), ...choices })}
          onCancel={() => setConflictState(null)}
        />
      )}
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
