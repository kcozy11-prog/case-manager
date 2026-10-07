import { useEffect, useMemo, useState } from "react";

// 데이터 복원: 예전 내보내기 파일과 지금 데이터를 비교해, 고른 항목만 더하거나 상태를 되돌린다.
// 지금 있는 기록은 지우거나 고치지 않는다. 적용 전에 지금 데이터를 백업 파일로 먼저 저장한다(App 이 수행).
const KIND_NOTE = {
  createCase: "지운 사건일 수 있어 기본 선택하지 않았습니다.",
  pendingBrief: "제출대기 서면 — 이미 처리했을 수 있어 기본 선택하지 않았습니다.",
  needsTarget: "같은 이름의 사건이 여럿이라, 위에서 넣을 사건을 골라야 복원됩니다.",
};

function noteFor(item) {
  if (item.kind === "createCase") return KIND_NOTE.createCase;
  if (item.needsTarget) return KIND_NOTE.needsTarget;
  if (item.kind === "add" && item.field === "briefs" && item.item?.status !== "submitted") return KIND_NOTE.pendingBrief;
  if (item.sameDateHint) return "같은 날짜에 다른 진행경과가 있습니다. 내용을 고쳐 다시 적은 기록이면 선택을 해제하세요.";
  return "";
}

function defaultSelection(plan) {
  const ids = new Set();
  (plan?.cases || []).forEach((p) => p.items.forEach((i) => { if (i.defaultOn) ids.add(i.id); }));
  (plan?.journal || []).forEach((j) => { if (j.defaultOn) ids.add(j.id); });
  return ids;
}

// 복원 후보 한 줄 (모듈 최상위 컴포넌트: 부모가 다시 그려져도 줄이 새로 만들어지지 않게)
function ItemRow({ item, checked, onToggle }) {
  const note = noteFor(item);
  return (
    <label className="flex items-start gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer">
      <input type="checkbox" className="mt-0.5 flex-shrink-0" checked={checked} onChange={() => onToggle(item.id)} />
      <div className="min-w-0 flex-1">
        <div className="text-xs text-slate-700 break-words">
          <span className="inline-block mr-1.5 px-1.5 py-0.5 rounded border border-slate-200 text-[10px] text-slate-500">{item.label}</span>
          {item.date && <span className="font-mono text-[11px] text-slate-400 mr-1.5">{item.date}</span>}
          <span title={item.text}>{item.text.length > 140 ? `${item.text.slice(0, 140)}…` : item.text}</span>
        </div>
        {note && <div className="text-[11px] text-amber-700 mt-0.5">{note}</div>}
      </div>
    </label>
  );
}

function fmtAt(iso) {
  try { return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }); } catch { return iso; }
}

const KIND_LABEL = { export: "내보내기", backup: "복원 전 백업", source: "복원에 쓴 파일" };
const DRIVE_SEARCH_URL = `https://drive.google.com/drive/search?q=${encodeURIComponent("사건관리 내보내기")}`;

// 한국시간 기준 날짜(YYYY-MM-DD)·시각(HH:MM)
function kstParts(ms) {
  const d = new Date(ms + 9 * 3600 * 1000).toISOString();
  return { date: d.slice(0, 10), time: d.slice(11, 16) };
}

export default function RestoreModal({ onAnalyze, onAnalyzeAt, onApply, loadLastRestore, loadRecentSources, onUndo, onClose, defaultInput = "" }) {
  const [step, setStep] = useState("input"); // input | loading | preview | applying | done
  const [mode, setMode] = useState("file"); // file | time
  const [input, setInput] = useState(defaultInput);
  const [recent, setRecent] = useState([]);
  const [pitrDate, setPitrDate] = useState(() => kstParts(Date.now() - 30 * 60000).date);
  const [pitrTime, setPitrTime] = useState(() => kstParts(Date.now() - 30 * 60000).time);
  const [includeCrossCheck, setIncludeCrossCheck] = useState(true);
  const [bundle, setBundle] = useState(null); // { plan, label, kind }
  const [selected, setSelected] = useState(new Set());
  const [targetFor, setTargetFor] = useState({});
  const [expanded, setExpanded] = useState(new Set());
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [lastRestore, setLastRestore] = useState(null);
  const [undoing, setUndoing] = useState(false);

  useEffect(() => {
    let alive = true;
    loadLastRestore?.().then((r) => { if (alive) setLastRestore(r); }).catch(() => {});
    loadRecentSources?.().then((list) => {
      if (!alive) return;
      setRecent(list || []);
      // 주소를 기억하지 않아도 되도록: 비어 있으면 가장 최근 파일을 미리 채운다
      setInput((cur) => cur || (list && list[0] ? list[0].url : ""));
    }).catch(() => {});
    return () => { alive = false; };
  }, [loadLastRestore, loadRecentSources]);

  const plan = bundle?.plan;
  const allItems = useMemo(() => [
    ...(plan?.cases || []).flatMap((p) => p.items.map((i) => ({ ...i, groupKey: p.key }))),
    ...(plan?.journal || []).map((j) => ({ ...j, groupKey: "journal" })),
  ], [plan]);
  const selectedCount = allItems.filter((i) => selected.has(i.id)).length;
  const blockedGroups = (plan?.cases || []).filter((p) => p.targetChoices && p.items.some((i) => selected.has(i.id)) && !targetFor[p.key]);

  // how: "file"(내보내기 파일) | "journal"(업무일지 기록만) | "time"(과거 시점)
  const analyze = async (how) => {
    setError("");
    setStep("loading");
    try {
      const b = how === "time"
        ? await onAnalyzeAt(pitrDate, pitrTime, { includeCrossCheck })
        : await onAnalyze(how === "file" ? input : "", { includeCrossCheck });
      setBundle(b);
      setSelected(defaultSelection(b.plan));
      setTargetFor({});
      const total = (b.plan.cases || []).reduce((n, p) => n + p.items.length, 0);
      setExpanded(total <= 40 ? new Set((b.plan.cases || []).map((p) => p.key)) : new Set());
      setStep("preview");
    } catch (e) {
      setError(e?.message || String(e));
      setStep("input");
    }
  };

  const apply = async () => {
    if (!selectedCount) return;
    if (!window.confirm(`선택한 ${selectedCount}건을 복원합니다.\n복원 전에 지금 데이터를 백업 파일로 먼저 저장합니다. 계속할까요?`)) return;
    setError("");
    setStep("applying");
    try {
      const r = await onApply(bundle, [...selected], targetFor);
      setResult(r);
      setStep("done");
    } catch (e) {
      setError(e?.message || String(e));
      setStep("preview");
    }
  };

  const undo = async () => {
    if (!lastRestore) return;
    if (!window.confirm(`${fmtAt(lastRestore.at)}에 한 복원(${lastRestore.source})을 되돌립니다.\n복원으로 더한 항목을 빼고, 복원으로 바꾼 상태는 그 뒤 고치지 않은 것만 되돌립니다. 계속할까요?`)) return;
    setUndoing(true);
    setError("");
    try {
      const r = await onUndo();
      setResult(r ? { undo: true, ...r } : { undo: true, cases: 0, journal: 0 });
      setLastRestore(null);
      setStep("done");
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setUndoing(false);
    }
  };

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const setGroup = (items, on) => setSelected((prev) => {
    const next = new Set(prev);
    items.forEach((i) => (on ? next.add(i.id) : next.delete(i.id)));
    return next;
  });
  const toggleExpand = (key) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-2 sm:p-4" onClick={step === "applying" ? undefined : onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[92vh]" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between rounded-t-2xl" style={{ background: "#1E293B" }}>
          <div>
            <div className="text-white font-semibold">데이터 복원</div>
            <div className="text-slate-400 text-xs mt-0.5">지금 있는 기록은 지우거나 고치지 않고, 고른 항목만 더하거나 상태를 되돌립니다.</div>
          </div>
          {step !== "applying" && <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>}
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 break-words">{error}</div>}

          {(step === "input" || step === "loading") && (
            <>
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
                {[["file", "내보내기 파일과 비교"], ["time", "지난 시점과 비교"]].map(([key, label]) => (
                  <button key={key} onClick={() => setMode(key)} disabled={step === "loading"}
                    className={`text-xs px-3 py-1.5 rounded-md ${mode === key ? "bg-white shadow text-slate-800 font-medium" : "text-slate-500"}`}>{label}</button>
                ))}
              </div>
              {mode === "file" ? (
                <>
                  <div className="text-sm text-slate-600 leading-relaxed">
                    예전에 내보내기한 구글 시트와 지금 데이터를 비교해, 그때 있던 기록 중 지금 없어진 것과 그때보다 되돌아간 상태(완료 → 미완료, 제출완료 → 제출대기, 종결 → 진행중)를 찾아 보여 줍니다.
                  </div>
                  {recent.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[11px] text-slate-400">최근 파일 (눌러서 고르기)</div>
                      <div className="flex flex-wrap gap-1.5">
                        {recent.map((r) => (
                          <button key={r.url} onClick={() => setInput(r.url)} disabled={step === "loading"}
                            className={`text-xs px-2.5 py-1 rounded-full border ${input.trim() === r.url ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
                            title={r.url}>
                            {r.title || "이름 없는 파일"}{r.kind && KIND_LABEL[r.kind] && !String(r.title || "").includes(KIND_LABEL[r.kind]) ? ` · ${KIND_LABEL[r.kind]}` : ""}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <input className="input" placeholder="https://docs.google.com/spreadsheets/d/…" value={input}
                    onChange={(e) => setInput(e.target.value)} disabled={step === "loading"} />
                  <div className="text-[11px] text-slate-500">
                    주소가 기억나지 않으면 <a className="text-indigo-600 underline" href={DRIVE_SEARCH_URL} target="_blank" rel="noopener noreferrer">Google Drive에서 '사건관리 내보내기' 찾기</a> → 파일을 열고 주소창의 주소를 복사해 붙여 넣으세요. 한 번 쓴 파일은 다음부터 위 목록에 나옵니다.
                  </div>
                </>
              ) : (
                <>
                  <div className="text-sm text-slate-600 leading-relaxed">
                    지정한 시각(한국시간, 분 단위)의 서버 데이터와 지금을 비교합니다. 시점 복구(PITR)를 켜 두었다면 최근 7일, 켜지 않았다면 최근 1시간 안의 시각만 조회됩니다.
                  </div>
                  <div className="flex gap-2 flex-wrap items-center">
                    <input type="date" className="input-sm w-auto" value={pitrDate} onChange={(e) => setPitrDate(e.target.value)} disabled={step === "loading"} />
                    <input type="time" className="input-sm w-auto" value={pitrTime} onChange={(e) => setPitrTime(e.target.value)} disabled={step === "loading"} />
                  </div>
                </>
              )}
              <label className="flex items-start gap-2 text-xs text-slate-600">
                <input type="checkbox" className="mt-0.5" checked={includeCrossCheck} onChange={(e) => setIncludeCrossCheck(e.target.checked)} />
                <span>업무일지에서 '사건에 기록'한 진행·통화 기록 중 사건에서 사라진 것도 함께 찾기 (내보내기 이후 기록도 되살릴 수 있습니다)</span>
              </label>
              <div className="flex gap-2 flex-wrap">
                {mode === "file" ? (
                  <button className="btn-primary text-sm" disabled={step === "loading" || !input.trim()} onClick={() => analyze("file")}>
                    {step === "loading" ? "비교하는 중…" : "비교하기"}
                  </button>
                ) : (
                  <button className="btn-primary text-sm" disabled={step === "loading" || !pitrDate || !pitrTime} onClick={() => analyze("time")}>
                    {step === "loading" ? "그 시점 데이터를 읽는 중…" : "그 시점과 비교하기"}
                  </button>
                )}
                <button className="btn-ghost text-sm" disabled={step === "loading"} onClick={() => analyze("journal")}>업무일지 기록만 대조</button>
              </div>
              {lastRestore && (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600 flex items-center gap-2 flex-wrap">
                  <span className="flex-1 min-w-0">마지막 복원: {fmtAt(lastRestore.at)} · {lastRestore.source} · 사건 {lastRestore.caseCount}건{lastRestore.journalCount ? ` · 업무일지 ${lastRestore.journalCount}일` : ""}</span>
                  <button className="btn-ghost text-xs py-1 px-2" disabled={undoing} onClick={undo}>{undoing ? "되돌리는 중…" : "이 복원 되돌리기"}</button>
                </div>
              )}
            </>
          )}

          {(step === "preview" || step === "applying") && plan && (
            <>
              <div className="text-sm text-slate-700">
                <b>{bundle.label}</b>
                <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded border border-slate-200 text-slate-500">{bundle.kind === "raw" ? "원본 백업(항목 id 포함)" : bundle.kind === "pitr" ? "서버의 지난 시점(항목 id 포함)" : bundle.kind === "journal" ? "업무일지 대조" : "내보내기 시트(사건명·날짜·내용으로 비교)"}</span>
              </div>
              <div className="text-xs text-slate-500">
                복원 후보: 사건 {plan.stats.cases}건 · 추가 {plan.stats.add}건 · 상태 되돌림 {plan.stats.status}건{plan.stats.createCase ? ` · 없는 사건 ${plan.stats.createCase}건` : ""}{plan.stats.journal ? ` · 업무일지 ${plan.stats.journal}일` : ""}
              </div>
              {allItems.length === 0 ? (
                <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-3">비교 결과 복원할 항목이 없습니다. 그때의 기록이 지금도 모두 남아 있습니다.</div>
              ) : (
                <>
                  <div className="flex gap-2 flex-wrap text-xs">
                    <button className="btn-ghost text-xs py-1 px-2" onClick={() => setSelected(defaultSelection(plan))}>기본 선택으로</button>
                    <button className="btn-ghost text-xs py-1 px-2" onClick={() => setSelected(new Set())}>모두 해제</button>
                    <button className="btn-ghost text-xs py-1 px-2" onClick={() => setExpanded(new Set((plan.cases || []).map((p) => p.key)))}>모두 펼치기</button>
                    <button className="btn-ghost text-xs py-1 px-2" onClick={() => setExpanded(new Set())}>모두 접기</button>
                  </div>
                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                    {(plan.cases || []).map((p) => {
                      const on = p.items.filter((i) => selected.has(i.id)).length;
                      const open = expanded.has(p.key);
                      return (
                        <div key={p.key}>
                          <div className="flex items-center gap-2 px-3 py-2 bg-slate-50/60">
                            <input type="checkbox" checked={on === p.items.length} ref={(el) => { if (el) el.indeterminate = on > 0 && on < p.items.length; }}
                              onChange={(e) => setGroup(p.items, e.target.checked)} />
                            <button className="flex-1 min-w-0 text-left text-sm font-medium text-slate-700 truncate" onClick={() => toggleExpand(p.key)}>
                              {open ? "▾" : "▸"} {p.title}
                              {!p.targetId && !p.targetChoices && <span className="ml-1.5 text-[11px] text-amber-700">(지금은 없는 사건)</span>}
                            </button>
                            <span className="text-[11px] text-slate-400 flex-shrink-0">{on}/{p.items.length}</span>
                          </div>
                          {p.targetChoices && (
                            <div className="px-3 py-1.5 text-xs text-slate-600 flex items-center gap-2 flex-wrap">
                              넣을 사건:
                              <select className="input-sm w-auto" value={targetFor[p.key] || ""} onChange={(e) => setTargetFor((prev) => ({ ...prev, [p.key]: e.target.value }))}>
                                <option value="">고르세요</option>
                                {p.targetChoices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                              </select>
                            </div>
                          )}
                          {open && p.items.map((item) => <ItemRow key={item.id} item={item} checked={selected.has(item.id)} onToggle={toggle} />)}
                        </div>
                      );
                    })}
                    {(plan.journal || []).length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50/60">
                          <input type="checkbox" checked={plan.journal.every((j) => selected.has(j.id))}
                            onChange={(e) => setGroup(plan.journal, e.target.checked)} />
                          <button className="flex-1 text-left text-sm font-medium text-slate-700" onClick={() => toggleExpand("journal")}>
                            {expanded.has("journal") ? "▾" : "▸"} 업무일지 (그 날짜 일지가 통째로 없어진 경우)
                          </button>
                          <span className="text-[11px] text-slate-400">{plan.journal.filter((j) => selected.has(j.id)).length}/{plan.journal.length}</span>
                        </div>
                        {expanded.has("journal") && plan.journal.map((j) => <ItemRow key={j.id} item={j} checked={selected.has(j.id)} onToggle={toggle} />)}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {step === "done" && result && (
            <div className="space-y-2 text-sm text-slate-700">
              {result.undo ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">복원을 되돌렸습니다: 사건 {result.cases}건{result.journal ? `, 업무일지 ${result.journal}일` : ""}.{result.skipped ? ` (그 뒤 고친 ${result.skipped}건은 그대로 두었습니다)` : ""}</div>
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                  복원했습니다: 사건 {result.cases}건 — 추가 {result.added}건, 상태 되돌림 {result.status}건{result.created ? `, 새로 만든 사건 ${result.created}건` : ""}{result.journal ? `, 업무일지 ${result.journal}일` : ""}.
                  {result.failed > 0 && <div className="text-red-700 mt-1">저장하지 못한 사건 {result.failed}건이 있습니다. 상단 안내를 확인한 뒤 다시 시도해 주세요.</div>}
                </div>
              )}
              {result.backupUrl && (
                <div className="text-xs text-slate-500">
                  복원 전 데이터는 <a className="text-indigo-600 underline" href={result.backupUrl} target="_blank" rel="noopener noreferrer">백업 파일</a>에 저장해 두었습니다. 복원한 항목에는 '복원' 표시가 붙으며, 이 창의 '이 복원 되돌리기'로 걷어낼 수 있습니다.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-4 sm:px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
          <div className="text-[11px] text-slate-400 flex-1 min-w-0">
            {step === "preview" && blockedGroups.length > 0 && <span className="text-amber-700">같은 이름 사건 묶음 {blockedGroups.length}곳은 넣을 사건을 골라야 복원됩니다. </span>}
            {(step === "preview" || step === "applying") && "복원 전에 지금 데이터를 '사건관리 복원 전 백업' 파일로 먼저 저장합니다."}
          </div>
          <div className="flex gap-2">
            {step === "preview" && <button className="btn-ghost text-sm" onClick={() => { setStep("input"); setBundle(null); }}>다시 고르기</button>}
            {(step === "preview" || step === "applying") && (
              <button className="btn-primary text-sm" disabled={step === "applying" || selectedCount === 0} onClick={apply}>
                {step === "applying" ? "백업 후 복원하는 중…" : `선택한 ${selectedCount}건 복원`}
              </button>
            )}
            {step === "done" && <button className="btn-primary text-sm" onClick={onClose}>닫기</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
