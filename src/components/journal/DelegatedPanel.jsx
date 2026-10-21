import { useState } from "react";
import CaseSearchSelect from "./CaseSearchSelect";
import { dueBadge, splitDelegatedForDisplay, DEFAULT_ASSIGNEE } from "../../journalView";

const BADGE_CLASS = {
  red: "bg-red-100 text-red-700 border-red-200",
  amber: "bg-amber-100 text-amber-700 border-amber-200",
  slate: "bg-slate-100 text-slate-600 border-slate-200",
};

const mkId = () => `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// 위임 업무 한 칸: 입력·완료·취소·기한 변경·사건 선택을 모두 여기서 한다.
//  items 는 그날 일지의 delegatedItems(과거 미완료 이월분 포함). 바꾼 목록은 onChange 로 넘기고,
//  JournalApp 이 완료·삭제 기록(delegatedCompletions)을 남긴다.
//  onReschedule(item, { dueDate, reason }) → 기한 변경 이력 보존
export default function DelegatedPanel({
  items = [], cases = [], currentDate, assignees = [DEFAULT_ASSIGNEE],
  onChange, onReschedule, onPushItem = null, field = "delegatedItems",
}) {
  const [text, setText] = useState("");
  const [assignee, setAssignee] = useState(DEFAULT_ASSIGNEE);
  const [otherAssignee, setOtherAssignee] = useState(false);
  const [caseId, setCaseId] = useState("");
  const [due, setDue] = useState("");
  const [details, setDetails] = useState("");
  const [showAddDetails, setShowAddDetails] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [expandedId, setExpandedId] = useState(null); // 상세·사건 편집 중인 항목
  const [rescheduleId, setRescheduleId] = useState(null);
  const [rescheduleDue, setRescheduleDue] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [pushingId, setPushingId] = useState(null);
  const [pushErr, setPushErr] = useState(null);

  const { pending, done } = splitDelegatedForDisplay(items);
  const caseTitleOf = (id) => cases.find((c) => c.id === id)?.title || "";

  const add = () => {
    const t = text.trim();
    if (!t) return;
    onChange([...(items || []), {
      id: mkId(), text: t, done: false,
      details: details.trim(), dueDate: due,
      assignee: (assignee || "").trim() || DEFAULT_ASSIGNEE,
      cmCaseId: caseId, cmCaseTitle: caseTitleOf(caseId),
      createdAt: new Date().toISOString(),
    }]);
    setText(""); setDue(""); setCaseId(""); setDetails(""); setShowAddDetails(false);
  };

  const updateItem = (id, patch) => onChange((items || []).map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const setDone = (id, value) => updateItem(id, { done: value });
  const cancel = (item) => {
    if (!window.confirm(`위임 업무를 취소할까요?\n\n${item.assignee ? `@${item.assignee} ` : ""}${item.text}\n\n취소하면 다음 날부터 따라오지 않습니다.`)) return;
    onChange((items || []).filter((it) => it.id !== item.id));
  };

  const openReschedule = (item) => { setRescheduleId(item.id); setRescheduleDue(item.dueDate || ""); setRescheduleReason(""); };
  const closeReschedule = () => { setRescheduleId(null); setRescheduleDue(""); setRescheduleReason(""); };
  const applyReschedule = (item) => {
    if ((item.dueDate || "") !== rescheduleDue) onReschedule(item, { dueDate: rescheduleDue, reason: rescheduleReason });
    closeReschedule();
  };

  const push = async (item) => {
    if (!onPushItem || !item.dueDate) return;
    setPushingId(item.id); setPushErr(null);
    try { await onPushItem(item, field); } catch (e) { setPushErr({ id: item.id, msg: e.message || "캘린더 등록 실패" }); } finally { setPushingId(null); }
  };

  const pickAssignee = (name) => { setAssignee(name); setOtherAssignee(false); };

  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-sm font-semibold text-amber-900">위임 업무</div>
        <span className="text-xs font-semibold text-amber-800 bg-white/70 border border-amber-200 rounded-full px-2 py-0.5">
          미확인 {pending.length}건
        </span>
      </div>

      {pending.length > 0 && (
        <ul className="space-y-1.5 mb-2">
          {pending.map((item) => {
            const badge = dueBadge(item.dueDate, currentDate);
            const open = expandedId === item.id;
            return (
              <li key={item.id} className="bg-white rounded-lg border border-amber-100 px-2.5 py-2">
                <div className="flex items-start gap-2">
                  <span className={`text-[11px] rounded-full border px-1.5 py-0.5 flex-shrink-0 ${BADGE_CLASS[badge.tone]}`}>{badge.text}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-800 leading-snug">
                      {item.assignee && <span className="font-semibold text-indigo-600 mr-1">@{item.assignee}</span>}
                      {item.text}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                      {item.dueDate && <span>확인일 {item.dueDate}</span>}
                      {item.sourceDate && item.sourceDate !== currentDate && <span>위임일 {item.sourceDate}</span>}
                      {item.cmCaseTitle && <span className="text-indigo-400">사건 {item.cmCaseTitle}</span>}
                    </div>
                    {!open && item.details && <div className="text-xs text-slate-500 mt-1 whitespace-pre-wrap">{item.details}</div>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
                    <button onClick={() => setDone(item.id, true)} className="text-[11px] px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100">완료</button>
                    <button onClick={() => (rescheduleId === item.id ? closeReschedule() : openReschedule(item))}
                      className="text-[11px] px-2 py-1 rounded bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50">기한</button>
                    <button onClick={() => setExpandedId(open ? null : item.id)}
                      className={`text-[11px] px-2 py-1 rounded border ${open ? "bg-slate-100 border-slate-300 text-slate-600" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}
                      title="사건·상세 메모 고치기">{open ? "닫기" : "편집"}</button>
                    <button onClick={() => cancel(item)} className="text-[11px] px-2 py-1 rounded bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100">취소</button>
                  </div>
                </div>

                {rescheduleId === item.id && (
                  <div className="mt-1.5 rounded-lg border border-indigo-100 bg-indigo-50/50 p-2 flex flex-wrap items-end gap-1.5">
                    <label className="text-[11px] text-slate-500">
                      새 확인일
                      <input type="date" value={rescheduleDue} onChange={(e) => setRescheduleDue(e.target.value)}
                        className="input block mt-0.5 text-xs w-[132px] font-mono" autoFocus />
                    </label>
                    <label className="text-[11px] text-slate-500 flex-1 min-w-[150px]">
                      변경 사유 <span className="text-slate-300">(선택)</span>
                      <input value={rescheduleReason} onChange={(e) => setRescheduleReason(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyReschedule(item); } }}
                        placeholder="예: 1차 확인 결과 보완 필요" className="input block mt-0.5 text-xs w-full" />
                    </label>
                    <button onClick={() => applyReschedule(item)} disabled={(item.dueDate || "") === rescheduleDue}
                      className="text-[11px] px-2 py-1 rounded bg-indigo-600 text-white disabled:opacity-40 hover:bg-indigo-700">적용</button>
                    <button onClick={closeReschedule} className="text-[11px] px-1.5 py-1 text-slate-500 hover:text-slate-700">닫기</button>
                  </div>
                )}

                {Array.isArray(item.dueDateChanges) && item.dueDateChanges.length > 0 && (
                  <div className="mt-1 text-[11px] text-slate-400 leading-relaxed">
                    <span className="text-slate-500">기한 변경</span>
                    {item.dueDateChanges.map((change, index) => (
                      <span key={`${change.changedAt || change.changedDate || index}_${index}`} className="ml-1.5">
                        {index + 1}차 {change.changedDate || String(change.changedAt || "").slice(0, 10)} {change.fromDate || "미지정"}→{change.toDate || "미지정"}{change.reason ? ` (${change.reason})` : ""}
                      </span>
                    ))}
                  </div>
                )}

                {open && (
                  <div className="mt-1.5 space-y-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <CaseSearchSelect cases={cases} value={item.cmCaseId || ""}
                        onChange={(id) => updateItem(item.id, { cmCaseId: id, cmCaseTitle: caseTitleOf(id) })}
                        placeholder="관련 사건(선택)" className="w-[200px]" />
                      {item.cmCaseId && (
                        <button onClick={() => updateItem(item.id, { cmCaseId: "", cmCaseTitle: "" })}
                          className="text-[11px] text-slate-400 hover:text-slate-600">사건 연결 해제</button>
                      )}
                      {onPushItem && item.dueDate && (
                        <button onClick={() => push(item)} disabled={pushingId === item.id}
                          className={`text-[11px] px-2 py-0.5 rounded border disabled:opacity-40 ${item.needsCalendarSync ? "border-amber-300 text-amber-700" : item.googleEventId ? "border-emerald-300 text-emerald-600" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}
                          title={item.needsCalendarSync ? "기한이 바뀌었습니다. 눌러 캘린더 일정도 갱신하세요." : item.googleEventId ? "캘린더에 등록됨(다시 누르면 갱신)" : "구글 캘린더에 추가"}>
                          {pushingId === item.id ? "…" : item.needsCalendarSync ? "📅 갱신 필요" : item.googleEventId ? "📅 등록됨" : "📅 캘린더"}
                        </button>
                      )}
                    </div>
                    <textarea value={item.details || ""} onChange={(e) => updateItem(item.id, { details: e.target.value })}
                      placeholder="상세 메모" className="input text-xs w-full min-h-[52px]" />
                  </div>
                )}
                {pushErr && pushErr.id === item.id && <div className="text-[11px] text-red-500 mt-0.5">⚠ {pushErr.msg}</div>}
              </li>
            );
          })}
        </ul>
      )}

      {/* 입력 */}
      <div className="rounded-lg border border-amber-100 bg-white/80 p-2 space-y-1.5">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[11px] text-slate-400 mr-0.5">담당</span>
          {assignees.map((name) => (
            <button key={name} onClick={() => pickAssignee(name)}
              className={`text-[11px] px-2 py-0.5 rounded-full border ${!otherAssignee && assignee === name ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"}`}>
              {name}
            </button>
          ))}
          {otherAssignee ? (
            <input value={assignee} onChange={(e) => setAssignee(e.target.value)} autoFocus
              placeholder="담당자 이름" className="input text-[11px] w-24 py-0.5" />
          ) : (
            <button onClick={() => { setOtherAssignee(true); setAssignee(""); }}
              className="text-[11px] px-2 py-0.5 rounded-full border border-dashed border-slate-300 text-slate-400 hover:text-slate-600">다른 사람</button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <input value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); add(); } }}
            placeholder="맡긴 일 입력 후 Enter" className="input text-xs flex-[4_1_220px] min-w-[160px]" />
          <CaseSearchSelect cases={cases} value={caseId} onChange={setCaseId}
            placeholder="관련 사건(선택)" className="flex-[0_1_150px] min-w-[120px]" />
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} title="확인일"
            className="input text-xs flex-[0_1_130px] min-w-[112px] font-mono" />
          <button onClick={() => setShowAddDetails((v) => !v)}
            className={`text-xs px-1.5 ${showAddDetails || details ? "text-indigo-500" : "text-slate-300 hover:text-indigo-400"}`} title="상세 메모">📝</button>
          <button onClick={add} className="btn-ghost text-xs whitespace-nowrap px-3">+ 추가</button>
        </div>
        {showAddDetails && (
          <textarea value={details} onChange={(e) => setDetails(e.target.value)}
            placeholder="상세 메모(선택)" className="input text-xs w-full min-h-[44px]" />
        )}
      </div>

      {done.length > 0 && (
        <div className="mt-2">
          <button onClick={() => setShowDone((v) => !v)} className="text-[11px] text-slate-500 hover:text-slate-700">
            {showDone ? "▾" : "▸"} 오늘 완료 {done.length}건
          </button>
          {showDone && (
            <ul className="mt-1 space-y-0.5">
              {done.map((item) => (
                <li key={item.id} className="flex items-center gap-2 text-xs text-slate-400 px-1">
                  <span className="line-through flex-1 min-w-0 truncate">
                    {item.assignee ? `@${item.assignee} ` : ""}{item.text}{item.cmCaseTitle ? ` · ${item.cmCaseTitle}` : ""}
                  </span>
                  <button onClick={() => setDone(item.id, false)} className="text-[11px] text-indigo-400 hover:text-indigo-600 flex-shrink-0">되돌리기</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
