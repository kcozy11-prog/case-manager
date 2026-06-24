import { useState } from "react";
import { todayStr, fmtDate } from "../utils";
import { markBriefSubmitted, markBriefPending } from "../caseLink";

// 가벼운 서면 제출현황 추적
//  - 제출 대기: 작성해 두었으나 (아침 컨펌 전 등) 아직 제출하지 않은 서면
//  - 제출 완료: 제출했다고 사용자가 표시한 서면 (제출일 기록)
// brief: { id, title, status:'pending'|'submitted', preparedDate, submittedDate }
export default function BriefsTab({ c, onUpdate }) {
  const [title, setTitle] = useState("");
  const briefs = c.briefs || [];
  const pending = briefs.filter((b) => b.status !== "submitted");
  const submitted = briefs.filter((b) => b.status === "submitted");

  const add = () => {
    if (!title.trim()) return;
    onUpdate({
      ...c,
      briefs: [...briefs, {
        id: Date.now(), title: title.trim(), status: "pending",
        preparedDate: todayStr, submittedDate: "",
      }],
    });
    setTitle("");
  };

  const markSubmitted = (id) => onUpdate(markBriefSubmitted(c, id, todayStr));
  const markPending = (id) => onUpdate(markBriefPending(c, id));
  const del = (id) => onUpdate({ ...c, briefs: briefs.filter((b) => b.id !== id) });

  return (
    <div className="space-y-5">
      {/* 빠른 추가 */}
      <div className="flex gap-2">
        <input className="input flex-1" placeholder="서면 제목 (예: 준비서면 2호, 답변서)"
          value={title} onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <button onClick={add} disabled={!title.trim()} className="btn-primary text-sm px-4 disabled:opacity-40">+ 추가</button>
      </div>

      {/* 제출 대기 */}
      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
          제출 대기 <span className="text-amber-500">{pending.length > 0 ? `· ${pending.length}` : ""}</span>
        </div>
        {pending.length === 0 ? (
          <div className="text-sm text-slate-400 italic">제출 대기 중인 서면이 없습니다.</div>
        ) : (
          <div className="space-y-1.5">
            {pending.map((b) => (
              <div key={b.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 border border-amber-200 bg-amber-50/40">
                <button onClick={() => markSubmitted(b.id)}
                  className="flex-shrink-0 w-4 h-4 rounded border-2 border-amber-400 hover:bg-amber-400 hover:text-white flex items-center justify-center transition-colors"
                  title="제출 완료로 표시" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-700 truncate">{b.title}</div>
                  {b.preparedDate && <div className="text-xs text-slate-400">작성 {fmtDate(b.preparedDate)}</div>}
                </div>
                <button onClick={() => markSubmitted(b.id)} className="text-xs text-amber-600 hover:text-amber-800 font-medium flex-shrink-0">제출함</button>
                <button onClick={() => del(b.id)} className="text-slate-300 hover:text-red-400 flex-shrink-0 text-xs px-1">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 제출 완료 */}
      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
          제출 완료 {submitted.length > 0 ? `· ${submitted.length}` : ""}
        </div>
        {submitted.length === 0 ? (
          <div className="text-sm text-slate-400 italic">제출 완료한 서면이 없습니다.</div>
        ) : (
          <div className="space-y-1.5">
            {[...submitted].sort((a, b) => (b.submittedDate || "").localeCompare(a.submittedDate || "")).map((b) => (
              <div key={b.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 border border-slate-100 bg-slate-50">
                <button onClick={() => markPending(b.id)}
                  className="flex-shrink-0 w-4 h-4 rounded bg-emerald-400 border-2 border-emerald-400 text-white flex items-center justify-center"
                  title="제출 대기로 되돌리기">
                  <span className="text-xs leading-none">✓</span>
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-600 truncate">{b.title}</div>
                </div>
                <span className="text-xs text-emerald-600 flex-shrink-0">제출 {fmtDate(b.submittedDate)}</span>
                <button onClick={() => del(b.id)} className="text-slate-300 hover:text-red-400 flex-shrink-0 text-xs px-1">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
