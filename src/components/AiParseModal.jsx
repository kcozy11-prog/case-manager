import { useState } from "react";
import { MEMO_CAT_STYLE } from "../utils";
import {
  AI_PARSE_PROVIDERS,
  AI_PARSE_STORAGE,
  buildAiParsePrompt,
  buildAiParseRequest,
  extractAiResponseText,
  extractJsonObject,
  findMatchingCase,
  getAiProviderMeta,
  normalizeAiProviderConfig,
} from "../aiParse";

function loadSavedConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(AI_PARSE_STORAGE) || "{}");
    return normalizeAiProviderConfig(saved);
  } catch {
    return normalizeAiProviderConfig();
  }
}

function saveConfig(config) {
  const normalized = normalizeAiProviderConfig(config);
  if (normalized.apiKey) {
    localStorage.setItem(AI_PARSE_STORAGE, JSON.stringify(normalized));
  } else {
    localStorage.removeItem(AI_PARSE_STORAGE);
  }
  return normalized;
}

// ── AI 파싱 모달 ──────────────────────────────────────────────────────────────
export default function AiParseModal({ cases, onClose, onApply }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [matchedCase, setMatchedCase] = useState(null);
  const [manualCaseId, setManualCaseId] = useState("");
  const [error, setError] = useState("");
  const [config, setConfig] = useState(loadSavedConfig);
  const [showKeyInput, setShowKeyInput] = useState(!config.apiKey);

  const providerMeta = getAiProviderMeta(config.provider);

  const updateConfig = (next) => {
    const normalized = saveConfig({ ...config, ...next });
    setConfig(normalized);
  };

  const changeProvider = (provider) => {
    const meta = getAiProviderMeta(provider);
    const normalized = saveConfig({ provider, model: meta.defaultModel, apiKey: "" });
    setConfig(normalized);
    setShowKeyInput(true);
  };

  const parse = async () => {
    if (!text.trim()) return;

    const normalized = normalizeAiProviderConfig(config);
    if (!normalized.apiKey) {
      setError(`${providerMeta.apiKeyLabel}를 입력해주세요.`);
      setShowKeyInput(true);
      return;
    }

    setLoading(true);
    setResult(null);
    setError("");
    setMatchedCase(null);
    setManualCaseId("");

    try {
      const prompt = buildAiParsePrompt(text);
      const { url, options } = buildAiParseRequest(normalized, prompt);
      const res = await fetch(url, options);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message = data.error?.message || data.error || data.message || "알 수 없는 오류";
        if (res.status === 400 || res.status === 401 || res.status === 403) {
          setError(`API 키 또는 모델 설정을 확인해주세요. (${message})`);
          setShowKeyInput(true);
        } else {
          setError(`AI API 오류 (${res.status}): ${message}`);
        }
        return;
      }

      const raw = extractAiResponseText(normalized.provider, data);
      const parsed = extractJsonObject(raw);
      setResult(parsed);
      saveConfig(normalized);

      const found = findMatchingCase(parsed.caseIdentifiers, cases);
      if (found) {
        setMatchedCase(found);
        setManualCaseId(found.id);
      }
    } catch (e) {
      setError(e.message || "AI 파싱 중 오류가 발생했습니다.");
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
          {/* AI 설정 */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <button onClick={() => setShowKeyInput(p => !p)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs text-slate-500 hover:bg-slate-50">
              <span>🔑 {providerMeta.label} {config.apiKey ? "✓ 설정됨" : "⚠ 미설정"}</span>
              <span>{showKeyInput ? "▲" : "▼"}</span>
            </button>
            {showKeyInput && (
              <div className="px-3 pb-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[11px] text-slate-500 space-y-1">
                    <span>AI 제공자</span>
                    <select className="input-sm" value={config.provider} onChange={e => changeProvider(e.target.value)}>
                      {AI_PARSE_PROVIDERS.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[11px] text-slate-500 space-y-1">
                    <span>모델</span>
                    <input
                      className="input-sm"
                      value={config.model}
                      onChange={e => updateConfig({ model: e.target.value })}
                      placeholder={providerMeta.defaultModel}
                    />
                  </label>
                </div>
                <input
                  className="w-full border border-slate-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  type="password"
                  placeholder={providerMeta.apiKeyLabel}
                  value={config.apiKey}
                  onChange={e => updateConfig({ apiKey: e.target.value })}
                />
                <div className="text-[11px] text-slate-400 flex justify-between gap-3">
                  <span>키는 이 브라우저에만 저장됩니다.</span>
                  <a href={providerMeta.helpUrl} target="_blank" rel="noopener"
                    className="text-indigo-500 hover:underline flex-shrink-0">API 키 발급</a>
                </div>
              </div>
            )}
          </div>

          <textarea
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
            rows={5} placeholder={"카카오톡 대화, 법원 알림, 엘박스 메시지 등을 붙여넣으세요...\n\n예) \"아파트 분양대금 반환 청구 사건 변론기일이 2026.4.15. 14:00 서울중앙지방법원 301호에서 진행됩니다\""}
            value={text} onChange={e => setText(e.target.value)}
          />

          {error && <div className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded">{error}</div>}

          {result && (
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-3">
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
                  <div className="text-xs text-amber-600 mt-1">사건을 선택하지 않으면 새 사건 등록 폼으로 열립니다</div>
                )}
              </div>

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

              {(result.hearingDate || result.timelineContent) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {result.hearingDate && (
                    <div className="bg-white border border-slate-200 rounded-lg p-2">
                      <div className="text-slate-400 mb-0.5">기일</div>
                      <div className="text-slate-700 font-medium">{result.hearingDate} {result.hearingTime || ""}</div>
                      <div className="text-slate-500">{result.hearingType || "기일"}</div>
                    </div>
                  )}
                  {result.timelineContent && (
                    <div className="bg-white border border-slate-200 rounded-lg p-2">
                      <div className="text-slate-400 mb-0.5">진행 경과</div>
                      <div className="text-slate-700">{result.timelineContent}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between gap-2 pt-1">
            <button className="btn-ghost" onClick={onClose}>취소</button>
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={parse} disabled={loading || !text.trim()}>
                {loading ? "분석 중…" : "AI 분석"}
              </button>
              <button className="btn-primary" onClick={apply} disabled={!result}>
                저장 적용
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
