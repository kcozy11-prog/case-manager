import { useState, useEffect } from "react";
import CaseSearchSelect from "./CaseSearchSelect";

// 사건 연동 기록 에디터 (재사용)
//  variant="progress" : 관련 사건 + 내용  → 사건 진행경과(timeline)
//  variant="call"     : 관련 사건 + 제목 + 상세 + ☐의뢰인요청  → 진행경과(+의뢰인요청 메모)
// item: { id, caseId, caseTitle, date, content?, title?, detail?, asClientRequest?, recordedAt?, timelineId?, memoId? }
// onRecord(item, field): async → JournalApp 이 사건에 쓰고 item 에 recordedAt/timelineId/memoId 갱신·저장
export default function CaseNoteEditor({
  items = [],
  onChange,
  cases = [],
  field = "",
  variant = "progress",
  onRecord = null,
  defaultDate = "",
  placeholder = "내용 입력",
}) {
  const isCall = variant === "call";
  const [caseId, setCaseId] = useState("");
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [asClientRequest, setAsClientRequest] = useState(false);
  const [recordingId, setRecordingId] = useState(null);
  const [err, setErr] = useState(null);

  // 일지 날짜가 바뀌면 입력칸 기본 날짜도 따라가게
  useEffect(() => { setDate(defaultDate); }, [defaultDate]);

  const mkId = () => `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const caseTitleOf = (id) => cases.find((c) => c.id === id)?.title || "";

  const add = () => {
    const hasBody = isCall ? (title.trim() || detail.trim()) : content.trim();
    if (!hasBody) return;
    const base = {
      id: mkId(),
      caseId,
      caseTitle: caseTitleOf(caseId),
      date: date || defaultDate,
    };
    const item = isCall
      ? { ...base, title: title.trim(), detail: detail.trim(), asClientRequest }
      : { ...base, content: content.trim() };
    onChange([...(items || []), item]);
    setCaseId(""); setContent(""); setTitle(""); setDetail(""); setAsClientRequest(false);
  };

  const updateItem = (id, patch) =>
    onChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const remove = (id) => onChange(items.filter((it) => it.id !== id));

  const record = async (item) => {
    if (!onRecord) return;
    if (!item.caseId) { setErr({ id: item.id, msg: "관련 사건을 먼저 선택하세요." }); return; }
    setRecordingId(item.id); setErr(null);
    try {
      await onRecord(item, field);
    } catch (e) {
      setErr({ id: item.id, msg: e.message || "사건 기록 실패" });
    } finally {
      setRecordingId(null);
    }
  };

  const caseSelect = (value, onPick, extraClass = "") => (
    <CaseSearchSelect cases={cases} value={value} onChange={onPick}
      placeholder="관련 사건(선택)" className={extraClass} />
  );

  return (
    <div className="space-y-2">
      {/* 기록 항목 리스트 */}
      {(items || []).length > 0 && (
        <ul className="space-y-1.5">
          {items.map((it) => {
            const recorded = !!it.recordedAt;
            return (
              <li key={it.id} className="border border-slate-100 rounded-lg bg-white px-2.5 py-2 group">
                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                  {caseSelect(it.caseId || "", (v) => updateItem(it.id, { caseId: v, caseTitle: caseTitleOf(v) }), "flex-[1_1_140px] min-w-[120px]")}
                  <input type="date" value={it.date || ""}
                    onChange={(e) => updateItem(it.id, { date: e.target.value })}
                    className="input text-xs flex-[0_1_135px] min-w-[120px] font-mono" />
                  <button
                    onClick={() => record(it)}
                    disabled={recordingId === it.id}
                    className={`flex-shrink-0 text-xs px-2 py-1 rounded-md border transition-colors disabled:opacity-50 ${
                      recorded
                        ? "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                        : "border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                    }`}
                    title={recorded ? "사건 진행경과에 기록됨 (다시 누르면 갱신)" : "선택한 사건의 진행경과에 기록"}>
                    {recordingId === it.id ? "기록 중…" : recorded ? "✓ 기록됨" : "사건에 기록"}
                  </button>
                  <button onClick={() => remove(it.id)}
                    className="flex-shrink-0 text-slate-300 hover:text-red-500 text-sm opacity-0 group-hover:opacity-100"
                    title="삭제">✕</button>
                </div>

                {isCall ? (
                  <div className="space-y-1">
                    <input value={it.title || ""} onChange={(e) => updateItem(it.id, { title: e.target.value })}
                      className="input text-xs w-full" placeholder="제목 / 상대방" />
                    <textarea value={it.detail || ""} onChange={(e) => updateItem(it.id, { detail: e.target.value })}
                      className="input text-xs w-full min-h-[44px]" placeholder="상세 메모" />
                    <label className="flex items-center gap-1.5 text-xs text-slate-500">
                      <input type="checkbox" checked={!!it.asClientRequest}
                        onChange={(e) => updateItem(it.id, { asClientRequest: e.target.checked })}
                        className="w-3.5 h-3.5 rounded border-slate-300 accent-indigo-600" />
                      의뢰인 요청 메모로도 저장
                    </label>
                  </div>
                ) : (
                  <input value={it.content || ""} onChange={(e) => updateItem(it.id, { content: e.target.value })}
                    className="input text-xs w-full" placeholder={placeholder} />
                )}

                {err && err.id === it.id && (
                  <div className="text-[11px] text-red-600 font-medium mt-1 px-2 py-1 rounded bg-red-50 border border-red-200 inline-block">⚠ {err.msg}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* 추가 입력 폼 */}
      <div className="border border-dashed border-slate-200 rounded-lg p-2 space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          {caseSelect(caseId, setCaseId, "flex-[1_1_140px] min-w-[120px]")}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="input text-xs flex-[0_1_135px] min-w-[120px] font-mono" />
        </div>
        {isCall ? (
          <>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              className="input text-xs w-full" placeholder="제목 / 상대방" />
            <textarea value={detail} onChange={(e) => setDetail(e.target.value)}
              className="input text-xs w-full min-h-[44px]" placeholder="상세 메모" />
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 text-xs text-slate-500">
                <input type="checkbox" checked={asClientRequest}
                  onChange={(e) => setAsClientRequest(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-slate-300 accent-indigo-600" />
                의뢰인 요청 메모로도 저장
              </label>
              <button onClick={add} className="btn-ghost text-xs whitespace-nowrap px-3">+ 추가</button>
            </div>
          </>
        ) : (
          <div className="flex gap-1.5">
            <input value={content} onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
              className="input text-xs flex-1" placeholder={placeholder} />
            <button onClick={add} className="btn-ghost text-xs whitespace-nowrap px-3">+ 추가</button>
          </div>
        )}
      </div>
    </div>
  );
}
