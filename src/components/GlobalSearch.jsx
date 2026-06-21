import { useState, useMemo, useEffect, useRef } from "react";
import { TypeBadge } from "./Badges";

// 전역 검색: 사건 기본정보 + 메모·진행경과·서면·할일 본문을 가로질러 검색
export default function GlobalSearch({ cases, onClose, onOpen }) {
  const [q, setQ] = useState("");
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (query.length < 1) return [];
    const out = [];
    const hit = (s) => s && String(s).toLowerCase().includes(query);
    const snip = (s) => {
      const str = String(s);
      const i = str.toLowerCase().indexOf(query);
      if (i < 0) return str.slice(0, 60);
      const start = Math.max(0, i - 20);
      return (start > 0 ? "…" : "") + str.slice(start, start + 60);
    };

    for (const c of cases) {
      const matches = [];
      if (hit(c.title) || hit(c.client) || hit(c.opponent) || hit(c.caseNumber) || hit(c.court)) {
        matches.push({ area: "사건정보", tab: "overview", snippet: [c.client, c.opponent, c.caseNumber].filter(Boolean).join(" · ") });
      }
      (c.memos || []).forEach(m => {
        if (hit(m.title) || hit(m.content)) matches.push({ area: `메모·${m.category}`, tab: "overview", snippet: snip(`${m.title} ${m.content || ""}`) });
      });
      (c.timeline || []).forEach(t => {
        if (hit(t.content)) matches.push({ area: "진행경과", tab: "overview", snippet: snip(t.content) });
      });
      (c.briefs || []).forEach(b => {
        if (hit(b.title)) matches.push({ area: b.status === "submitted" ? "서면·제출" : "서면·대기", tab: "briefs", snippet: b.title });
      });
      (c.todos || []).forEach(t => {
        if (hit(t.text) || hit(t.details)) matches.push({ area: "할 일", tab: "todos", snippet: snip(`${t.text} ${t.details || ""}`) });
      });
      if (matches.length) out.push({ c, matches });
    }
    return out;
  }, [q, cases]);

  const totalHits = results.reduce((n, r) => n + r.matches.length, 0);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 pt-[10vh]" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <span className="text-slate-400">🔍</span>
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
            className="flex-1 outline-none text-sm text-slate-700"
            placeholder="모든 사건의 메모·경과·서면·할일 검색…" />
          <button onClick={onClose} className="text-slate-300 hover:text-slate-600 text-lg leading-none">✕</button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {q.trim() && (
            <div className="px-4 py-1.5 text-xs text-slate-400 border-b border-slate-50">
              {results.length}개 사건 · {totalHits}건 일치
            </div>
          )}
          {results.map(({ c, matches }) => (
            <div key={c.id} className="border-b border-slate-50 last:border-b-0">
              <div className="flex items-center gap-2 px-4 pt-3 pb-1">
                <TypeBadge type={c.type} />
                <span className="text-sm font-semibold text-slate-800 truncate">{c.title}</span>
                {c.status === "종결" && <span className="text-[11px] text-slate-400 bg-slate-100 px-1.5 rounded">종결</span>}
              </div>
              {matches.slice(0, 6).map((m, i) => (
                <button key={i} onClick={() => onOpen(c.id, m.tab)}
                  className="w-full text-left px-4 py-2 hover:bg-indigo-50 transition-colors flex items-center gap-2">
                  <span className="text-[11px] text-indigo-400 flex-shrink-0 w-20 truncate">{m.area}</span>
                  <span className="text-xs text-slate-500 truncate">{m.snippet}</span>
                </button>
              ))}
            </div>
          ))}
          {q.trim() && results.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-slate-400">검색 결과가 없습니다.</div>
          )}
          {!q.trim() && (
            <div className="px-4 py-10 text-center text-sm text-slate-300">사건명·당사자·사건번호뿐 아니라 메모·진행경과·서면·할일 내용까지 찾습니다.</div>
          )}
        </div>
      </div>
    </div>
  );
}
