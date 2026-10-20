import { useMemo, useRef, useState } from "react";
import { todayStr } from "../utils";
import { parseBatch, validateBatch, defaultSelectedIds, isSelectableStatus, describeItem, opLabel } from "../claudeInbox";

const MAX_FILE_BYTES = 1_000_000;

const STATUS_STYLE = {
  ok: { box: "border-slate-200 bg-white", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "정상" },
  warn: { box: "border-amber-300 bg-amber-50", badge: "bg-amber-100 text-amber-800 border-amber-300", label: "경고" },
  error: { box: "border-red-200 bg-red-50/60", badge: "bg-red-100 text-red-700 border-red-200", label: "오류" },
  applied: { box: "border-slate-200 bg-slate-50", badge: "bg-slate-200 text-slate-600 border-slate-300", label: "이미 반영됨" },
};

function caseHeading(group) {
  const c = group.caseObj;
  if (!c) return { title: group.cmCaseId ? `앱에 없는 사건 (${group.cmCaseId})` : "사건 지정 없음", sub: "" };
  const sub = [c.client && `의뢰인 ${c.client}`, c.court && c.court !== "—" && c.court, c.caseNumber && c.caseNumber !== "—" && c.caseNumber]
    .filter(Boolean).join(" · ");
  return { title: c.title || c.id, sub, closed: c.status === "종결" };
}

function resultMessage(r) {
  if (!r) return null;
  if (r.items === 0 && r.failedItems === 0) {
    return { tone: "warn", text: `반영할 항목이 없었습니다${r.skipped ? `(고른 ${r.skipped}건은 그 사이 이미 반영되었거나 상태가 바뀌어 건너뜀. 다시 확인해 주세요)` : ""}.` };
  }
  const parts = [];
  if (r.items) {
    parts.push(`사건 ${r.cases}곳에 ${r.items}건을 반영했습니다`);
    parts.push(r.pendingItems
      ? `이 중 ${r.pendingItems}건은 서버 연결이 느려 저장을 이어서 진행합니다(이 기기에 보관되어 연결되면 자동 저장)`
      : "서버 저장 확인");
  }
  if (r.skipped) parts.push(`고른 항목 중 ${r.skipped}건은 상태가 바뀌어 건너뜀(다시 확인해 주세요)`);
  if (r.failedItems) parts.push(`${r.failedCases}곳 ${r.failedItems}건 저장 실패 — 새로고침 뒤 다시 확인해 주세요`);
  return { tone: r.failedItems ? "err" : r.pendingItems || r.skipped ? "warn" : "ok", text: parts.join(". ") + "." };
}

// ── Claude 반영 검토함 ────────────────────────────────────────────────────────
// Claude가 만든 반영 블록(cm-update-v1)을 붙여넣거나 파일로 골라, 사건별로 확인하고 고른 항목만 반영한다.
//  - ready=false(서버 판본·반영 기록을 아직 못 받음)이면 미리보기만 하고 반영은 막는다.
//  - onApply(batch, itemIds, seen) → { cases, items, pendingItems, failedCases, failedItems, skipped }
//    seen: 화면에서 본 판정 { 항목 id: status } — 그 사이 정상 → 경고로 바뀐 항목은 반영하지 않는다
export default function ClaudeInboxModal({ cases, ledger, ready, notReadyText = "", onApply, onClose }) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [batch, setBatch] = useState(null);
  const [parseError, setParseError] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState(null);
  const [applyError, setApplyError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const report = useMemo(
    () => (batch ? validateBatch(batch, cases, ledger, { today: todayStr }) : null),
    [batch, cases, ledger],
  );
  // 반영 뒤 「이미 반영됨」으로 바뀐 항목 등은 골라 둔 것에서 자동으로 빠진다
  const chosen = useMemo(
    () => (report ? report.items.filter((r) => selected.has(r.id) && isSelectableStatus(r.status)) : []),
    [report, selected],
  );
  const chosenWarn = chosen.filter((r) => r.status === "warn").length;

  const load = (raw, name = "") => {
    setText(raw);
    setFileName(name);
    setResult(null);
    setApplyError("");
    if (!String(raw).trim()) { setBatch(null); setParseError(""); setSelected(new Set()); return; }
    try {
      const b = parseBatch(raw);
      setBatch(b);
      setParseError("");
      setSelected(new Set(defaultSelectedIds(validateBatch(b, cases, ledger, { today: todayStr }))));
    } catch (e) {
      setBatch(null);
      setParseError(e.message || String(e));
      setSelected(new Set());
    }
  };

  const readFile = async (file) => {
    if (!file || applying) return;
    if (file.size > MAX_FILE_BYTES) {
      setBatch(null);
      setFileName(file.name);
      setParseError(`파일이 너무 큽니다(${Math.round(file.size / 1024)}KB). 반영 파일은 1MB 이하여야 합니다.`);
      return;
    }
    try {
      load(await file.text(), file.name);
    } catch (e) {
      setParseError(`파일을 읽지 못했습니다: ${e.message || e}`);
    }
  };

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const selectOk = () => setSelected(new Set(defaultSelectedIds(report)));
  const clearSel = () => setSelected(new Set());
  const reset = () => { if (applying) return; load(""); if (fileRef.current) fileRef.current.value = ""; };

  const apply = async () => {
    if (!batch || !chosen.length || !ready || applying) return;
    if (chosenWarn && !window.confirm(`경고가 있는 항목 ${chosenWarn}건이 포함되어 있습니다. 내용을 확인했고 반영할까요?`)) return;
    setApplying(true);
    setApplyError("");
    setResult(null);
    try {
      const r = await onApply(batch, chosen.map((x) => x.id), Object.fromEntries(chosen.map((x) => [x.id, x.status])));
      setResult(r);
      setSelected(new Set());
    } catch (e) {
      setApplyError(e.message || String(e));
    } finally {
      setApplying(false);
    }
  };

  const msg = resultMessage(result);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); readFile(e.dataTransfer?.files?.[0]); }}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between" style={{ background: "#1E293B" }}>
          <div>
            <div className="text-white font-semibold">Claude 반영</div>
            <div className="text-slate-400 text-xs">Claude가 만든 반영 블록(cm-update-v1)을 확인하고, 고른 항목만 사건에 반영합니다.</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* 입력: 붙여넣기 · 파일 선택 · 끌어다 놓기 */}
          {!batch && (
            <div className={`space-y-2 rounded-xl ${dragOver ? "ring-2 ring-indigo-400 ring-offset-2" : ""}`}>
              <textarea
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
                rows={7}
                placeholder={"Claude가 준 반영 블록(JSON)을 그대로 붙여넣으세요.\n\n또는 아래 「파일 선택」으로 .cm.json 파일을 고르거나, 파일을 이 창에 끌어다 놓으세요."}
                value={text}
                onChange={(e) => load(e.target.value)}
                aria-label="반영 블록 붙여넣기"
              />
              <div className="flex items-center gap-2 flex-wrap">
                <input ref={fileRef} type="file" accept=".json,application/json" className="hidden"
                  onChange={(e) => readFile(e.target.files?.[0])} aria-label="반영 파일 선택" />
                <button className="btn-ghost text-xs" onClick={() => fileRef.current?.click()}>📂 파일 선택</button>
                <span className="text-[11px] text-slate-400">{fileName ? `읽은 파일: ${fileName}` : "파일을 이 창에 끌어다 놓아도 됩니다."}</span>
              </div>
            </div>
          )}

          {parseError && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
              {fileName && <div className="font-semibold mb-0.5">{fileName}</div>}
              {parseError}
            </div>
          )}

          {report && (
            <>
              {/* 묶음 정보 */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-xs text-slate-600 min-w-0">
                    <span className="font-semibold text-slate-800">묶음 {batch.batchId}</span>
                    {batch.createdAt && <span className="text-slate-400"> · 작성 {batch.createdAt.replace("T", " ").slice(0, 16)}</span>}
                    {fileName && <span className="text-slate-400"> · {fileName}</span>}
                  </div>
                  <button onClick={reset} className="text-[11px] text-slate-500 hover:text-indigo-600 border border-slate-200 rounded px-2 py-0.5 bg-white">다른 묶음 읽기</button>
                </div>
                {batch.source?.folder && (
                  <div className="text-[11px] text-slate-400 break-all">출처: {batch.source.folder}{batch.source.pc ? ` (${batch.source.pc})` : ""}</div>
                )}
                <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                  <span className={`px-2 py-0.5 rounded-full border ${STATUS_STYLE.ok.badge}`}>정상 {report.counts.ok}</span>
                  <span className={`px-2 py-0.5 rounded-full border ${STATUS_STYLE.warn.badge}`}>경고 {report.counts.warn}</span>
                  <span className={`px-2 py-0.5 rounded-full border ${STATUS_STYLE.error.badge}`}>오류 {report.counts.error}</span>
                  <span className={`px-2 py-0.5 rounded-full border ${STATUS_STYLE.applied.badge}`}>이미 반영됨 {report.counts.applied}</span>
                  <span className="ml-auto flex gap-1.5">
                    <button onClick={selectOk} className="text-slate-500 hover:text-indigo-600 underline-offset-2 hover:underline">정상만 선택</button>
                    <span className="text-slate-300">|</span>
                    <button onClick={clearSel} className="text-slate-500 hover:text-indigo-600 underline-offset-2 hover:underline">모두 해제</button>
                  </span>
                </div>
              </div>

              {/* 사건별 미리보기 */}
              {report.groups.map((g) => {
                const h = caseHeading(g);
                return (
                  <div key={g.key} className="space-y-2">
                    <div className="flex items-baseline gap-2 flex-wrap border-b border-slate-100 pb-1">
                      <span className={`text-sm font-bold ${g.caseObj ? "text-slate-800" : "text-red-600"}`}>{h.title}</span>
                      {h.closed && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">종결</span>}
                      {h.sub && <span className="text-[11px] text-slate-400">{h.sub}</span>}
                    </div>
                    {g.items.map((r) => {
                      const st = STATUS_STYLE[r.status];
                      const d = describeItem(r.norm);
                      const selectable = isSelectableStatus(r.status);
                      const checked = selectable && selected.has(r.id);
                      return (
                        <label key={`${r.index}-${r.id}`}
                          className={`flex gap-2.5 border rounded-xl p-3 ${st.box} ${selectable ? "cursor-pointer" : "cursor-not-allowed"}`}>
                          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-indigo-600 flex-shrink-0"
                            checked={checked} disabled={!selectable || applying} onChange={() => toggle(r.id)}
                            aria-label={`${opLabel(r.op)} ${d.title}`} />
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-start gap-2">
                              <span className="text-[10px] px-1.5 py-0.5 rounded border bg-indigo-50 text-indigo-700 border-indigo-200 flex-shrink-0 mt-0.5">{opLabel(r.op)}</span>
                              <span className={`text-sm font-medium leading-snug break-words min-w-0 flex-1 ${r.status === "applied" ? "text-slate-500" : "text-slate-800"}`}>{d.title}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border flex-shrink-0 ${st.badge}`}>{st.label}</span>
                            </div>
                            {d.meta && <div className="text-xs text-slate-500">{d.meta}</div>}
                            {d.body && <div className="text-xs text-slate-600 whitespace-pre-wrap break-words line-clamp-3">{d.body}</div>}
                            {r.norm?.basis && <div className="text-[11px] text-slate-400 break-words">근거: {r.norm.basis}</div>}
                            {r.errors.map((m, i) => <div key={`e${i}`} className="text-[11px] text-red-600">✗ {m}</div>)}
                            {r.warnings.map((m, i) => <div key={`w${i}`} className="text-[11px] text-amber-700">⚠ {m}</div>)}
                            {r.notes.map((m, i) => <div key={`n${i}`} className="text-[11px] text-slate-500">✓ {m}</div>)}
                            <div className="text-[10px] text-slate-300">항목 {r.id || "(id 없음)"}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* 반영 결과 (스크롤과 무관하게 늘 보이는 자리) */}
        {(applyError || msg) && (
          <div className="px-5 pt-3">
            {applyError && <div className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">✗ {applyError}</div>}
            {msg && (
              <div role="status" className={`text-xs px-3 py-2 rounded-lg border ${
                msg.tone === "ok" ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                : msg.tone === "warn" ? "text-amber-800 bg-amber-50 border-amber-200"
                : "text-red-600 bg-red-50 border-red-200"
              }`}>{msg.tone === "ok" ? "✓ " : msg.tone === "warn" ? "⏱ " : "✗ "}{msg.text}</div>
            )}
          </div>
        )}

        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[11px] text-slate-400 min-w-0">
            {!ready
              ? <span className="text-amber-600">{notReadyText || "서버 데이터를 확인하는 중이라 아직 반영할 수 없습니다."}</span>
              : report
                ? <>선택 {chosen.length}건{chosenWarn ? <span className="text-amber-700"> (경고 {chosenWarn}건 포함)</span> : ""} · 경고 항목은 내용을 보고 직접 고르세요.</>
                : "오류·이미 반영됨 항목은 고를 수 없습니다."}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button className="btn-ghost" onClick={onClose}>닫기</button>
            <button className="btn-primary" onClick={apply} disabled={!ready || applying || chosen.length === 0}>
              {applying ? "반영 중…" : `선택 ${chosen.length}건 반영`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
