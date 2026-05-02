import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_PARSE_STORAGE,
  buildAiParsePrompt,
  buildAiParseRequest,
  extractAiResponseText,
  extractJsonObject,
  findMatchingCase,
  normalizeAiProviderConfig,
} from "./aiParse.js";

test("Gemini is the restored default parser provider using the legacy key storage", () => {
  const config = normalizeAiProviderConfig({ apiKey: "  AIza-test  " });

  assert.deepEqual(config, {
    provider: "gemini",
    apiKey: "AIza-test",
    model: "gemini-2.5-flash",
  });
  assert.equal(AI_PARSE_STORAGE, "caseManager_geminiKey");
});

test("Gemini request uses the Generative Language generateContent endpoint", () => {
  const request = buildAiParseRequest({ apiKey: "AIza test/key", model: "gemini-2.5-flash" }, "프롬프트");

  assert.equal(
    request.url,
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=AIza%20test%2Fkey",
  );
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers["Content-Type"], "application/json");

  const body = JSON.parse(request.options.body);
  assert.deepEqual(body.contents, [{ parts: [{ text: "프롬프트" }] }]);
  assert.equal(body.generationConfig.temperature, 0.1);
  assert.equal(body.generationConfig.responseMimeType, "application/json");
});

test("extractAiResponseText reads Gemini candidate text parts", () => {
  const data = {
    candidates: [
      { content: { parts: [{ text: "{\"memoTitle\":" }, { text: "\"기일 지정\"}" }] } },
    ],
  };

  assert.equal(extractAiResponseText("gemini", data), '{"memoTitle":"기일 지정"}');
});

test("buildAiParsePrompt keeps the legal extraction schema", () => {
  const prompt = buildAiParsePrompt("변론기일 2026.5.10. 10:30");

  assert.match(prompt, /caseIdentifiers/);
  assert.match(prompt, /memoCategory/);
  assert.match(prompt, /hearingDate/);
  assert.match(prompt, /변론기일 2026\.5\.10\. 10:30/);
});

test("extractJsonObject handles fenced model output", () => {
  const parsed = extractJsonObject('```json\n{"memoTitle":"기일 지정","hearingDate":"2026-05-02"}\n```');

  assert.deepEqual(parsed, {
    memoTitle: "기일 지정",
    hearingDate: "2026-05-02",
  });
});

test("findMatchingCase keeps existing 사건번호 and 당사자 matching behavior", () => {
  const cases = [
    { id: "1", caseNumber: "2026가합12345", title: "분양대금", client: "김민준", opponent: "서울건설" },
    { id: "2", caseNumber: "—", title: "보험설계사 환수금", client: "박서연", opponent: "보험사" },
  ];

  assert.equal(findMatchingCase(["2026가합12345"], cases)?.id, "1");
  assert.equal(findMatchingCase(["보험설계사"], cases)?.id, "2");
});
