import { useState } from "react";
import { fmtDate } from "../utils";

function eventKey(item, index) {
  return item.id || item.event?.id || `${item.summary}-${item.date}-${item.time}-${index}`;
}

function caseLabel(c) {
  const bits = [c.title, c.client && `의뢰인: ${c.client}`, c.caseNumber, c.court].filter(Boolean);
  return bits.join(" · ");
}

export default function UnmatchedCalendarEventsModal({ events, cases, onAddToCase, onClose }) {
  const initialSelections = Object.fromEntries(events.map((item, idx) => [eventKey(item, idx), ""]));
  const [selections, setSelections] = useState(initialSelections);
  const [dismissed, setDismissed] = useState(new Set());
  const [savingId, setSavingId] = useState(null);

  const remaining = events.filter((item, idx) => !dismissed.has(eventKey(item, idx)));

  const setSelection = (key, caseId) => {
    setSelections(prev => ({ ...prev, [key]: caseId }));
  };

  const handleAdd = async (item, index) => {
    const key = eventKey(item, index);
    const caseId = selections[key];
    if (!caseId || !onAddToCase) return;
    const caseObj = cases.find(c => c.id === caseId);
    if (!caseObj) return;
    setSavingId(key);
    try {
      await onAddToCase(item, caseObj);
      setDismissed(prev => new Set([...prev, key]));
    } finally {
      setSavingId(null);
    }
  };

  const handleSkip = (item, index) => {
    setDismissed(prev => new Set([...prev, eventKey(item, index)]));
  };

  const skipAll = () => {
    setDismissed(prev => new Set([
      ...prev,
      ...remaining.map((item, idx) => eventKey(item, idx)),
    ]));
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between" style={{ background: "#1E293B" }}>
          <div>
            <div className="text-white font-semibold">⚖️ 수동 확인 필요한 LBOX 일정</div>
            <div className="text-slate-400 text-xs">사건번호가 일치하는 사건이 없거나 일정에서 사건번호를 찾을 수 없을 때만 수동 확인합니다.</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          {remaining.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              모든 일정을 처리했습니다. 🎉
            </div>
          ) : (
            remaining.map((item, idx) => {
              const key = eventKey(item, idx);
              return (
                <div key={key} className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-3">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-slate-800 leading-snug">{item.summary}</div>
                    <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
                      {item.date && <span>📅 {fmtDate(item.date)}{item.time ? ` ${item.time}` : ""}</span>}
                      {item.party && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">당사자 {item.party}</span>}
                      {item.caseNumber && <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{item.caseNumber}</span>}
                      {item.court && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{item.court}</span>}
                    </div>
                    {item.reason && (
                      <div className="text-[11px] text-rose-500">자동 연결 보류: {item.reason}</div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      className="flex-1 min-w-[260px] border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                      value={selections[key] || ""}
                      onChange={e => setSelection(key, e.target.value)}
                    >
                      <option value="">— 연결할 사건 선택 —</option>
                      {cases.filter(c => c.status === "진행중").map(c => (
                        <option key={c.id} value={c.id}>{caseLabel(c)}</option>
                      ))}
                      {cases.filter(c => c.status !== "진행중").map(c => (
                        <option key={c.id} value={c.id}>[종결] {caseLabel(c)}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleAdd(item, idx)}
                      disabled={!selections[key] || savingId === key}
                      className="text-xs bg-indigo-500 hover:bg-indigo-400 disabled:bg-slate-200 disabled:text-slate-400 text-white px-3 py-1.5 rounded-lg transition-colors font-medium whitespace-nowrap"
                    >
                      {savingId === key ? "추가 중…" : "선택 사건에 기일 추가"}
                    </button>
                    <button
                      onClick={() => handleSkip(item, idx)}
                      className="text-xs text-slate-400 hover:text-rose-600 border border-slate-200 hover:border-rose-300 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                    >
                      이번엔 건너뛰기
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex justify-between items-center">
          {remaining.length > 0 ? (
            <button onClick={skipAll} className="text-sm text-slate-400 hover:text-rose-600 transition-colors">
              남은 {remaining.length}건 모두 건너뛰기
            </button>
          ) : <span />}
          <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-400 px-4 py-1.5 rounded-lg transition-colors">
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
