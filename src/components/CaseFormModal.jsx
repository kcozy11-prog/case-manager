import { useState } from "react";
import { todayStr, fmtDate, TYPES, emptyCase, MEMO_CATEGORIES, MEMO_CAT_STYLE } from "../utils";

function FormSection({ title, children }) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">{title}</div>
      {children}
    </div>
  );
}

export default function CaseFormModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || emptyCase());
  const [newHearing, setNewHearing] = useState({ date: todayStr, type: "", result: "" });
  const [newTimeline, setNewTimeline] = useState({ date: todayStr, content: "" });
  const set = (path, val) => {
    setForm(prev => {
      const next = { ...prev };
      const parts = path.split(".");
      if (parts.length === 2) next[parts[0]] = { ...prev[parts[0]], [parts[1]]: val };
      else next[path] = val;
      return next;
    });
  };

  const addHearing = () => {
    if (!newHearing.date || !newHearing.type.trim()) return;
    setForm(p => ({ ...p, hearings: [...p.hearings, { id: Date.now(), ...newHearing }] }));
    setNewHearing({ date: todayStr, type: "", result: "" });
  };
  const delHearing = (id) => setForm(p => ({ ...p, hearings: p.hearings.filter(h => h.id !== id) }));

  const addTimeline = () => {
    if (!newTimeline.content.trim()) return;
    setForm(p => ({ ...p, timeline: [...p.timeline, { id: Date.now(), ...newTimeline }] }));
    setNewTimeline({ date: todayStr, content: "" });
  };
  const delTimeline = (id) => setForm(p => ({ ...p, timeline: p.timeline.filter(t => t.id !== id) }));

  const [newMemo, setNewMemo] = useState({ category: "일반메모", title: "", content: "" });
  const addMemo = () => {
    if (!newMemo.title.trim()) return;
    setForm(p => ({ ...p, memos: [...(p.memos || []), { id: Date.now(), ...newMemo, date: todayStr }] }));
    setNewMemo({ category: "일반메모", title: "", content: "" });
  };
  const delMemo = (id) => setForm(p => ({ ...p, memos: (p.memos || []).filter(m => m.id !== id) }));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl my-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between" style={{ background: "#1E293B" }}>
          <div className="text-white font-semibold">{initial?.id && !initial._isNew ? "사건 수정" : "새 사건 등록"}</div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
          <FormSection title="기본 정보">
            <div className="space-y-2">
              <input className="input w-full" placeholder="사건명 *" value={form.title}
                onChange={e => set("title", e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <select className="input" value={form.type} onChange={e => set("type", e.target.value)}>
                  {TYPES.slice(1).map(t => <option key={t}>{t}</option>)}
                </select>
                <select className="input" value={form.status} onChange={e => set("status", e.target.value)}>
                  <option>진행중</option><option>종결</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input className="input" placeholder="관할 법원/기관" value={form.court}
                  onChange={e => set("court", e.target.value)} />
                <input className="input" placeholder="사건번호" value={form.caseNumber}
                  onChange={e => set("caseNumber", e.target.value)} />
              </div>
            </div>
          </FormSection>

          <FormSection title="당사자">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input className="input" placeholder="의뢰인 이름" value={form.client}
                onChange={e => set("client", e.target.value)} />
              <input className="input" placeholder="의뢰인 연락처" value={form.clientContact}
                onChange={e => set("clientContact", e.target.value)} />
              <input className="input sm:col-span-2" placeholder="상대방" value={form.opponent}
                onChange={e => set("opponent", e.target.value)} />
            </div>
          </FormSection>

          <FormSection title="담당자">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input className="input" placeholder="이름" value={form.manager}
                onChange={e => set("manager", e.target.value)} />
              <input className="input" placeholder="소속" value={form.managerOrg}
                onChange={e => set("managerOrg", e.target.value)} />
              <input className="input" placeholder="연락처" value={form.managerContact}
                onChange={e => set("managerContact", e.target.value)} />
            </div>
          </FormSection>

          <FormSection title="선임약정">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input className="input" type="number" placeholder="착수금 (원)" value={form.retainer.amount}
                onChange={e => set("retainer.amount", e.target.value)} />
              <input className="input" type="date" value={form.retainer.date}
                onChange={e => set("retainer.date", e.target.value)} />
            </div>
            <input className="input w-full mt-2" placeholder="성공보수 조건 (예: 승소 시 회수금의 10%)"
              value={form.retainer.successFee}
              onChange={e => set("retainer.successFee", e.target.value)} />
            <input className="input w-full mt-2" type="number" placeholder="성공보수 금액 (원, 선택)"
              value={form.retainer.successFeeAmount}
              onChange={e => set("retainer.successFeeAmount", e.target.value)} />
          </FormSection>

          <FormSection title="기일">
            {form.hearings.map(h => (
              <div key={h.id} className="flex items-center gap-2 text-sm mb-1.5 bg-slate-50 rounded px-2 py-1.5">
                <span className="text-slate-400 w-24">{fmtDate(h.date)}</span>
                <span className="text-slate-700 flex-1">{h.type}</span>
                {h.result && <span className="text-slate-400 text-xs">{h.result}</span>}
                <button onClick={() => delHearing(h.id)} className="text-slate-300 hover:text-red-400 ml-1">✕</button>
              </div>
            ))}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
              <input className="input" type="date" value={newHearing.date}
                onChange={e => setNewHearing(p => ({ ...p, date: e.target.value }))} />
              <input className="input" placeholder="기일 종류" value={newHearing.type}
                onChange={e => setNewHearing(p => ({ ...p, type: e.target.value }))} />
              <div className="flex gap-1">
                <input className="input flex-1" placeholder="결과 (선택)" value={newHearing.result}
                  onChange={e => setNewHearing(p => ({ ...p, result: e.target.value }))} />
                <button onClick={addHearing} className="btn-primary px-2.5">+</button>
              </div>
            </div>
          </FormSection>

          <FormSection title="진행경과">
            {form.timeline.map(t => (
              <div key={t.id} className="flex items-start gap-2 text-sm mb-1.5 bg-slate-50 rounded px-2 py-1.5">
                <span className="text-slate-400 w-24 flex-shrink-0">{fmtDate(t.date)}</span>
                <span className="text-slate-700 flex-1">{t.content}</span>
                <button onClick={() => delTimeline(t.id)} className="text-slate-300 hover:text-red-400 ml-1">✕</button>
              </div>
            ))}
            <div className="flex flex-col sm:flex-row gap-2 mt-2">
              <input className="input w-full sm:w-36 flex-shrink-0" type="date" value={newTimeline.date}
                onChange={e => setNewTimeline(p => ({ ...p, date: e.target.value }))} />
              <input className="input flex-1" placeholder="경과 내용" value={newTimeline.content}
                onChange={e => setNewTimeline(p => ({ ...p, content: e.target.value }))} />
              <button onClick={addTimeline} className="btn-primary px-2.5">+</button>
            </div>
          </FormSection>

          <FormSection title="메모">
            {(form.memos || []).map(m => (
              <div key={m.id} className="flex items-start gap-2 text-sm mb-1.5 bg-slate-50 rounded px-2 py-1.5">
                <span className={`text-xs px-1.5 py-0.5 rounded border flex-shrink-0 mt-0.5 ${MEMO_CAT_STYLE[m.category] || MEMO_CAT_STYLE["일반메모"]}`}>
                  {m.category}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-700 truncate">{m.title}</div>
                  {m.content && <div className="text-xs text-slate-400 truncate">{m.content}</div>}
                </div>
                <button onClick={() => delMemo(m.id)} className="text-slate-300 hover:text-red-400 ml-1 flex-shrink-0">✕</button>
              </div>
            ))}
            <div className="space-y-2 mt-2">
              <div className="flex gap-2">
                <select className="input" style={{ width: "auto" }} value={newMemo.category}
                  onChange={e => setNewMemo(p => ({ ...p, category: e.target.value }))}>
                  {MEMO_CATEGORIES.map(cat => <option key={cat}>{cat}</option>)}
                </select>
                <input className="input flex-1" placeholder="제목 *" value={newMemo.title}
                  onChange={e => setNewMemo(p => ({ ...p, title: e.target.value }))} />
              </div>
              <div className="flex gap-1">
                <textarea className="input flex-1 resize-none" rows={2} placeholder="내용" value={newMemo.content}
                  onChange={e => setNewMemo(p => ({ ...p, content: e.target.value }))} />
                <button onClick={addMemo} className="btn-primary px-2.5 self-end">+</button>
              </div>
            </div>
          </FormSection>
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">취소</button>
          <button onClick={() => { if (!form.title.trim()) return; onSave(form); onClose(); }}
            className="btn-primary">저장</button>
        </div>
      </div>
    </div>
  );
}
