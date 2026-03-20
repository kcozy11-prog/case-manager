import { useState } from "react";
import { todayStr, fmtDate } from "../utils";

export default function DocumentsTab({ c, onUpdate }) {
  const [newDoc, setNewDoc] = useState({ title: "", date: todayStr, url: "", note: "" });
  const [adding, setAdding] = useState(false);

  const addDoc = () => {
    if (!newDoc.title.trim()) return;
    const updated = { ...c, documents: [...c.documents, { id: Date.now(), ...newDoc }] };
    onUpdate(updated);
    setNewDoc({ title: "", date: todayStr, url: "", note: "" });
    setAdding(false);
  };

  const delDoc = (id) => onUpdate({ ...c, documents: c.documents.filter(d => d.id !== id) });

  return (
    <div className="space-y-3">
      {c.documents.length === 0 && !adding && (
        <div className="text-sm text-slate-400 italic py-4 text-center">등록된 문서가 없습니다.</div>
      )}
      {c.documents.map(doc => (
        <div key={doc.id} className="flex items-start justify-between bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100 gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-800 truncate">{doc.title}</span>
              <span className="text-xs text-slate-400 flex-shrink-0">{fmtDate(doc.date)}</span>
            </div>
            {doc.note && <div className="text-xs text-slate-500 mt-0.5">{doc.note}</div>}
            {doc.url && (
              <a href={doc.url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-indigo-500 hover:text-indigo-700 underline truncate block mt-0.5">
                {doc.url.length > 50 ? doc.url.slice(0, 50) + "…" : doc.url}
              </a>
            )}
          </div>
          <button onClick={() => delDoc(doc.id)} className="text-slate-300 hover:text-red-400 flex-shrink-0 text-xs px-1">✕</button>
        </div>
      ))}

      {adding ? (
        <div className="border border-indigo-200 rounded-lg p-3 bg-indigo-50 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input className="input-sm" placeholder="문서 제목 *" value={newDoc.title}
              onChange={e => setNewDoc(p => ({ ...p, title: e.target.value }))} />
            <input className="input-sm" type="date" value={newDoc.date}
              onChange={e => setNewDoc(p => ({ ...p, date: e.target.value }))} />
          </div>
          <input className="input-sm w-full" placeholder="Google Drive URL"
            value={newDoc.url} onChange={e => setNewDoc(p => ({ ...p, url: e.target.value }))} />
          <input className="input-sm w-full" placeholder="메모 (선택)"
            value={newDoc.note} onChange={e => setNewDoc(p => ({ ...p, note: e.target.value }))} />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setAdding(false)} className="btn-ghost text-xs">취소</button>
            <button onClick={addDoc} className="btn-primary text-xs py-1 px-3">추가</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          className="w-full border-2 border-dashed border-slate-200 text-slate-400 text-sm py-2.5 rounded-lg hover:border-indigo-300 hover:text-indigo-400 transition-colors">
          + 문서 추가
        </button>
      )}
    </div>
  );
}
