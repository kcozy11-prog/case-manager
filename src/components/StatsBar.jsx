import { useState } from "react";
import { today, dday, fmtDate } from "../utils";
import { buildPendingTodos } from "../statsTodos";

export default function StatsBar({ cases, standaloneTodos = [], onSelectCase, onOpenStandaloneTodos }) {
  const [dropdown, setDropdown] = useState(null); // "month" | "week" | "todos" | null

  // 이번 달 기일 목록
  const monthHearings = cases.flatMap(c =>
    (c.hearings || []).filter(h => {
      const d = new Date(h.date);
      return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && dday(h.date) >= 0;
    }).map(h => ({ ...h, caseId: c.id, caseTitle: c.title }))
  ).sort((a, b) => new Date(a.date) - new Date(b.date));

  // 7일 내 기일 목록
  const weekHearings = cases.flatMap(c =>
    (c.hearings || []).filter(h => {
      const n = dday(h.date); return n !== null && n >= 0 && n <= 7;
    }).map(h => ({ ...h, caseId: c.id, caseTitle: c.title }))
  ).sort((a, b) => new Date(a.date) - new Date(b.date));

  // 미완료 할 일 목록
  const pendingTodos = buildPendingTodos(cases, new Date(), standaloneTodos);

  // 불변기간 미체크 항목 (마감일 임박순 정렬)
  const uncheckedDeadlines = cases.filter(c => c.status === "진행중").flatMap(c =>
    (c.memos || []).filter(m => m.category === "불변기간" && !m.checked).map(m => ({ ...m, caseId: c.id, caseTitle: c.title }))
  ).sort((a, b) => new Date(a.date) - new Date(b.date));

  // 제출 대기 서면 (작성했으나 미제출 — 아침 컨펌 워크플로)
  const pendingBriefs = cases.filter(c => c.status === "진행중").flatMap(c =>
    (c.briefs || []).filter(b => b.status !== "submitted")
      .map(b => ({ ...b, caseId: c.id, caseTitle: c.title, displayDate: b.preparedDate ? fmtDate(b.preparedDate) : "" }))
  ).sort((a, b) => (a.preparedDate || "").localeCompare(b.preparedDate || ""));

  // 미수금 합계 (착수금 미입금분)
  const outstanding = cases.filter(c => c.status === "진행중").reduce((sum, c) => {
    const amt = Number(c.retainer?.amount) || 0;
    const paid = Number(c.retainer?.paidAmount) || 0;
    return sum + Math.max(0, amt - paid);
  }, 0);
  const outstandingCases = cases.filter(c => c.status === "진행중")
    .map(c => ({ c, due: Math.max(0, (Number(c.retainer?.amount) || 0) - (Number(c.retainer?.paidAmount) || 0)) }))
    .filter(x => x.due > 0)
    .map(x => ({ caseId: x.c.id, caseTitle: x.c.title, title: `${x.due.toLocaleString()}원 미입금` }));

  const active = cases.filter(c => c.status === "진행중").length;

  const stats = [
    { key: "active", label: "진행 중 사건", value: active, unit: "건", color: "#60A5FA", items: null },
    { key: "month", label: "이번 달 기일", value: monthHearings.length, unit: "건", color: "#34D399", items: monthHearings },
    { key: "week", label: "7일 내 기일", value: weekHearings.length, unit: "건", color: weekHearings.length > 0 ? "#F87171" : "#94A3B8", items: weekHearings },
    { key: "todos", label: "미완료 할 일", value: pendingTodos.length, unit: "건", color: pendingTodos.length > 0 ? "#FBBF24" : "#94A3B8", items: pendingTodos },
    { key: "deadlines", label: "불변기간", value: uncheckedDeadlines.length, unit: "건", color: uncheckedDeadlines.length > 0 ? "#F43F5E" : "#94A3B8", items: uncheckedDeadlines },
    { key: "briefs", label: "제출 대기 서면", value: pendingBriefs.length, unit: "건", color: pendingBriefs.length > 0 ? "#FB923C" : "#94A3B8", items: pendingBriefs },
    { key: "outstanding", label: "미수금",
      value: outstanding >= 10000 ? Math.floor(outstanding / 10000).toLocaleString() : outstanding.toLocaleString(),
      unit: outstanding >= 10000 ? "만원" : "원",
      color: outstanding > 0 ? "#FBBF24" : "#94A3B8", items: outstandingCases.length ? outstandingCases : null },
  ];

  const handleClick = (s) => {
    if (!s.items || s.items.length === 0) return;
    setDropdown(dropdown === s.key ? null : s.key);
  };

  const handleItemClick = (item, tab) => {
    if (dropdown === "todos" && item.standalone) {
      if (onOpenStandaloneTodos) onOpenStandaloneTodos();
      setDropdown(null);
      return;
    }
    if (onSelectCase && item.caseId) onSelectCase(item.caseId, tab);
    setDropdown(null);
  };

  const activeDropdown = stats.find(s => s.key === dropdown);

  return (
    <div className="relative">
      <div style={{ background: "#1E293B" }} className="flex items-center gap-0 px-4 sm:px-6 py-0 border-b border-slate-700 overflow-x-auto">
        {stats.map((s) => (
          <div key={s.key}
            onClick={() => handleClick(s)}
            className={`flex items-center gap-3 px-4 sm:px-6 py-3 border-r border-slate-700 last:border-r-0 flex-shrink-0 ${
              s.items ? "cursor-pointer hover:bg-slate-700/50 transition-colors" : ""
            } ${dropdown === s.key ? "bg-slate-700/50" : ""}`}>
            <div>
              <div className="text-xs text-slate-400 leading-none mb-1 whitespace-nowrap">{s.label}</div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold leading-none" style={{ color: s.color, fontFamily: "'Courier New', monospace" }}>{s.value}</span>
                <span className="text-xs text-slate-400">{s.unit}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 드롭다운 목록 */}
      {activeDropdown && activeDropdown.items && activeDropdown.items.length > 0 && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setDropdown(null)} />
          <div className="absolute left-0 right-0 z-40 bg-slate-800 border-b border-slate-600 shadow-xl max-h-64 overflow-y-auto">
            {activeDropdown.items.map((item, i) => (
              <div key={i}
                onClick={() => handleItemClick(item, dropdown === "todos" ? "todos" : dropdown === "briefs" ? "briefs" : "overview")}
                className="flex items-center justify-between px-6 py-2.5 hover:bg-slate-700 cursor-pointer border-b border-slate-700/50 last:border-b-0 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-medium text-slate-300 truncate max-w-[200px]">{item.caseTitle}</span>
                  <span className="text-xs text-slate-400 truncate">{item.text || item.title || item.type || ""}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {dropdown === "todos" ? (
                    <>
                      <span className={`text-xs ${item.overdue ? "text-rose-300 font-semibold" : item.dueDate ? "text-slate-300" : "text-slate-500"}`}>
                        {item.displayDate}
                      </span>
                      {item.dueDate && dday(item.dueDate) !== null && (
                        <span className={`text-xs font-bold ${item.overdue ? "text-rose-300" : dday(item.dueDate) <= 3 ? "text-amber-300" : "text-slate-400"}`}>
                          D{dday(item.dueDate) === 0 ? "-day" : dday(item.dueDate) > 0 ? `-${dday(item.dueDate)}` : `+${Math.abs(dday(item.dueDate))}`}
                        </span>
                      )}
                      {item.overdue && (
                        <span className="rounded-full border border-rose-300/40 bg-rose-400/10 px-2 py-0.5 text-[11px] font-semibold text-rose-300">기한 지남</span>
                      )}
                    </>
                  ) : (
                    <>
                      {(item.displayDate || item.date) && (
                        <span className={`text-xs ${item.overdue ? "text-rose-300 font-semibold" : "text-slate-400"}`}>
                          {item.displayDate || fmtDate(item.date)}
                        </span>
                      )}
                      {item.date && dday(item.date) !== null && (
                        <span className={`text-xs font-bold ${dday(item.date) <= 3 ? "text-red-400" : "text-slate-400"}`}>
                          D{dday(item.date) === 0 ? "-day" : dday(item.date) > 0 ? `-${dday(item.date)}` : `+${Math.abs(dday(item.date))}`}
                        </span>
                      )}
                    </>
                  )}
                  {item.priority && (
                    <span className={`text-xs ${item.priority === "높음" ? "text-red-400 font-semibold" : "text-slate-500"}`}>{item.priority}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
