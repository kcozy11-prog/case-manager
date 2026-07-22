import { useState } from "react";
import { dday, fmtDate, fmtMoney, todayStr, addDays, MEMO_CATEGORIES, MEMO_CAT_STYLE } from "../utils";
import { DdayBadge } from "./Badges";
import { hearingMemoText, setHearingMemo } from "../hearingUtils";

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

function HearingRow({
  h,
  upcoming,
  onDelete,
  onAddDeadline,
  editingMemo,
  onStartMemo,
  onChangeMemo,
  onSaveMemo,
  onCancelMemo,
}) {
  const isJudgment = /선고|판결/.test(h.type || "");
  const memo = hearingMemoText(h);
  const isEditingMemo = editingMemo !== null;
  return (
    <div className={`rounded-lg px-3 py-2 ${
      upcoming ? "bg-indigo-50 border border-indigo-100" : "bg-slate-50"
    }`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <DdayBadge dateStr={h.date} small />
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-700">
              {h.type}
              {h.fromCalendar && <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-indigo-100 text-indigo-500 font-medium">LBOX</span>}
            </div>
            {h.result && <div className="text-xs text-slate-400 truncate">{h.result}</div>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isJudgment && onAddDeadline && (
            <button onClick={(e) => { e.stopPropagation(); onAddDeadline(h); }}
              className="text-[11px] text-rose-500 hover:text-rose-700 border border-rose-200 hover:border-rose-400 rounded px-1.5 py-0.5 transition-colors"
              title="이 선고 기준 상소기한을 불변기간으로 추가 (기산점·기간은 직접 확인)">↪ 상소기한</button>
          )}
          <button onClick={(e) => { e.stopPropagation(); onStartMemo(h); }}
            className={`text-[11px] border rounded px-1.5 py-0.5 transition-colors ${
              memo ? "text-indigo-500 border-indigo-200 hover:border-indigo-400" : "text-slate-400 border-slate-200 hover:text-indigo-500 hover:border-indigo-300"
            }`}
            title={memo ? "기일 메모 수정" : "기일 메모 추가"}>{memo ? "메모 수정" : "+ 메모"}</button>
          <div className="text-xs text-slate-500">
            {fmtDate(h.date)}{h.time && <span className="ml-1 text-indigo-500 font-medium">{h.time}</span>}
          </div>
          <button onClick={(e) => { e.stopPropagation(); onDelete(h.id); }}
            className="text-xs text-red-300 hover:text-red-500 transition-colors" title="기일 삭제">✕</button>
        </div>
      </div>
      {isEditingMemo ? (
        <div className="mt-2 space-y-1.5 pl-9">
          <textarea className="input-sm w-full min-h-[64px] text-xs"
            placeholder="기일 메모 입력..."
            value={editingMemo}
            onChange={e => onChangeMemo(e.target.value)}
            onKeyDown={e => { if (e.key === "Escape") onCancelMemo(); }}
            autoFocus />
          <div className="flex justify-end gap-2">
            <button onClick={onCancelMemo} className="text-xs text-slate-400 hover:text-slate-600 px-1">취소</button>
            <button onClick={() => onSaveMemo(h.id)} className="btn-primary text-xs px-2 py-1">메모 저장</button>
          </div>
        </div>
      ) : (
        memo && <div className="mt-2 ml-9 text-xs text-slate-500 whitespace-pre-wrap leading-relaxed bg-white/70 border border-slate-100 rounded-md px-2 py-1.5">{memo}</div>
      )}
    </div>
  );
}

export default function OverviewTab({ c, onUpdate }) {
  const [memoTab, setMemoTab] = useState("전체");
  const [expandedMemos, setExpandedMemos] = useState(new Set());
  const [showMemoForm, setShowMemoForm] = useState(false);
  const [newMemo, setNewMemo] = useState({ category: "일반메모", title: "", content: "" });
  const [newTimeline, setNewTimeline] = useState("");
  const [newTimelineDetail, setNewTimelineDetail] = useState("");
  const [newTimelineDate, setNewTimelineDate] = useState(todayStr);
  const [editingTimelineId, setEditingTimelineId] = useState(null);
  const [editingTimelineDate, setEditingTimelineDate] = useState("");
  const [editingTimelineContentId, setEditingTimelineContentId] = useState(null);
  const [editingTimelineContent, setEditingTimelineContent] = useState("");
  const [editingTimelineDetailId, setEditingTimelineDetailId] = useState(null);
  const [editingTimelineDetail, setEditingTimelineDetail] = useState("");
  const [editingMemoDate, setEditingMemoDate] = useState("");
  const [editingMemoId, setEditingMemoId] = useState(null);
  const [editingMemoFullId, setEditingMemoFullId] = useState(null);
  const [editingMemoData, setEditingMemoData] = useState({});
  const [editingHearingMemoId, setEditingHearingMemoId] = useState(null);
  const [editingHearingMemo, setEditingHearingMemo] = useState("");

  const addTimeline = () => {
    if (!newTimeline.trim()) return;
    onUpdate({ ...c, timeline: [...(c.timeline || []), {
      id: Date.now(), date: newTimelineDate || todayStr, content: newTimeline.trim(), detail: newTimelineDetail.trim(),
    }] });
    setNewTimeline("");
    setNewTimelineDetail("");
    setNewTimelineDate(todayStr);
  };

  const deleteHearing = (id) => {
    onUpdate({ ...c, hearings: (c.hearings || []).filter(h => h.id !== id) });
  };

  const startEditHearingMemo = (h) => {
    setEditingHearingMemoId(h.id);
    setEditingHearingMemo(hearingMemoText(h));
  };

  const saveHearingMemo = (id) => {
    onUpdate({ ...c, hearings: setHearingMemo(c.hearings || [], id, editingHearingMemo) });
    setEditingHearingMemoId(null);
    setEditingHearingMemo("");
  };

  const cancelHearingMemo = () => {
    setEditingHearingMemoId(null);
    setEditingHearingMemo("");
  };

  // ── 기한(불변기간) 일급 입력 ── (저장은 메모 category="불변기간" 으로 → 대시보드 호환)
  const [newDeadline, setNewDeadline] = useState({ title: "", date: "" });
  const addDeadline = () => {
    if (!newDeadline.title.trim() || !newDeadline.date) return;
    onUpdate({ ...c, memos: [...(c.memos || []), {
      id: Date.now(), category: "불변기간", title: newDeadline.title.trim(),
      content: "", date: newDeadline.date, checked: false,
    }] });
    setNewDeadline({ title: "", date: "" });
  };

  // 선고 기일 → 상소기한 자동 제안 (형사 7일 / 그 외 14일, 기산점·기간은 사용자 확인)
  const addAppealDeadline = (h) => {
    const isCriminal = /형사/.test(c.type || "");
    const days = isCriminal ? 7 : 14;
    const date = addDays(new Date(h.date), days);
    onUpdate({ ...c, memos: [...(c.memos || []), {
      id: Date.now(), category: "불변기간",
      title: isCriminal ? "상소기간 만료(형사 7일)" : "항소기간 만료(민사 2주)",
      content: `※ ${fmtDate(h.date)} ${h.type} 기준 추정. 기산점(송달/선고)·기간을 직접 확인하세요.`,
      date, checked: false,
    }] });
  };

  const updateTimelineDate = (id, newDate) => {
    onUpdate({ ...c, timeline: (c.timeline || []).map(t => t.id === id ? { ...t, date: newDate } : t) });
    setEditingTimelineId(null);
  };

  const saveTimelineContent = (id) => {
    onUpdate({ ...c, timeline: (c.timeline || []).map(t => t.id === id ? { ...t, content: editingTimelineContent } : t) });
    setEditingTimelineContentId(null);
  };

  const saveTimelineDetail = (id) => {
    onUpdate({ ...c, timeline: (c.timeline || []).map(t => t.id === id ? { ...t, detail: editingTimelineDetail } : t) });
    setEditingTimelineDetailId(null);
  };

  const deleteTimeline = (id) => {
    onUpdate({ ...c, timeline: (c.timeline || []).filter(t => t.id !== id) });
  };

  const startEditMemo = (m) => {
    setEditingMemoFullId(m.id);
    setEditingMemoData({ category: m.category, title: m.title, content: m.content || "" });
  };

  const saveMemoFull = (id) => {
    onUpdate({ ...c, memos: memos.map(m => m.id === id ? { ...m, ...editingMemoData } : m) });
    setEditingMemoFullId(null);
  };

  const updateMemoDate = (id, newDate) => {
    onUpdate({ ...c, memos: (c.memos || []).map(m => m.id === id ? { ...m, date: newDate } : m) });
    setEditingMemoId(null);
  };

  const memos = c.memos || [];
  const hearings = c.hearings || [];
  const timeline = c.timeline || [];
  const filteredMemos = memoTab === "전체" ? memos : memos.filter(m => m.category === memoTab);
  const sortedMemos = [...filteredMemos].sort((a, b) => new Date(b.date) - new Date(a.date));
  // 하단 기존 메모 섹션은 상세 진행경과로 역할을 넘기고 화면에서는 숨긴다.
  // 데이터는 그대로 보존되어 불변기간/자동 메모 등 기존 기능과 호환된다.
  const showLegacyMemoSection = false;

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

  const toggleMemoCheck = (id) => {
    onUpdate({ ...c, memos: memos.map(m => m.id === id ? { ...m, checked: !m.checked } : m) });
  };

  const upcomingHearings = [...hearings]
    .filter(h => dday(h.date) >= 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const pastHearings = [...hearings]
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

      {c.status === "종결" && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-white font-medium">종결</span>
            {c.closeResult && <span className="text-sm font-semibold text-slate-800">{c.closeResult}</span>}
            {c.closedDate && <span className="text-xs text-slate-500">확정 {fmtDate(c.closedDate)}</span>}
          </div>
          {c.closeReason && <div className="text-xs text-slate-500 mt-1">{c.closeReason}</div>}
        </div>
      )}

      <Section title="선임약정 · 정산">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <div className="text-xs text-slate-400 mb-0.5">착수금</div>
            <div className="text-sm font-semibold text-slate-800">{fmtMoney(c.retainer?.amount)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-0.5">입금액</div>
            <div className="text-sm text-slate-700">{fmtMoney(c.retainer?.paidAmount)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-0.5">미수금</div>
            {(() => {
              const due = Math.max(0, (Number(c.retainer?.amount) || 0) - (Number(c.retainer?.paidAmount) || 0));
              return <div className={`text-sm font-semibold ${due > 0 ? "text-rose-600" : "text-emerald-600"}`}>{due > 0 ? fmtMoney(due) : "완납"}</div>;
            })()}
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-0.5">수임일</div>
            <div className="text-sm text-slate-700">{fmtDate(c.retainer?.date)}</div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div>
            <div className="text-xs text-slate-400 mb-0.5">성공보수 조건</div>
            <div className="text-sm text-slate-700">{c.retainer?.successFee || "—"}</div>
            {c.retainer?.successFeeAmount > 0 && (
              <div className="text-xs text-slate-400">약정 {fmtMoney(c.retainer.successFeeAmount)}</div>
            )}
          </div>
          {c.retainer?.successFeeCollected > 0 && (
            <div>
              <div className="text-xs text-slate-400 mb-0.5">성공보수 수금</div>
              <div className="text-sm text-emerald-600 font-semibold">{fmtMoney(c.retainer.successFeeCollected)}</div>
            </div>
          )}
        </div>
      </Section>

      <Section title="기한 (불변기간)">
        <div className="flex gap-2 mb-2">
          <input className="input-sm flex-1" placeholder="기한 내용 (예: 항소장 제출)"
            value={newDeadline.title} onChange={e => setNewDeadline(p => ({ ...p, title: e.target.value }))}
            onKeyDown={e => { if (e.key === "Enter") addDeadline(); }} />
          <input className="input-sm" style={{ width: "140px" }} type="date"
            value={newDeadline.date} onChange={e => setNewDeadline(p => ({ ...p, date: e.target.value }))} />
          <button onClick={addDeadline} disabled={!newDeadline.title.trim() || !newDeadline.date}
            className="btn-primary text-xs px-3 py-1 disabled:opacity-40">추가</button>
        </div>
        {(() => {
          const dls = (c.memos || []).filter(m => m.category === "불변기간" && !m.checked)
            .sort((a, b) => new Date(a.date) - new Date(b.date));
          if (dls.length === 0) return <div className="text-sm text-slate-400 italic">임박한 기한이 없습니다.</div>;
          return (
            <div className="space-y-1.5">
              {dls.map(m => {
                const d = dday(m.date);
                const tone = d <= 0 ? "border-red-300 bg-red-50" : d <= 3 ? "border-rose-200 bg-rose-50/40" : d <= 7 ? "border-amber-200 bg-amber-50/30" : "border-slate-200 bg-slate-50";
                return (
                  <div key={m.id} className={`flex items-center gap-3 rounded-lg px-3 py-2 border ${tone}`}>
                    <button onClick={() => toggleMemoCheck(m.id)}
                      className="flex-shrink-0 w-4 h-4 rounded border-2 border-rose-300 hover:bg-rose-400 hover:text-white" title="완료 표시" />
                    <DdayBadge dateStr={m.date} small />
                    <span className="text-sm font-medium text-slate-700 flex-1 min-w-0 truncate">{m.title}</span>
                    <span className="text-xs text-slate-500 flex-shrink-0">{fmtDate(m.date)}</span>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </Section>

      <Section title="기일">
        {hearings.length === 0 ? (
          <div className="text-sm text-slate-400 italic">등록된 기일이 없습니다.</div>
        ) : (
          <div className="space-y-1.5">
            {upcomingHearings.length > 0 && (
              <>
                <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">예정</div>
                {upcomingHearings.map(h => (
                  <HearingRow
                    key={h.id}
                    h={h}
                    upcoming
                    onDelete={deleteHearing}
                    onAddDeadline={addAppealDeadline}
                    editingMemo={editingHearingMemoId === h.id ? editingHearingMemo : null}
                    onStartMemo={startEditHearingMemo}
                    onChangeMemo={setEditingHearingMemo}
                    onSaveMemo={saveHearingMemo}
                    onCancelMemo={cancelHearingMemo}
                  />
                ))}
              </>
            )}
            {pastHearings.length > 0 && (
              <>
                <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-2 mb-1">지난 기일</div>
                {pastHearings.map(h => (
                  <HearingRow
                    key={h.id}
                    h={h}
                    onDelete={deleteHearing}
                    onAddDeadline={addAppealDeadline}
                    editingMemo={editingHearingMemoId === h.id ? editingHearingMemo : null}
                    onStartMemo={startEditHearingMemo}
                    onChangeMemo={setEditingHearingMemo}
                    onSaveMemo={saveHearingMemo}
                    onCancelMemo={cancelHearingMemo}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </Section>

      <Section title="진행경과">
        {/* 빠른 입력 */}
        <div className="mb-3 space-y-2 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
          <div className="flex gap-2">
            <input type="date" className="input-sm" style={{ width: "130px" }} value={newTimelineDate}
              onChange={e => setNewTimelineDate(e.target.value)} />
            <input className="input-sm flex-1" placeholder="경과 한줄 입력..." value={newTimeline}
              onChange={e => setNewTimeline(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addTimeline(); }} />
            <button onClick={addTimeline} disabled={!newTimeline.trim()}
              className="btn-primary text-xs px-3 py-1 disabled:opacity-40">추가</button>
          </div>
          <textarea className="input-sm w-full min-h-[58px] text-xs" placeholder="상세 메모 (상담 내용, 다음 액션, 증거/서류 확인사항 등)"
            value={newTimelineDetail} onChange={e => setNewTimelineDetail(e.target.value)} />
        </div>
        {timeline.length === 0 ? (
          <div className="text-sm text-slate-400 italic">등록된 경과가 없습니다.</div>
        ) : (
          <div className="relative pl-4">
            <div className="absolute left-1.5 top-0 bottom-0 w-px bg-slate-200" />
            {[...timeline].sort((a, b) => new Date(b.date) - new Date(a.date)).map((t) => (
              <div key={t.id} className="relative mb-3 last:mb-0">
                <div className="absolute -left-2.5 top-1.5 w-2 h-2 rounded-full bg-indigo-400 border-2 border-white" />
                <div className="flex items-center justify-between gap-1.5 mb-0.5">
                  <div className="flex items-center gap-1.5">
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
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setEditingTimelineContentId(t.id); setEditingTimelineContent(t.content); }}
                      className="text-xs text-slate-300 hover:text-indigo-500 transition-colors" title="내용 수정">✎</button>
                    <button onClick={() => { setEditingTimelineDetailId(t.id); setEditingTimelineDetail(t.detail || ""); }}
                      className={`text-xs transition-colors ${t.detail ? "text-indigo-400 hover:text-indigo-600" : "text-slate-300 hover:text-indigo-500"}`}
                      title={t.detail ? "상세메모 수정" : "상세메모 추가"}>상세</button>
                    <button onClick={() => deleteTimeline(t.id)}
                      className="text-xs text-slate-300 hover:text-red-500 transition-colors" title="삭제">✕</button>
                  </div>
                </div>
                {editingTimelineContentId === t.id ? (
                  <div className="flex gap-1.5">
                    <input className="input-sm flex-1 text-sm"
                      value={editingTimelineContent}
                      onChange={e => setEditingTimelineContent(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") saveTimelineContent(t.id); if (e.key === "Escape") setEditingTimelineContentId(null); }}
                      autoFocus />
                    <button onClick={() => saveTimelineContent(t.id)} className="btn-primary text-xs px-2 py-1">저장</button>
                    <button onClick={() => setEditingTimelineContentId(null)} className="text-xs text-slate-400 hover:text-slate-600 px-1">취소</button>
                  </div>
                ) : (
                  <div className="text-sm text-slate-700">{t.content}</div>
                )}
                {editingTimelineDetailId === t.id ? (
                  <div className="mt-1 space-y-1">
                    <textarea className="input-sm w-full min-h-[64px] text-xs"
                      value={editingTimelineDetail}
                      onChange={e => setEditingTimelineDetail(e.target.value)}
                      onKeyDown={e => { if (e.key === "Escape") setEditingTimelineDetailId(null); }}
                      autoFocus />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setEditingTimelineDetailId(null)} className="text-xs text-slate-400 hover:text-slate-600 px-1">취소</button>
                      <button onClick={() => saveTimelineDetail(t.id)} className="btn-primary text-xs px-2 py-1">상세 저장</button>
                    </div>
                  </div>
                ) : (
                  t.detail && <div className="text-xs text-slate-500 mt-1 whitespace-pre-wrap leading-relaxed bg-slate-50 border border-slate-100 rounded-md px-2 py-1.5">{t.detail}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {showLegacyMemoSection && (
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
            {sortedMemos.map(m => {
              const deadlineDday = m.category === "불변기간" ? dday(m.date) : null;
              const urgentBorder = m.category === "불변기간" && !m.checked && deadlineDday !== null
                ? (deadlineDday <= 0 ? "border-red-300 bg-red-50/50" : deadlineDday <= 3 ? "border-rose-200 bg-rose-50/30" : deadlineDday <= 7 ? "border-amber-200" : "border-slate-200")
                : "border-slate-200";
              return (
              <div key={m.id} className={`border rounded-lg overflow-hidden ${urgentBorder}`}>
                <div
                  className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => toggleMemo(m.id)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {m.category === "불변기간" && (
                      <button onClick={(e) => { e.stopPropagation(); toggleMemoCheck(m.id); }}
                        className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                          m.checked ? "bg-rose-400 border-rose-400 text-white" : "border-rose-300 hover:border-rose-500"
                        }`}>
                        {m.checked && <span className="text-white text-xs leading-none">✓</span>}
                      </button>
                    )}
                    {m.category === "불변기간" && !m.checked && deadlineDday !== null && (
                      <DdayBadge dateStr={m.date} small />
                    )}
                    <span className={`text-xs px-1.5 py-0.5 rounded border flex-shrink-0 ${MEMO_CAT_STYLE[m.category] || MEMO_CAT_STYLE["일반메모"]}`}>
                      {m.category}
                    </span>
                    <span className={`text-sm font-medium truncate ${m.category === "불변기간" && m.checked ? "line-through text-slate-400" : "text-slate-700"}`}>{m.title}</span>
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
                    {editingMemoFullId === m.id ? (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <select className="input-sm" style={{ width: "auto" }} value={editingMemoData.category}
                            onChange={e => setEditingMemoData(p => ({ ...p, category: e.target.value }))}>
                            {MEMO_CATEGORIES.map(cat => <option key={cat}>{cat}</option>)}
                          </select>
                          <input className="input-sm flex-1" placeholder="제목 *" value={editingMemoData.title}
                            onChange={e => setEditingMemoData(p => ({ ...p, title: e.target.value }))} />
                        </div>
                        <textarea className="input-sm w-full resize-none" rows={4}
                          value={editingMemoData.content}
                          onChange={e => setEditingMemoData(p => ({ ...p, content: e.target.value }))} />
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setEditingMemoFullId(null)}
                            className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1">취소</button>
                          <button onClick={() => saveMemoFull(m.id)}
                            className="btn-primary text-xs px-3 py-1">저장</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{m.content || <span className="text-slate-400 italic">내용 없음</span>}</div>
                        <div className="flex gap-3 mt-2">
                          <button onClick={(e) => { e.stopPropagation(); startEditMemo(m); }}
                            className="text-xs text-indigo-400 hover:text-indigo-600">수정</button>
                          <button onClick={(e) => { e.stopPropagation(); deleteMemo(m.id); }}
                            className="text-xs text-red-400 hover:text-red-600">삭제</button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
            })}
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
      )}
    </div>
  );
}
