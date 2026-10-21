import { useState } from "react";
import CaseSearchSelect from "./CaseSearchSelect";
import { DEFAULT_TIMELINE_ACTIVITY_TYPE, TIMELINE_ACTIVITY_TYPES } from "../../timelineActivity";
import { WORK_KINDS, DEFAULT_WORK_KIND, workKindLabel, hasWorkBody } from "../../journalWork";

const KIND_CLASS = {
  progress: "bg-indigo-50 text-indigo-600 border-indigo-200",
  call: "bg-sky-50 text-sky-700 border-sky-200",
  meeting: "bg-violet-50 text-violet-700 border-violet-200",
  etc: "bg-slate-50 text-slate-600 border-slate-200",
};

const mkId = () => `work_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

function KindPicker({ value, onChange }) {
  return (
    <div className="flex gap-1 flex-shrink-0">
      {WORK_KINDS.map((k) => (
        <button key={k.value} type="button" onClick={() => onChange(k.value)}
          className={`text-[11px] px-2 py-0.5 rounded-full border ${value === k.value ? KIND_CLASS[k.value] + " font-semibold" : "bg-white text-slate-400 border-slate-200 hover:text-slate-600"}`}>
          {k.label}
        </button>
      ))}
    </div>
  );
}

// 「오늘 한 일」: 항목마다 종류(진행·통화·회의·기타), 사건(선택), 내용·상세, 의뢰인요청 체크.
// 사건을 고른 항목만 「사건에 기록」(onRecord) → 진행경과(+ 의뢰인요청 메모). 사건 없는 항목은 일지에만 남는다.
export default function WorkLogEditor({ items = [], cases = [], onChange, onRecord = null, defaultDate = "" }) {
  const [kind, setKind] = useState(DEFAULT_WORK_KIND);
  const [caseId, setCaseId] = useState("");
  const [content, setContent] = useState("");
  const [detail, setDetail] = useState("");
  const [asClientRequest, setAsClientRequest] = useState(false);
  const [recordingId, setRecordingId] = useState(null);
  const [err, setErr] = useState(null);

  const caseTitleOf = (id) => cases.find((c) => c.id === id)?.title || "";

  const add = () => {
    if (!content.trim() && !detail.trim()) return;
    onChange([...(items || []), {
      id: mkId(), kind, caseId, caseTitle: caseTitleOf(caseId), date: defaultDate,
      content: content.trim(), detail: detail.trim(),
      ...(kind === "progress" ? { activityType: DEFAULT_TIMELINE_ACTIVITY_TYPE } : {}),
      asClientRequest: !!(caseId && asClientRequest),
      createdAt: new Date().toISOString(),
    }]);
    setContent(""); setDetail(""); setAsClientRequest(false);
  };

  const updateItem = (id, patch) => onChange((items || []).map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const remove = (it) => {
    if (it.recordedAt && !window.confirm("사건에 기록한 항목입니다. 일지에서만 지우고 사건 진행경과는 그대로 둡니다. 지울까요?")) return;
    onChange((items || []).filter((x) => x.id !== it.id));
  };

  const record = async (item) => {
    if (!onRecord) return;
    if (!item.caseId) { setErr({ id: item.id, msg: "관련 사건을 먼저 고르세요." }); return; }
    if (!hasWorkBody(item)) { setErr({ id: item.id, msg: "내용을 적어 주세요." }); return; }
    setRecordingId(item.id); setErr(null);
    try { await onRecord(item); } catch (e) { setErr({ id: item.id, msg: e.message || "사건 기록 실패" }); } finally { setRecordingId(null); }
  };

  return (
    <div className="space-y-2">
      {(items || []).length > 0 && (
        <ul className="space-y-1.5">
          {items.map((it) => {
            const recorded = !!it.recordedAt;
            return (
              <li key={it.id} className="border border-slate-100 rounded-lg bg-white px-2.5 py-2 group space-y-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <KindPicker value={it.kind || DEFAULT_WORK_KIND} onChange={(v) => updateItem(it.id, { kind: v })} />
                  <CaseSearchSelect cases={cases} value={it.caseId || ""}
                    onChange={(v) => updateItem(it.id, { caseId: v, caseTitle: caseTitleOf(v), ...(v ? {} : { asClientRequest: false }) })}
                    placeholder="사건(선택)" className="flex-[1_1_140px] min-w-[120px]" />
                  {(it.kind || DEFAULT_WORK_KIND) === "progress" && it.caseId && (
                    <select value={it.activityType || DEFAULT_TIMELINE_ACTIVITY_TYPE}
                      onChange={(e) => updateItem(it.id, { activityType: e.target.value })}
                      className="input text-xs flex-[0_1_105px] min-w-[96px]" aria-label="진행경과 유형">
                      {TIMELINE_ACTIVITY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  )}
                  {it.caseId && onRecord && (
                    <button onClick={() => record(it)} disabled={recordingId === it.id}
                      className={`flex-shrink-0 text-xs px-2 py-1 rounded-md border transition-colors disabled:opacity-50 ${recorded ? "border-emerald-200 text-emerald-600 hover:bg-emerald-50" : "border-indigo-200 text-indigo-600 hover:bg-indigo-50"}`}
                      title={recorded ? "사건 진행경과에 기록됨(다시 누르면 갱신)" : "고른 사건의 진행경과에 기록"}>
                      {recordingId === it.id ? "기록 중…" : recorded ? "✓ 기록됨" : "사건에 기록"}
                    </button>
                  )}
                  <button onClick={() => remove(it)} title="삭제"
                    className="flex-shrink-0 text-slate-300 hover:text-red-500 text-sm opacity-0 group-hover:opacity-100 ml-auto">✕</button>
                </div>
                <input value={it.content || ""} onChange={(e) => updateItem(it.id, { content: e.target.value })}
                  className="input text-xs w-full" placeholder={it.kind === "call" ? "상대방 / 요지" : "한 일"} />
                <textarea value={it.detail || ""} onChange={(e) => updateItem(it.id, { detail: e.target.value })}
                  className="input text-xs w-full min-h-[40px]" placeholder="상세 메모" />
                {it.caseId && (
                  <label className="flex items-center gap-1.5 text-xs text-slate-500">
                    <input type="checkbox" checked={!!it.asClientRequest}
                      onChange={(e) => updateItem(it.id, { asClientRequest: e.target.checked })}
                      className="w-3.5 h-3.5 rounded border-slate-300 accent-indigo-600" />
                    의뢰인요청 메모로도 남기기
                  </label>
                )}
                {err && err.id === it.id && (
                  <div className="text-[11px] text-red-600 font-medium px-2 py-1 rounded bg-red-50 border border-red-200 inline-block">⚠ {err.msg}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="border border-dashed border-slate-200 rounded-lg p-2 space-y-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <KindPicker value={kind} onChange={setKind} />
          <CaseSearchSelect cases={cases} value={caseId} onChange={(v) => { setCaseId(v); if (!v) setAsClientRequest(false); }}
            placeholder="사건(선택)" className="flex-[1_1_140px] min-w-[120px]" />
        </div>
        <div className="flex gap-1.5">
          <input value={content} onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); add(); } }}
            className="input text-xs flex-1" placeholder={`${workKindLabel(kind)} — 한 일 입력 후 Enter`} />
          <button onClick={add} className="btn-ghost text-xs whitespace-nowrap px-3">+ 추가</button>
        </div>
        <textarea value={detail} onChange={(e) => setDetail(e.target.value)}
          className="input text-xs w-full min-h-[40px]" placeholder="상세 메모(선택)" />
        {caseId && (
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            <input type="checkbox" checked={asClientRequest} onChange={(e) => setAsClientRequest(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-slate-300 accent-indigo-600" />
            의뢰인요청 메모로도 남기기
          </label>
        )}
      </div>
    </div>
  );
}
