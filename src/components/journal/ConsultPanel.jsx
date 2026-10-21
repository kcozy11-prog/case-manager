import { useState, useEffect } from "react";

// 「오늘 일정·상담」 칸
//  - hearings: 그 날짜에 잡힌 사건 기일(보기만) [{ key, caseTitle, time, type, result }]
//  - consults: 그 날짜의 수임 전 상담 일정(meta/consultations). 상담 메모는 일지 저장과 따로 「메모 저장」으로 바로 저장한다.
//  - onCreateCase(consult): 수임하면 사건 등록 창을 연다(일정은 기일·진행경과로, 메모는 진행경과로 옮김)
export default function ConsultPanel({ hearings = [], consults = [], onSaveMemo = null, onCreateCase = null }) {
  if (!hearings.length && !consults.length) {
    return <div className="text-xs text-slate-300 px-1 py-1">이 날짜에 잡힌 기일이나 상담 일정이 없습니다. LBOX의 사건번호 없는 「상담」·「미팅」 일정은 동기화 때 여기로 옵니다.</div>;
  }
  return (
    <div className="space-y-1.5">
      {hearings.map((h) => (
        <div key={h.key} className="flex items-center gap-2 text-sm text-slate-700 bg-white border border-slate-100 rounded-lg px-2.5 py-1.5">
          <span className="text-[11px] font-mono text-slate-400 w-10 flex-shrink-0">{h.time || "—"}</span>
          <span className="text-[11px] px-1.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100 flex-shrink-0">기일</span>
          <span className="min-w-0 truncate">{h.caseTitle} · {h.type}{h.result ? ` (${h.result})` : ""}</span>
        </div>
      ))}
      {consults.map((c) => (
        <ConsultCard key={c.id} consult={c} onSaveMemo={onSaveMemo} onCreateCase={onCreateCase} />
      ))}
    </div>
  );
}

function ConsultCard({ consult, onSaveMemo, onCreateCase }) {
  const [memo, setMemo] = useState(consult.memo || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null); // { tone, text }
  const dirty = memo !== (consult.memo || "");

  // 다른 기기에서 메모가 바뀌었고 이 화면에서 고치는 중이 아니면 따라간다
  useEffect(() => { if (!dirty) setMemo(consult.memo || ""); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consult.memo]);

  const save = async () => {
    if (!onSaveMemo || !dirty) return true;
    setSaving(true); setMsg(null);
    try {
      await onSaveMemo(consult.id, memo);
      setMsg({ tone: "ok", text: "저장됨" });
      return true;
    } catch (e) {
      setMsg({ tone: "err", text: `저장 실패: ${e.code || e.message || "오류"}` });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const createCase = async () => {
    if (!onCreateCase) return;
    await save();
    onCreateCase({ ...consult, memo });
  };

  return (
    <div className="bg-white border border-violet-100 rounded-lg px-2.5 py-2 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-mono text-slate-400 w-10 flex-shrink-0">{consult.time || "—"}</span>
        <span className="text-[11px] px-1.5 rounded bg-violet-50 text-violet-600 border border-violet-100 flex-shrink-0">상담</span>
        <span className="text-sm text-slate-700 min-w-0 flex-1 truncate">{consult.summary}</span>
        {consult.location && <span className="text-[11px] text-slate-400">{consult.location}</span>}
        {consult.caseId ? (
          <span className="text-[11px] px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-700 flex-shrink-0">✓ 사건 {consult.caseTitle || "연결됨"}</span>
        ) : onCreateCase && (
          <button onClick={createCase} className="text-[11px] px-2 py-0.5 rounded border border-violet-300 text-violet-700 hover:bg-violet-50 flex-shrink-0"
            title="수임하면 사건을 만듭니다. 상담 일정은 기일·진행경과로, 메모는 진행경과로 옮깁니다.">사건 만들기</button>
        )}
      </div>
      <textarea value={memo} onChange={(e) => { setMemo(e.target.value); setMsg(null); }}
        placeholder="상담 메모(문의 내용, 상대방, 수임 여부 등)"
        className="input text-xs w-full min-h-[52px]" />
      <div className="flex items-center gap-2 justify-end">
        {msg && <span className={`text-[11px] ${msg.tone === "err" ? "text-red-600" : "text-emerald-600"}`}>{msg.text}</span>}
        {dirty && <span className="text-[11px] text-amber-500">● 메모 미저장</span>}
        {onSaveMemo && (
          <button onClick={save} disabled={!dirty || saving}
            className="text-[11px] px-2 py-0.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40">
            {saving ? "저장 중…" : "메모 저장"}
          </button>
        )}
      </div>
    </div>
  );
}
