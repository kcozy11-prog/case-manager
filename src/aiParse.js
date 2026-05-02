const GEMINI_DEFAULT = {
  value: "gemini",
  label: "Gemini",
  apiKeyLabel: "Gemini API 키",
  defaultModel: "gemini-2.5-flash",
  helpUrl: "https://aistudio.google.com/apikey",
};

export const AI_PARSE_PROVIDERS = [GEMINI_DEFAULT];
export const AI_PARSE_STORAGE = "caseManager_geminiKey";

export function normalizeTextForCaseMatching(s = "") {
  return String(s).replace(/[\s()㈜㈔·\-_.,'"#:]/g, "");
}

export function findMatchingCase(identifiers, cases) {
  if (!identifiers?.length || !cases?.length) return null;

  for (const c of cases) {
    if (!c.caseNumber || c.caseNumber === "—") continue;
    const cn = normalizeTextForCaseMatching(c.caseNumber);
    for (const id of identifiers) {
      const ci = normalizeTextForCaseMatching(id);
      if (ci.length >= 4 && (cn.includes(ci) || ci.includes(cn))) return c;
    }
  }

  for (const c of cases) {
    const terms = [c.title, c.client, c.opponent].filter(Boolean);
    for (const id of identifiers) {
      const ci = normalizeTextForCaseMatching(id);
      if (ci.length < 3) continue;
      for (const term of terms) {
        const ct = normalizeTextForCaseMatching(term);
        if (ct.length < 3) continue;
        for (let i = 0; i <= ci.length - 3; i++) {
          if (ct.includes(ci.substring(i, i + 3))) return c;
        }
      }
    }
  }

  return null;
}

export function buildAiParsePrompt(text) {
  return `다음 텍스트를 분석하여 법률 사건 관련 정보를 추출해 주세요.
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
- memoContent: 메모 형식으로 요점만 간결하게 정리 (불필요한 인사말, 수식어 제거. 핵심 사실만 "• " 글머리 기호로 나열. 예: "• 변론기일 2026.4.15. 14:00 지정\n• 장소: 서울중앙지법 301호\n• 준비서면 기한: 2026.4.8.")
- hearingDate: 기일 날짜 YYYY-MM-DD (기일 관련 정보가 있을 때만, 없으면 null)
- hearingTime: 기일 시간 HH:MM (시간 정보가 있을 때만, 없으면 null)
- hearingType: 기일 종류 (변론기일/공판기일/조사기일 등, 없으면 null)
- timelineContent: 진행 경과로 기록할 내용 한 줄 요약 (없으면 null)

텍스트:
${text}`;
}

export function normalizeAiProviderConfig(config = {}) {
  const source = typeof config === "string" ? { apiKey: config } : config;
  const model = String(source.model || GEMINI_DEFAULT.defaultModel).trim() || GEMINI_DEFAULT.defaultModel;
  return {
    provider: "gemini",
    apiKey: String(source.apiKey || "").trim(),
    model,
  };
}

export function getAiProviderMeta() {
  return GEMINI_DEFAULT;
}

export function buildAiParseRequest(config, prompt) {
  const normalized = normalizeAiProviderConfig(config);
  if (!normalized.apiKey) throw new Error("Gemini API 키를 입력해주세요.");

  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(normalized.model)}:generateContent?key=${encodeURIComponent(normalized.apiKey)}`,
    options: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    },
  };
}

export function extractAiResponseText(_provider, data) {
  const payload = data === undefined ? _provider : data;
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  return parts.map(part => part?.text || "").join("").trim();
}

export function extractJsonObject(raw) {
  const cleaned = String(raw || "").replace(/```json|```/g, "").trim();
  if (!cleaned) throw new Error("AI 응답이 비어 있습니다.");

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("AI 응답을 JSON으로 파싱할 수 없습니다.");
  }
}
