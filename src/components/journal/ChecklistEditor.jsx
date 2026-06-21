import { useState } from "react";

// 재사용 체크리스트 에디터
// items: [{ id, text, done, details?, dueDate?, assignee?, cmCaseId?, cmCaseTitle?, googleEventId?, cmBriefId?, sourceDate? }]
// 옵션: showDate, showAssignee, showCase(+cases), showDetails, onPushItem(item, field)+field,
//       onSendToCase(item, field) → 사건 제출대기서면 보내기(행별 사건 선택 활성), placeholder
export default function ChecklistEditor({
  items = [],
  onChange,
  field = "",
  placeholder = "입력 후 Enter",
  showDate = true,
  showAssignee = false,
  showCase = false,
  showDetails = false,
  cases = [],
  onPushItem = null,
  onSendToCase = null,
  emptyHint = "항목이 없습니다.",
}) {
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const [assignee, setAssignee] = useState("");
  const [caseId, setCaseId] = useState("");
  const [expandedId, setExpandedId] = useState(null); // 상세 편집 중인 항목
  const [pushingId, setPushingId] = useState(null);
  const [pushErr, setPushErr] = useState(null);
  const [sendingId, setSendingId] = useState(null);
  const [sendErr, setSendErr] = useState(null);

  const mkId = () => `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const add = () => {
    const t = text.trim();
    if (!t) return;
    const selCase = cases.find((c) => c.id === caseId);
    const item = {
      id: mkId(),
      text: t,
      done: false,
      details: "",
      dueDate: showDate ? due : "",
      assignee: showAssignee ? assignee.trim() : "",
      cmCaseId: showCase ? caseId : "",
      cmCaseTitle: showCase && selCase ? selCase.title : "",
      createdAt: new Date().toISOString(),
    };
    onChange([...items, item]);
    setText(""); setDue(""); setAssignee(""); setCaseId("");
  };

  const updateItem = (id, patch) =>
    onChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const toggle = (id) => updateItem(id, { done: !items.find((i) => i.id === id)?.done });
  const remove = (id) => onChange(items.filter((it) => it.id !== id));

  const push = async (item) => {
    if (!onPushItem || !item.dueDate) return;
    setPushingId(item.id); setPushErr(null);
    try {
      await onPushItem(item, field);
    } catch (e) {
      setPushErr({ id: item.id, msg: e.message || "캘린더 등록 실패" });
    } finally {
      setPushingId(null);
    }
  };

  const send = async (item) => {
    if (!onSendToCase) return;
    if (!item.cmCaseId) { setSendErr({ id: item.id, msg: "관련 사건을 먼저 선택하세요." }); return; }
    setSendingId(item.id); setSendErr(null);
    try {
      await onSendToCase(item, field);
    } catch (e) {
      setSendErr({ id: item.id, msg: e.message || "서면 보내기 실패" });
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="space-y-2">
      {items.length === 0 ? (
        <div className="text-xs text-slate-300 px-1 py-1">{emptyHint}</div>
      ) : (
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={it.id} className="group">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!it.done}
                  onChange={() => toggle(it.id)}
                  className="w-4 h-4 rounded border-slate-300 accent-indigo-600 flex-shrink-0"
                />
                <span className={`text-sm flex-1 min-w-0 ${it.done ? "line-through text-slate-300" : "text-slate-700"}`}>
                  {it.text}
                  {it.assignee && <span className="ml-1.5 text-xs text-slate-400">@{it.assignee}</span>}
                  {!onSendToCase && it.cmCaseTitle && <span className="ml-1.5 text-xs text-indigo-400">· {it.cmCaseTitle}</span>}
                  {it.sourceDate && <span className="ml-1.5 text-[11px] text-amber-500">↪{it.sourceDate.slice(5)}</span>}
                </span>
                {onSendToCase && showCase && (
                  <select
                    value={it.cmCaseId || ""}
                    onChange={(e) => {
                      const id = e.target.value;
                      updateItem(it.id, { cmCaseId: id, cmCaseTitle: cases.find((c) => c.id === id)?.title || "" });
                    }}
                    className="input text-[11px] flex-shrink-0 w-[110px] py-0.5"
                    title="관련 사건">
                    <option value="">사건 선택</option>
                    {cases.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                )}
                {it.dueDate && (
                  <span className="text-[11px] text-slate-400 font-mono flex-shrink-0">{it.dueDate.slice(5)}</span>
                )}
                {showDetails && (
                  <button
                    onClick={() => setExpandedId(expandedId === it.id ? null : it.id)}
                    className={`flex-shrink-0 text-xs px-1 ${it.details ? "text-indigo-400" : "text-slate-300 hover:text-indigo-400"}`}
                    title="상세 설명">📝</button>
                )}
                {onPushItem && it.dueDate && (
                  <button
                    onClick={() => push(it)}
                    disabled={pushingId === it.id}
                    className={`flex-shrink-0 text-xs px-1 disabled:opacity-40 ${
                      it.googleEventId ? "text-emerald-500 hover:text-emerald-600" : "text-slate-300 hover:text-indigo-400"
                    }`}
                    title={it.googleEventId ? "캘린더에 동기화됨 (다시 누르면 갱신)" : "구글 캘린더에 추가"}>
                    {pushingId === it.id ? "…" : it.googleEventId ? "📅✓" : "📅"}
                  </button>
                )}
                {onSendToCase && (
                  <button
                    onClick={() => send(it)}
                    disabled={sendingId === it.id || !it.cmCaseId}
                    className={`flex-shrink-0 text-xs px-1 disabled:opacity-30 ${
                      it.cmBriefId ? "text-emerald-500 hover:text-emerald-600" : "text-slate-300 hover:text-indigo-400"
                    }`}
                    title={!it.cmCaseId ? "관련 사건을 먼저 선택하세요" : it.cmBriefId ? "사건 제출대기서면에 추가됨 (다시 누르면 갱신)" : "사건 제출대기서면으로 보내기"}>
                    {sendingId === it.id ? "…" : it.cmBriefId ? "📄✓" : "📄"}
                  </button>
                )}
                <button
                  onClick={() => remove(it.id)}
                  className="text-slate-300 hover:text-red-500 text-sm flex-shrink-0 opacity-0 group-hover:opacity-100"
                  title="삭제">✕</button>
              </div>

              {/* 상세 설명: 보기 + 인라인 편집 */}
              {showDetails && expandedId === it.id && (
                <textarea
                  value={it.details || ""}
                  onChange={(e) => updateItem(it.id, { details: e.target.value })}
                  placeholder="상세 설명 (캘린더 일정 설명에도 포함됩니다)"
                  className="input text-xs w-full mt-1 ml-6 min-h-[60px]"
                  style={{ width: "calc(100% - 1.5rem)" }}
                  autoFocus
                />
              )}
              {showDetails && expandedId !== it.id && it.details && (
                <div className="text-xs text-slate-400 ml-6 mt-0.5 whitespace-pre-wrap leading-relaxed">{it.details}</div>
              )}
              {pushErr && pushErr.id === it.id && (
                <div className="text-[11px] text-red-500 ml-6 mt-0.5">⚠ {pushErr.msg}</div>
              )}
              {sendErr && sendErr.id === it.id && (
                <div className="text-[11px] text-red-500 ml-6 mt-0.5">⚠ {sendErr.msg}</div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-1.5 pt-1">
        {showAssignee && (
          <input
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            placeholder="담당자"
            className="input text-xs flex-[1_1_90px] min-w-[90px]"
          />
        )}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="input text-xs flex-[2_1_180px] min-w-[140px]"
        />
        {showCase && (
          <select
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            className="input text-xs flex-[1_1_140px] min-w-[120px]">
            <option value="">관련 사건(선택)</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        )}
        {showDate && (
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="input text-xs flex-[0_1_140px] min-w-[120px] font-mono"
          />
        )}
        <button
          onClick={add}
          className="btn-ghost text-xs whitespace-nowrap px-3">+ 추가</button>
      </div>
    </div>
  );
}
