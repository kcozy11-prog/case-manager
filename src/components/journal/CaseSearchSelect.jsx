import { useState, useRef, useEffect } from "react";
import { filterCasesByQuery } from "../../caseSearch";

// 검색형 사건 선택 콤보박스 — 네이티브 <select> 대체.
// props: cases, value(선택 사건 id), onChange(id), placeholder, className(트리거 크기/flex)
export default function CaseSearchSelect({ cases = [], value = "", onChange, placeholder = "관련 사건(선택)", className = "" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const selected = cases.find((c) => c.id === value) || null;
  const filtered = filterCasesByQuery(cases, query);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) { setOpen(false); setQuery(""); } };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

  const pick = (id) => { onChange(id); setOpen(false); setQuery(""); };

  const onKeyDown = (e) => {
    if (e.key === "Escape") { setOpen(false); setQuery(""); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((i) => Math.min(i + 1, filtered.length - 1)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setHi((i) => Math.max(i - 1, 0)); return; }
    if (e.key === "Enter") { e.preventDefault(); const c = filtered[hi]; if (c) pick(c.id); return; }
  };

  return (
    <div className={`relative ${className}`} ref={wrapRef}>
      <div onClick={() => setOpen((o) => !o)}
        className="input text-xs w-full text-left flex items-center justify-between gap-1 cursor-pointer">
        <span className={`truncate ${selected ? "text-slate-700" : "text-slate-400"}`}>
          {selected ? selected.title : placeholder}
        </span>
        {selected ? (
          <span onClick={(e) => { e.stopPropagation(); pick(""); }}
            className="text-slate-300 hover:text-red-500 flex-shrink-0 px-0.5" title="선택 해제">✕</span>
        ) : <span className="text-slate-300 flex-shrink-0">▾</span>}
      </div>
      {open && (
        <div className="absolute z-20 mt-1 w-full min-w-[180px] bg-white border border-slate-200 rounded-lg shadow-lg">
          <input ref={inputRef} value={query}
            onChange={(e) => { setQuery(e.target.value); setHi(0); }}
            onKeyDown={onKeyDown}
            placeholder="사건명·번호·의뢰인 검색"
            className="input text-xs w-full rounded-b-none" />
          <ul className="max-h-52 overflow-y-auto py-1">
            <li>
              <button type="button" onClick={() => pick("")}
                className="w-full text-left text-xs px-2.5 py-1.5 text-slate-400 hover:bg-slate-50">선택 안 함</button>
            </li>
            {filtered.map((c, i) => (
              <li key={c.id}>
                <button type="button" onClick={() => pick(c.id)} onMouseEnter={() => setHi(i)}
                  className={`w-full text-left text-xs px-2.5 py-1.5 truncate ${
                    i === hi ? "bg-indigo-50 text-indigo-700" : "text-slate-700 hover:bg-slate-50"
                  } ${c.id === value ? "font-medium" : ""}`}>
                  {c.title}
                  {c.caseNumber && <span className="text-slate-400 ml-1.5">{c.caseNumber}</span>}
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="text-xs text-slate-400 px-2.5 py-2">검색 결과 없음</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
