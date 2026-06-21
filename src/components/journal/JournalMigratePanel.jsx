import { useState } from "react";
import { migrateJournal, importFromLocalStorage } from "../../journalMigrate";

export default function JournalMigratePanel({ user, existing = {} }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const localCount = Object.keys(importFromLocalStorage()).length;

  const run = async (includeRealtimeDb) => {
    if (!user) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const r = await migrateJournal(user.uid, { includeRealtimeDb, existing });
      setResult(r);
    } catch (e) {
      setError(e.message || "가져오기 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-8 py-6">
      <h2 className="text-lg font-bold text-slate-800 mb-2">데이터 가져오기</h2>
      <p className="text-sm text-slate-500 leading-relaxed mb-5">
        기존 업무일지(law-journal) 데이터를 통합앱으로 가져옵니다. 같은 _저장시각_ 기준으로
        병합되므로 여러 번 실행해도 안전합니다.
      </p>

      <div className="bg-white rounded-xl border border-slate-100 p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-semibold text-slate-700">① 이 브라우저(localStorage)</div>
            <div className="text-xs text-slate-400 mt-0.5">
              law-journal 을 쓰던 브라우저라면 가장 간단합니다. 감지된 일지: <b>{localCount}</b>건
            </div>
          </div>
          <button onClick={() => run(false)} disabled={busy}
            className="btn-primary text-sm whitespace-nowrap disabled:opacity-50">
            {busy ? "가져오는 중…" : "가져오기"}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="pr-4">
            <div className="text-sm font-semibold text-slate-700">② 이전 클라우드(law-jounal Realtime DB)</div>
            <div className="text-xs text-slate-400 mt-0.5">
              다른 기기에서 쓰던 기록까지 가져오려면 선택. 기존 law-journal 구글 계정으로
              한 번 더 로그인 창이 뜹니다.
            </div>
          </div>
          <button onClick={() => run(true)} disabled={busy}
            className="btn-ghost text-sm whitespace-nowrap disabled:opacity-50">
            클라우드 포함
          </button>
        </div>
      </div>

      {result && (
        <div className="mt-4 text-sm bg-emerald-50 text-emerald-700 rounded-lg px-4 py-3">
          ✓ 가져오기 완료 — 신규/갱신 {result.written}건 (localStorage {result.localCount}건
          {result.rtdbCount ? `, 클라우드 ${result.rtdbCount}건` : ""}) · 현재 총 {result.total}건
        </div>
      )}
      {error && (
        <div className="mt-4 text-sm bg-red-50 text-red-600 rounded-lg px-4 py-3">⚠ {error}</div>
      )}
    </div>
  );
}
