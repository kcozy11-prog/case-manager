import { useState } from "react";
import { fmtDate } from "../utils";

export default function UnmatchedTasksModal({ tasks, cases, onAddToCase, onIgnore, onClose }) {
  // 각 태스크별 선택된 사건 ID 상태
  const [selections, setSelections] = useState(
    Object.fromEntries(tasks.map(({ task }) => [task.id, ""]))
  );
  // 이미 처리된 태스크 ID (추가 or 무시)
  const [dismissed, setDismissed] = useState(new Set());

  const setSelection = (taskId, caseId) => {
    setSelections(prev => ({ ...prev, [taskId]: caseId }));
  };

  const handleAdd = (task) => {
    const caseId = selections[task.id];
    if (!caseId) return;
    const caseObj = cases.find(c => c.id === caseId);
    if (!caseObj) return;
    onAddToCase(task, caseObj);
    setDismissed(prev => new Set([...prev, task.id]));
  };

  const handleIgnore = (taskId) => {
    if (onIgnore) onIgnore(taskId); // 영구 무시 저장 → 다음 동기화부터 숨김
    setDismissed(prev => new Set([...prev, taskId]));
  };

  const handleIgnoreAll = () => {
    remaining.forEach(({ task }) => { if (onIgnore) onIgnore(task.id); });
    setDismissed(prev => new Set([...prev, ...remaining.map(({ task }) => task.id)]));
  };

  const remaining = tasks.filter(({ task }) => !dismissed.has(task.id));

  const dueLabel = (due) => {
    if (!due) return null;
    // Google Tasks due는 RFC 3339 형식
    const d = due.split("T")[0];
    return fmtDate(d);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between" style={{ background: "#1E293B" }}>
          <div>
            <div className="text-white font-semibold">📋 미매칭 할 일</div>
            <div className="text-slate-400 text-xs">사건에 추가하거나 무시할 수 있습니다 · 완료된 할일은 자동 숨김 · 무시 시 다시 안 나옵니다</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        {/* 본문 */}
        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          {remaining.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              모든 항목을 처리했습니다. 🎉
            </div>
          ) : (
            remaining.map(({ task }) => (
              <div key={task.id} className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2">
                {/* 태스크 제목 및 날짜 */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 leading-snug">{task.title}</div>
                    {task.notes && (
                      <div className="text-xs text-slate-500 mt-0.5 whitespace-pre-wrap break-words leading-relaxed">{task.notes}</div>
                    )}
                    {task.due && (
                      <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                        <span>📅</span> {dueLabel(task.due)}
                      </div>
                    )}
                  </div>
                </div>

                {/* 사건 선택 + 버튼 */}
                <div className="flex items-center gap-2">
                  <select
                    className="flex-1 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                    value={selections[task.id]}
                    onChange={e => setSelection(task.id, e.target.value)}
                  >
                    <option value="">— 사건 선택 —</option>
                    {cases.filter(c => c.status === "진행중").map(c => (
                      <option key={c.id} value={c.id}>{c.title} ({c.client})</option>
                    ))}
                    {cases.filter(c => c.status !== "진행중").map(c => (
                      <option key={c.id} value={c.id}>[종결] {c.title} ({c.client})</option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleAdd(task)}
                    disabled={!selections[task.id]}
                    className="text-xs bg-indigo-500 hover:bg-indigo-400 disabled:bg-slate-200 disabled:text-slate-400 text-white px-3 py-1.5 rounded-lg transition-colors font-medium whitespace-nowrap"
                  >
                    이 사건에 추가
                  </button>
                  <button
                    onClick={() => handleIgnore(task.id)}
                    title="이 할일을 영구히 숨깁니다 (다음 동기화에도 안 나옴)"
                    className="text-xs text-slate-400 hover:text-rose-600 border border-slate-200 hover:border-rose-300 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                  >
                    무시
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 푸터 */}
        <div className="px-5 py-3 border-t border-slate-100 flex justify-between items-center">
          {remaining.length > 0 ? (
            <button onClick={handleIgnoreAll}
              className="text-sm text-slate-400 hover:text-rose-600 transition-colors">
              남은 {remaining.length}건 모두 무시
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
