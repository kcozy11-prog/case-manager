import { useState } from "react";
import { MEMO_CAT_STYLE } from "../utils";

// ── 3글자 이상 매칭으로 사건 자동 탐색 ────────────────────────────────────────
const normalize = (s) => s.replace(/[\s()㈜㈔·\-_.,'"#:]/g, "");

function findMatchingCase(identifiers, cases) {
  if (!identifiers?.length || !cases.length) return null;

  // 1차: 사건번호 정확 매칭
  for (const c of cases) {
    if (!c.caseNumber || c.caseNumber === "—") continue;
    const cn = normalize(c.caseNumber);
    for (const id of identifiers) {
      const ci = normalize(id);
      if (ci.length >= 4 && (cn.includes(ci) || ci.includes(cn))) return c;
    }
  }

  // 2차: 제목/의뢰인/상대방 3글자 이상 매칭
  for (const c of cases) {
    const terms = [c.title, c.client, c.opponent].filter(Boolean);
    for (const id of identifiers) {
      const ci = normalize(id);
      if (ci.length < 3) continue;
      for (const term of terms) {
        const ct = normalize(term);
        if (ct.length < 3) continue;
        for (let i = 0; i <= ci.length - 3; i++) {
          if (ct.includes(ci.substring(i, i + 3))) return c;
        }
      }
    }
  }
  return null;
}

// ── AI 파싱 모달 ──────────────────────────────────────────────────────────────
export default function AiParseModal({ cases, onClose, onApply }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [matchedCase, setMatchedCase] = useState(null);
  const [manualCaseId, setManualCaseId] = useState("");
  const [error, setError] = useState("");

  const parse = async () => {
    if (!text.trim()) return;
    setLoading(true); setResult(null); setError(""); setMatchedCase(null); setManualCaseId("");
    try {
      const prompt = `다음 텍스트를 분석하여 법률 사건 관련 정보를 추출해 주세요.
이 텍스트는 카카오톡 메시지, 법원 알림, 엘박스 알림, 문자 메시지 등에서 복사한 것입니다.
JSON 형식으로만 응답하고, 다른 텍스트는 포함하지 마세요.

추출 항목:
- caseIdentifiers: 사건을 특정할 수 있는 키워드 배열 (사건명 키워드, 당사자 이름, 사건번호 등에서 추출. 예: ["김민준", "2026가합12345", "분양대금"])
- memoCategory: 메모 카테고리 (아래 중 택1)
  - "기일메모": 기일 지정, 변경, 결과 관련
  - "공식결과메모": 서면 제출, 결정문, 판결, 송달, 공식 절차 진행 관련
  - "의뢰인요청": 의뢰인 연락, 요청, 보고 관련
  - "일반메모": 상대방 연락, 기타 업무 등 그 외
- memoTitle: 메모 제목 (15자 이내, 핵심 요약. 예: "변론기일 지정", "피고 준비서면 제출", "합의 의사 전달")
- memoContent: 원문 핵심 내용 정리 (날짜, 장소, 인물, 내용 포함)
- hearingDate: 기일 날짜 YYYY-MM-DD (기일 관련 정보가 있을 때만, 없으면 null)
- hearingType: 기일 종류 (변론기일/공판기일/조사기일 등, 없으면 null)
- timelineContent: 진행 경과로 기록할 내용 한 줄 요약 (없으면 null)

텍스트:
${text}`;

      const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY;
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        }
      );
      const data = await res.json();
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const cleaned = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      setResult(parsed);

      // 자동 매칭
      const found = findMatchingCase(parsed.caseIdentifiers, cases);
      if (found) {
        setMatchedCase(found);
        setManualCaseId(found.id);
      }
    } catch (e) {
      setError("파싱 중 오류가 발생했습니다: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const effectiveCase = manualCaseId
    ? cases.find(c => c.id === manualCaseId)
    : matchedCase;

  const apply = () => {
    if (!result) return;
    onApply(result, effectiveCase);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between" style={{ background: "#1E293B" }}>
          <div>
            <div className="text-white font-semibold">AI 파싱</div>
            <div className="text-slate-400 text-xs">카카오톡 · 법원알림 · 엘박스 붙여넣기 → 자동 메모 저장</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
        </div>
        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          <textarea
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
            rows={5} placeholder={"카카오톡 대화, 법원 알림, 엘박스 메시지 등을 붙여넣으세요...\n\n예) \"아파트 분양대금 반환 청구 사건 변론기일이 2026.4.15. 14:00 서울중앙지방법원 301호에서 진행됩니다\""}
            value={text} onChange={e => setText(e.target.value)}
          />
          {error && <div className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded">{error}</div>}

          {result && (
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-3">
              {/* 매칭 사건 선택 */}
              <div>
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">대상 사건</div>
                <select className="input-sm w-full" value={manualCaseId}
                  onChange={e => setManualCaseId(e.target.value)}>
                  <option value="">— 사건 선택 —</option>
                  {cases.filter(c => c.status === "진행중").map(c => (
                    <option key={c.id} value={c.id}>{c.title} ({c.client})</option>
                  ))}
                  {cases.filter(c => c.status !== "진행중").map(c => (
                    <option key={c.id} value={c.id}>[종결] {c.title} ({c.client})</option>
                  ))}
                </select>
                {effectiveCase ? (
                  <div className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                    <span>✓</span> <strong>{effectiveCase.title}</strong> ({effectiveCase.client})에 저장됩니다
                  </div>
                ) : (
                  <div className="text-xs text-amber-600 mt-1">사건을 선택해주세요</div>
                )}
              </div>

              {/* 메모 미리보기 */}
              <div>
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">저장될 메모</div>
                <div className="bg-white rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded border ${MEMO_CAT_STYLE[result.memoCategory] || MEMO_CAT_STYLE["일반메모"]}`}>
                      {result.memoCategory || "일반메모"}
                    </span>
                    <span className="text-sm font-semibold text-slate-700">{result.memoTitle || "메모"}</span>
                  </div>
                  <div className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{result.memoContent || text}</div>
                </div>
              </div>

              {/* 기일/경과 추가 정보 */}
              {(result.hearingDate || result.timelineContent) && (
                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">함께 추가</div>
                  <div className="space-y-1">
                    {result.hearingDate && (
                      <div className="text-xs text-slate-600 bg-white rounded-lg px-3 py-2 border border-slate-100 flex items-center gap-2">
                        <span className="text-indigo-400">📅</span>
                        <span>기일 추가: <strong>{result.hearingDate}</strong> {result.hearingType || ""}</span>
                      </div>
                    )}
                    {result.timelineContent && (
                      <div className="text-xs text-slate-600 bg-white rounded-lg px-3 py-2 border border-slate-100 flex items-center gap-2">
                        <span className="text-indigo-400">📋</span>
                        <span>진행경과: {result.timelineContent}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* AI 추출 키워드 (디버그용, 접기) */}
              {result.caseIdentifiers?.length > 0 && (
                <div className="text-xs text-slate-400">
                  매칭 키워드: {result.caseIdentifiers.join(", ")}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <button onClick={onClose} className="btn-ghost">취소</button>
            {!result ? (
              <button onClick={parse} disabled={loading || !text.trim()} className="btn-primary">
                {loading ? "분석 중…" : "파싱하기"}
              </button>
            ) : (
              <>
                <button onClick={() => { setResult(null); setMatchedCase(null); setManualCaseId(""); }}
                  className="btn-ghost text-xs">다시 입력</button>
                <button onClick={apply} disabled={!effectiveCase} className="btn-primary">
                  메모 저장
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
