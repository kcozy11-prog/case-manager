import { dday, fmtDate, TYPE_STYLE } from "../utils";
import { DdayBadge, TypeBadge } from "./Badges";

export default function CaseItem({ c, selected, onClick }) {
  const nextHearing = c.hearings
    .filter(h => dday(h.date) >= 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];
  const dot = TYPE_STYLE[c.type]?.dot || "#94A3B8";
  const urgent = nextHearing && dday(nextHearing.date) <= 7;

  return (
    <div
      onClick={onClick}
      className={`px-4 py-3 cursor-pointer border-b border-slate-100 transition-all duration-150 ${
        selected ? "bg-indigo-50 border-l-4 border-l-indigo-500" : "hover:bg-slate-50 border-l-4 border-l-transparent"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5" style={{ background: dot }} />
          <span className="text-sm font-semibold text-slate-800 truncate">{c.title}</span>
        </div>
        {urgent && nextHearing && <DdayBadge dateStr={nextHearing.date} small />}
      </div>
      <div className="flex items-center gap-2 ml-4">
        <TypeBadge type={c.type} />
        <span className="text-xs text-slate-400">{c.client}</span>
        {c.status === "종결" && (
          <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">종결</span>
        )}
      </div>
      <div className="ml-4 mt-1 flex items-center gap-2">
        {nextHearing && (
          <span className="text-xs text-slate-400">
            다음 기일: {fmtDate(nextHearing.date)} {nextHearing.type}
          </span>
        )}
        {(() => { const pending = (c.todos||[]).filter(t=>!t.done).length; return pending > 0 ? (
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-400 text-white text-xs font-bold leading-none flex-shrink-0" style={{fontSize:"10px"}}>
            {pending}
          </span>
        ) : null; })()}
      </div>
    </div>
  );
}
