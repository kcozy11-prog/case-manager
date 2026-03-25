import { useState } from "react";
import { dday, fmtDate, fmtMoney, todayStr, MEMO_CATEGORIES, MEMO_CAT_STYLE } from "../utils";
import { DdayBadge } from "./Badges";

function InfoCard({ label, value, sub }) {
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100">
      <div className="text-xs text-slate-400 mb-0.5">{label}</div>
      <div className="text-sm font-semibold text-slate-800">{value || "—"}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">{title}</div>
      {children}
    </div>
  );
}

function HearingRow({ h, upcoming, onDelete }) {
  return (
    <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${
      upcoming ? "bg-indigo-50 border border-indigo-100" : "bg-slate-50"
    }`}>
      <div className="flex items-center gap-3">
        <DdayBadge dateStr={h.date} small />
        <div>
          <div className="text-sm font-medium text-slate-700">
            {h.type}
            {h.fromCalendar && <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-indigo-100 text-indigo-500 font-medium">LBOX</span>}
          </div>
          {h.result && <div className="text-xs text-slate-400">{h.result}</div>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="text-xs text-slate-500">
          {fmtDate(h.date)}{h.time && <span className="ml-1 text-indigo-500 font-medium">{h.time}</span>}
        </div>
        <button onClick={(e) => { e.stopPropagation(); onDelete(h.id); }}
          className="text-xs text-red-300 hover:text-red-500 transition-colors" title="기일 삭제">✕</button>
      </div>
    </div>
  );
}

export default function OverviewTab({ c, onUpdate }) {
  const [memoTab, setMemoTab] = useState("전체");
  const [expandedMemos, setExpandedMemos] = useState(new Set());
  const [showMemoForm, setShowMemoForm] = useState(false);
  const [newMemo, setNewMemo] = useState({ category: "일반메모", title: "", content: "" });
  const [newTimeline, setNewTimeline] = useState("");
  const [newTimelineDate, setNewTimelineDate] = useState(todayStr);
  const [editingTimelineId, setEditingTimelineId] = useState(null);
  const [editingTimelineDate, setEditingTimelineDate] = useState("");
  const [editingMemoDate, setEditingMemoDate] = useState("");
  const [editingMemoId, setEditingMemoId] = useState(null);

  const addTimeline = () => {
    if (!newTimeline.trim()) return;
    onUpdate({ ...c, timeline: [...(c.timeline || []), { id: Date.now(), date: newTimelineDate || todayStr, content: newTimeline.trim() }] });
    setNewTimeline("");
    setNewTimelineDate(todayStr);
  };

  const deleteHearing = (id) => {
    onUpdate({ ...c, hearings: c.hearings.filter(h => h.id !== id) });
  };

  const updateTimelineDate = (id, newDate) => {
    onUpdate({ ...c, timeline: c.timeline.map(t => t.id === id ? { ...t, date: newDate } : t) });
    setEditingTimelineId(null);
  };

  const updateMemoDate = (id, newDate) => {
    onUpdate({ ...c, memos: (c.memos || []).map(m => m.id === id ? { ...m, date: newDate } : m) });
    setEditingMemoId(null);
  };

  const memos = c.memos || [];
  const filteredMemos = memoTab === "전체" ? memos : memos.filter(m => m.category === memoTab);
  const sortedMemos = [...filteredMemos].sort((a, b) => new Date(b.date) - new Date(a.date));

  const toggleMemo = (id) => {
    setExpandedMemos(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const addMemo = () => {
    if (!newMemo.title.trim()) return;
    onUpdate({ ...c, memos: [...memos, { id: Date.now(), ...newMemo, date: todayStr }] });
    setNewMemo({ category: "일반메모", title: "", content: "" });
    setShowMemoForm(false);
  };

  const deleteMemo = (id) => {
    onUpdate({ ...c, memos: memos.filter(m => m.id !== id) });
  };

  const upcomingHearings = [...c.hearings]
    .filter(h => dday(h.date) >= 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const pastHearings = [...c.hearings]
    .filter(h => dday(h.date) < 0)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <InfoCard label="의뢰인" value={c.client} sub={c.clientContact} />
        <InfoCard label="상대방" value={c.opponent} />
        <InfoCard label="관할 기관" value={c.court} sub={c.caseNumber ? `사건번호: ${c.caseNumber}` : ""} />
        <InfoCard label="담당자" value={c.manager}
          sub={[c.managerOrg, c.managerContact].filter(Boolean).join(" · ")} />
      </div>

      <Section title="선임약정">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <div className="text-xs text-slate-400 mb-0.5">착수금</div>
            <div className="text-sm font-semibold text-slate-800">{fmtMoney(c.retainer?.amount)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-0.5">수임일</div>
            <div className="text-sm text-slate-700">{fmtDate(c.retainer?.date)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-0.5">성공보수</div>
            <div className="text-sm text-slate-700">{c.retainer?.successFee || "—"}</div>
            {c.retainer?.successFeeAmount && (
              <div className="text-xs text-slate-400">{fmtMoney(c.retainer.successFeeAmount)}</div>
            )}
          </div>
        </div>
      </Section>

      <Section title="기일">
        {c.hearings.length === 0 ? (
          <div className="text-sm text-slate-400 italic">등록된 기일이 없습니다.</div>
        ) : (
          <div className="space-y-1.5">
            {upcomingHearings.length > 0 && (
              <>
                <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">예정</div>
                {upcomingHearings.map(h => (
                  <HearingRow key={h.id} h={h} upcoming onDelete={deleteHearing} />
                ))}
              </>
            )}
            {pastHearings.length > 0 && (
              <>
                <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-2 mb-1">지난 기일</div>
                {pastHearings.map(h => (
                  <HearingRow key={h.id} h={h} onDelete={deleteHearing} />
                ))}
              </>
            )}
          </div>
        )}
      </Section>

      <Section title="진행경과">
        {/* 빠른 입력 */}
        <div className="flex gap-2 mb-3">
          <input type="date" className="input-sm" style={{ width: "130px" }} value={newTimelineDate}
            onChange={e => setNewTimelineDate(e.target.value)} />
          <input className="input-sm flex-1" placeholder="경과 한줄 입력..." value={newTimeline}
            onChange={e => setNewTimeline(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") addTimeline(); }} />
          <button onClick={addTimeline} disabled={!newTimeline.trim()}
            className="btn-primary text-xs px-3 py-1 disabled:opacity-40">추가</button>
        </div>
        {c.timeline.length === 0 ? (
          <div className="text-sm text-slate-400 italic">등록된 경과가 없습니다.</div>
        ) : (
          <div className="relative pl-4">
            <div className="absolute left-1.5 top-0 bottom-0 w-px bg-slate-200" />
            {[...c.timeline].sort((a, b) => new Date(b.date) - new Date(a.date)).map((t) => (
              <div key={t.id} className="relative mb-3 last:mb-0">
                <div className="absolute -left-2.5 top-1.5 w-2 h-2 rounded-full bg-indigo-400 border-2 border-white" />
                <div className="flex items-center gap-1.5 mb-0.5">
                  {editingTimelineId === t.id ? (
                    <input type="date" className="input-sm" style={{ width: "130px", fontSize: "11px" }}
                      value={editingTimelineDate}
                      onChange={e => setEditingTimelineDate(e.target.value)}
                      onBlur={() => updateTimelineDate(t.id, editingTimelineDate)}
                      onKeyDown={e => { if (e.key === "Enter") updateTimelineDate(t.id, editingTimelineDate); if (e.key === "Escape") setEditingTimelineId(null); }}
                      autoFocus />
                  ) : (
                    <button className="text-xs text-slate-400 hover:text-indigo-500 transition-colors"
                      onClick={() => { setEditingTimelineId(t.id); setEditingTimelineDate(t.date); }}
                      title="날짜 수정">{fmtDate(t.date)}</button>
                  )}
                </div>
                <div className="text-sm text-slate-700">{t.content}</div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="메모">
        <div className="flex gap-1 mb-3 flex-wrap">
          {["전체", ...MEMO_CATEGORIES].map(cat => (
            <button key={cat} onClick={() => setMemoTab(cat)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                memoTab === cat
                  ? "bg-slate-800 text-white border-slate-800"
                  : "text-slate-500 border-slate-200 hover:border-slate-400"
              }`}>{cat}</button>
          ))}
        </div>

        {sortedMemos.length === 0 ? (
          <div className="text-sm text-slate-400 italic">메모가 없습니다.</div>
        ) : (
          <div className="space-y-2">
            {sortedMemos.map(m => (
              <div key={m.id} className="border border-slate-200 rounded-lg overflow-hidden">
                <div
                  className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => toggleMemo(m.id)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-xs px-1.5 py-0.5 rounded border flex-shrink-0 ${MEMO_CAT_STYLE[m.category] || MEMO_CAT_STYLE["일반메모"]}`}>
                      {m.category}
                    </span>
                    <span className="text-sm font-medium text-slate-700 truncate">{m.title}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {editingMemoId === m.id ? (
                      <input type="date" className="input-sm" style={{ width: "130px", fontSize: "11px" }}
                        value={editingMemoDate}
                        onClick={e => e.stopPropagation()}
                        onChange={e => setEditingMemoDate(e.target.value)}
                        onBlur={() => updateMemoDate(m.id, editingMemoDate)}
                        onKeyDown={e => { if (e.key === "Enter") updateMemoDate(m.id, editingMemoDate); if (e.key === "Escape") setEditingMemoId(null); }}
                        autoFocus />
                    ) : (
                      <button className="text-xs text-slate-400 hover:text-indigo-500 transition-colors"
                        onClick={e => { e.stopPropagation(); setEditingMemoId(m.id); setEditingMemoDate(m.date); }}
                        title="날짜 수정">{fmtDate(m.date)}</button>
                    )}
                    <span className="text-xs text-slate-300">{expandedMemos.has(m.id) ? "▲" : "▼"}</span>
                  </div>
                </div>
                {expandedMemos.has(m.id) && (
                  <div className="px-3 py-2.5 border-t border-slate-100 bg-slate-50">
                    <div className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{m.content || <span className="text-slate-400 italic">내용 없음</span>}</div>
                    <button onClick={(e) => { e.stopPropagation(); deleteMemo(m.id); }}
                      className="text-xs text-red-400 hover:text-red-600 mt-2">삭제</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {showMemoForm ? (
          <div className="mt-3 space-y-2 border border-indigo-200 rounded-lg p-3 bg-indigo-50/30">
            <div className="flex gap-2">
              <select className="input-sm" style={{ width: "auto" }} value={newMemo.category}
                onChange={e => setNewMemo(p => ({ ...p, category: e.target.value }))}>
                {MEMO_CATEGORIES.map(cat => <option key={cat}>{cat}</option>)}
              </select>
              <input className="input-sm flex-1" placeholder="제목 *" value={newMemo.title}
                onChange={e => setNewMemo(p => ({ ...p, title: e.target.value }))} />
            </div>
            <textarea className="input-sm w-full resize-none" rows={3} placeholder="내용"
              value={newMemo.content} onChange={e => setNewMemo(p => ({ ...p, content: e.target.value }))} />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowMemoForm(false); setNewMemo({ category: "일반메모", title: "", content: "" }); }}
                className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1">취소</button>
              <button onClick={addMemo} className="btn-primary text-xs px-3 py-1">저장</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowMemoForm(true)}
            className="mt-3 text-xs text-indigo-500 hover:text-indigo-700 font-medium">+ 새 메모</button>
        )}
      </Section>
    </div>
  );
}
