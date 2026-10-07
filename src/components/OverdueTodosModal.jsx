import { useEffect, useMemo, useState } from "react";
import { collectOverdueTodos } from "../overdueCleanup";
import { fmtDate } from "../utils";

// 기한 지난 미완료 할 일 일괄 삭제: 목록을 확인하고 고른 것만 지운다. 지운 할 일은 이 창에서 되돌릴 수 있다.
function fmtAt(iso) {
  try { return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }); } catch { return iso; }
}

function fmtToday(d) {
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

// 할 일 한 줄 (모듈 최상위 컴포넌트: 부모가 다시 그려져도 줄이 새로 만들어지지 않게)
function TodoLine({ item, checked, disabled, onToggle }) {
  const t = item.todo;
  const text = String(t.text || "(내용 없음)");
  return (
    <label className="flex items-start gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer">
      <input type="checkbox" className="mt-0.5 flex-shrink-0" checked={checked} disabled={disabled} onChange={() => onToggle(item.key)} />
      <div className="min-w-0 flex-1">
        <div className="text-xs text-slate-700 break-words" title={text}>{text.length > 140 ? `${text.slice(0, 140)}…` : text}</div>
        <div className="text-[11px] mt-0.5 flex gap-x-2 gap-y-0.5 flex-wrap">
          <span className="text-rose-600">기한 {fmtDate(t.dueDate)}{item.days ? ` · ${item.days}일 지남` : ""}</span>
          {t.priority === "높음" && <span className="text-red-500 font-semibold">높음</span>}
          {item.google && <span className="text-slate-500">Google 할 일</span>}
          {t.googleEventId && <span className="text-slate-500">캘린더 일정 있음</span>}
        </div>
        {t.details && <div className="text-[11px] text-slate-400 truncate" title={t.details}>{t.details}</div>}
      </div>
    </label>
  );
}

export default function OverdueTodosModal({ cases, standaloneTodos, ready, onDelete, loadLastCleanup, onUndo, onClose }) {
  const [today] = useState(() => new Date());
  const groups = useMemo(() => collectOverdueTodos(cases, standaloneTodos, today), [cases, standaloneTodos, today]);
  const allItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const [selected, setSelected] = useState(() => new Set(allItems.map((i) => i.key)));
  const [initialized, setInitialized] = useState(allItems.length > 0);
  const [collapsed, setCollapsed] = useState(new Set());
  const [step, setStep] = useState("select"); // select | deleting | done | undoing
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [last, setLast] = useState(null);

  // 처음 목록이 나타날 때 모두 고른 상태로 시작한다 (서버 데이터가 늦게 도착한 경우)
  useEffect(() => {
    if (initialized || allItems.length === 0) return;
    setSelected(new Set(allItems.map((i) => i.key)));
    setInitialized(true);
  }, [initialized, allItems]);

  useEffect(() => {
    let alive = true;
    loadLastCleanup?.().then((r) => { if (alive) setLast(r); }).catch(() => {});
    return () => { alive = false; };
  }, [loadLastCleanup]);

  const picked = allItems.filter((i) => selected.has(i.key));
  const pickedGoogle = picked.filter((i) => i.google).length;
  const pickedCalendar = picked.filter((i) => i.todo.googleEventId).length;
  const busy = step === "deleting" || step === "undoing";
  const counts = groups.reduce((acc, g) => {
    const k = g.standalone ? "standalone" : g.closed ? "closed" : "active";
    acc[k] += g.items.length;
    return acc;
  }, { active: 0, standalone: 0, closed: 0 });

  const toggle = (key) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const setGroup = (items, on) => setSelected((prev) => {
    const next = new Set(prev);
    items.forEach((i) => { if (on) next.add(i.key); else next.delete(i.key); });
    return next;
  });
  const toggleCollapse = (caseId) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(caseId)) next.delete(caseId); else next.add(caseId);
    return next;
  });

  const remove = async () => {
    if (!picked.length) return;
    if (!window.confirm(`선택한 할 일 ${picked.length}건을 삭제할까요?\n삭제한 뒤에도 이 창의 '되돌리기'로 되살릴 수 있습니다.`)) return;
    setStep("deleting");
    setError("");
    try {
      const r = await onDelete(picked.map((i) => ({ caseId: i.caseId, todo: i.todo })));
      setResult(r);
      setStep("done");
      loadLastCleanup?.().then(setLast).catch(() => {});
    } catch (e) {
      setError(e.message || String(e));
      setStep("select");
    }
  };

  const undo = async () => {
    if (!last) return;
    if (!window.confirm(`${fmtAt(last.at)}에 삭제한 할 일 ${last.count}건을 되살릴까요?`)) return;
    const back = step;
    setStep("undoing");
    setError("");
    try {
      const r = await onUndo();
      setResult(r ? { undo: true, ...r } : { undo: true, restored: 0, cases: 0 });
      setStep("done");
      setLast(null);
      loadLastCleanup?.().then(setLast).catch(() => {});
    } catch (e) {
      setError(e.message || String(e));
      setStep(back === "done" ? "done" : "select");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-2 sm:p-4" onClick={busy ? undefined : onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[92vh]" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between rounded-t-2xl" style={{ background: "#1E293B" }}>
          <div>
            <div className="text-white font-semibold">기한 지난 할 일 삭제</div>
            <div className="text-slate-400 text-xs mt-0.5">기한이 오늘({fmtToday(today)})보다 앞서고 아직 완료하지 않은 할 일입니다.</div>
          </div>
          {!busy && <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>}
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 break-words">{error}</div>}

          {step === "done" && result && (
            <div className="space-y-2 text-sm text-slate-700">
              {result.undo ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                  할 일 {result.restored}건을 되살렸습니다.
                  {result.present > 0 && <div className="text-xs text-slate-600 mt-1">이미 있던 {result.present}건은 다시 넣지 않았습니다.</div>}
                  {result.missing > 0 && <div className="text-xs text-amber-700 mt-1">사건이 없어져 되살리지 못한 할 일이 {result.missing}건 있습니다.</div>}
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                  할 일 {result.deleted}건을 삭제했습니다.
                  {result.skipped > 0 && <div className="text-xs text-slate-600 mt-1">목록을 연 뒤 완료하거나 고친 {result.skipped}건은 지우지 않았습니다.</div>}
                  {result.google > 0 && <div className="text-xs text-slate-600 mt-1">Google 할 일에서 가져온 {result.google}건은 다음 동기화 때 다시 가져오지 않습니다. Google 할 일 목록에서는 직접 정리해 주세요.</div>}
                </div>
              )}
              {result.pending && <div className="text-xs text-amber-700">서버 연결이 느려 저장을 이어서 진행하고 있습니다. 상단 안내가 사라질 때까지 이 앱을 닫지 마세요.</div>}
              {result.failed > 0 && <div className="text-xs text-red-700">저장하지 못한 곳이 {result.failed}곳 있습니다. 상단 안내를 확인한 뒤 다시 시도해 주세요.</div>}
              {!result.undo && last && (
                <div className="text-xs text-slate-500">잘못 지웠다면 아래 '되돌리기'로 이번에 지운 할 일을 모두 되살릴 수 있습니다.</div>
              )}
            </div>
          )}

          {(step === "select" || step === "deleting" || (step === "undoing" && !result)) && (
            <>
              {!ready && <div className="text-sm text-slate-500">서버 데이터를 확인하는 중입니다. 잠시 뒤 목록이 나타납니다.</div>}
              {ready && allItems.length === 0 && (
                <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-3">기한 지난 미완료 할 일이 없습니다.</div>
              )}
              {ready && allItems.length > 0 && (
                <>
                  <div className="text-xs text-slate-500">
                    전체 {allItems.length}건 (진행 중 사건 {counts.active}건 · 일반 할 일 {counts.standalone}건 · 종결 사건 {counts.closed}건) · <b className="text-slate-700 whitespace-nowrap">선택 {picked.length}건</b>
                  </div>
                  <div className="flex gap-2 flex-wrap text-xs">
                    <button className="btn-ghost text-xs py-1 px-2" disabled={busy} onClick={() => setSelected(new Set(allItems.map((i) => i.key)))}>모두 선택</button>
                    <button className="btn-ghost text-xs py-1 px-2" disabled={busy} onClick={() => setSelected(new Set())}>모두 해제</button>
                    <button className="btn-ghost text-xs py-1 px-2" onClick={() => setCollapsed(new Set())}>모두 펼치기</button>
                    <button className="btn-ghost text-xs py-1 px-2" onClick={() => setCollapsed(new Set(groups.map((g) => g.caseId)))}>모두 접기</button>
                  </div>
                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                    {groups.map((g) => {
                      const on = g.items.filter((i) => selected.has(i.key)).length;
                      const open = !collapsed.has(g.caseId);
                      return (
                        <div key={g.caseId}>
                          <div className="flex items-center gap-2 px-3 py-2 bg-slate-50/60">
                            <input type="checkbox" disabled={busy} checked={on === g.items.length}
                              ref={(el) => { if (el) el.indeterminate = on > 0 && on < g.items.length; }}
                              onChange={(e) => setGroup(g.items, e.target.checked)} />
                            <button className="flex-1 min-w-0 text-left text-sm font-medium text-slate-700 truncate" onClick={() => toggleCollapse(g.caseId)}>
                              {open ? "▾" : "▸"} {g.caseTitle}
                              {g.closed && <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded border border-slate-200 text-slate-500 font-normal">종결</span>}
                            </button>
                            <span className="text-[11px] text-slate-400 flex-shrink-0">{on}/{g.items.length}</span>
                          </div>
                          {open && g.items.map((item) => <TodoLine key={item.key} item={item} checked={selected.has(item.key)} disabled={busy} onToggle={toggle} />)}
                        </div>
                      );
                    })}
                  </div>
                  <ol className="text-[11px] text-slate-500 space-y-0.5">
                    <li>(1) 지운 할 일은 이 창의 '되돌리기'로 되살릴 수 있습니다.</li>
                    {pickedGoogle > 0 && (
                      <li>(2) 고른 항목 중 Google 할 일에서 가져온 {pickedGoogle}건은 Google 할 일 목록에는 그대로 남습니다(이 앱은 Google 할 일을 읽기만 합니다). 앱으로는 다시 가져오지 않으며, Google 쪽에서 기한을 바꾸면 다시 가져옵니다.</li>
                    )}
                    {pickedCalendar > 0 && (
                      <li>({pickedGoogle > 0 ? 3 : 2}) 캘린더로 보낸 일정 {pickedCalendar}건은 캘린더에 그대로 남습니다.</li>
                    )}
                  </ol>
                </>
              )}
            </>
          )}

          {last && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600 flex items-center gap-2 flex-wrap">
              <span className="flex-1 min-w-0">마지막 삭제: {fmtAt(last.at)} · 할 일 {last.count}건</span>
              <button className="btn-ghost text-xs py-1 px-2" disabled={busy} onClick={undo}>{step === "undoing" ? "되살리는 중…" : "되돌리기"}</button>
            </div>
          )}
        </div>

        <div className="px-4 sm:px-5 py-3 border-t border-slate-100 flex items-center justify-end gap-2 flex-wrap">
          {step === "done" ? (
            <button className="btn-primary text-sm" onClick={onClose}>닫기</button>
          ) : (
            <>
              <button className="btn-ghost text-sm" disabled={busy} onClick={onClose}>취소</button>
              <button
                className="text-sm font-semibold rounded-lg px-3.5 py-[7px] bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={busy || !ready || picked.length === 0}
                onClick={remove}>
                {step === "deleting" ? "삭제하는 중…" : `선택한 ${picked.length}건 삭제`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
