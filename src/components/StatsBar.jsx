import { today, dday } from "../utils";

export default function StatsBar({ cases }) {
  const active = cases.filter(c => c.status === "진행중").length;
  const thisMonth = cases.flatMap(c => c.hearings).filter(h => {
    const d = new Date(h.date);
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && dday(h.date) >= 0;
  }).length;
  const week7 = cases.flatMap(c => c.hearings).filter(h => {
    const n = dday(h.date); return n !== null && n >= 0 && n <= 7;
  }).length;
  const pendingTodos = cases.filter(c=>c.status==="진행중").flatMap(c=>c.todos||[]).filter(t=>!t.done).length;

  return (
    <div style={{ background: "#1E293B" }} className="flex items-center gap-0 px-4 sm:px-6 py-0 border-b border-slate-700 overflow-x-auto">
      {[
        { label: "진행 중 사건", value: active, unit: "건", color: "#60A5FA" },
        { label: "이번 달 기일", value: thisMonth, unit: "건", color: "#34D399" },
        { label: "7일 내 기일", value: week7, unit: "건", color: week7 > 0 ? "#F87171" : "#94A3B8" },
        { label: "미완료 할 일", value: pendingTodos, unit: "건", color: pendingTodos > 0 ? "#FBBF24" : "#94A3B8" },
      ].map((s, i) => (
        <div key={i} className="flex items-center gap-3 px-4 sm:px-6 py-3 border-r border-slate-700 last:border-r-0 flex-shrink-0">
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
  );
}
