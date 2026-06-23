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
                <button
                  onClick={() => remove(it.id)}
                  className="text-slate-300 hover:text-red-500 text-sm flex-shrink-0 opacity-0 group-hover:opacity-100"
                  title="삭제">✕</button>
              </div>

              {/* 사건 연동: 관련 사건 선택 + 사건 제출대기서면으로 보내기 (전용 줄로 분리해 눈에 잘 띄게) */}
              {onSendToCase && (
                <div className="flex items-center gap-2 flex-wrap ml-6 mt-1">
                  <span className="text-[11px] text-slate-400 flex-shrink-0">사건 연동</span>
                  <select
                    value={it.cmCaseId || ""}
                    onChange={(e) => {
                      const id = e.target.value;
                      updateItem(it.id, { cmCaseId: id, cmCaseTitle: cases.find((c) => c.id === id)?.title || "" });
                    }}
                    className="input text-[11px] py-0.5 w-[150px] flex-shrink-0"
                    title="관련 사건">
                    <option value="">관련 사건 선택…</option>
                    {cases.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                  {/* 사건 미선택이어도 버튼은 눌리게 두고, 누르면 안내 메시지 표시(조용한 무반응 방지) */}
                  <button
                    onClick={() => send(it)}
                    disabled={sendingId === it.id}
                    className={`text-[11px] px-2 py-0.5 rounded border flex-shrink-0 transition-colors disabled:opacity-50 ${
                      it.cmBriefId
                        ? "border-emerald-300 text-emerald-600 bg-emerald-50 hover:bg-emerald-100"
                        : it.cmCaseId
                          ? "border-indigo-300 text-indigo-600 hover:bg-indigo-50"
                          : "border-slate-300 text-slate-500 hover:bg-slate-50"
                    }`}
                    title={it.cmBriefId ? "사건 제출대기서면에 추가됨 (다시 누르면 갱신)" : "사건 제출대기서면으로 보내기"}>
                    {sendingId === it.id ? "전송 중…" : it.cmBriefId ? "📄 전송됨 · 갱신" : "📄 사건에 보내기"}
                  </button>
                  {!it.cmCaseId && <span className="text-[11px] text-amber-500 flex-shrink-0">← 먼저 사건을 선택하세요</span>}
                </div>
              )}

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
                <div className="text-[11px] text-red-600 font-medium ml-6 mt-1 px-2 py-1 rounded bg-red-50 border border-red-200 inline-block">⚠ {sendErr.msg}</div>
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
          className="input text-xs flex-[4_1_220px] min-w-[160px]"
        />
        {showCase && (
          <select
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            className="input text-xs flex-[0_1_120px] min-w-[100px]">
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
            className="input text-xs flex-[0_1_130px] min-w-[112px] font-mono"
          />
        )}
        <button
          onClick={add}
          className="btn-ghost text-xs whitespace-nowrap px-3">+ 추가</button>
      </div>
    </div>
  );
}
