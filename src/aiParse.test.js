import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAiParseRequest,
  extractJsonObject,
  findMatchingCase,
  normalizeAiProviderConfig,
} from "./aiParse.js";

test("OpenAI provider builds a non-Gemini chat-completions request", () => {
  const config = normalizeAiProviderConfig({
    provider: "openai",
    apiKey: "sk-test",
    model: "gpt-4o-mini",
  });

  const request = buildAiParseRequest(config, "프롬프트");

  assert.equal(request.url, "https://api.openai.com/v1/chat/completions");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.Authorization, "Bearer sk-test");
  assert.equal(request.options.headers["Content-Type"], "application/json");
  assert.doesNotMatch(request.url, /gemini|generativelanguage/i);

  const body = JSON.parse(request.options.body);
  assert.equal(body.model, "gpt-4o-mini");
  assert.deepEqual(body.messages, [{ role: "user", content: "프롬프트" }]);
});

test("Anthropic provider builds a non-Gemini messages request", () => {
  const config = normalizeAiProviderConfig({
    provider: "anthropic",
    apiKey: "sk-ant-test",
    model: "claude-3-5-haiku-latest",
  });

  const request = buildAiParseRequest(config, "프롬프트");

  assert.equal(request.url, "https://api.anthropic.com/v1/messages");
  assert.equal(request.options.headers["x-api-key"], "sk-ant-test");
  assert.equal(request.options.headers["anthropic-version"], "2023-06-01");
  assert.equal(request.options.headers["anthropic-dangerous-direct-browser-access"], "true");
  assert.doesNotMatch(request.url, /gemini|generativelanguage/i);

  const body = JSON.parse(request.options.body);
  assert.equal(body.model, "claude-3-5-haiku-latest");
  assert.deepEqual(body.messages, [{ role: "user", content: "프롬프트" }]);
});

test("OpenRouter preset uses OpenAI-compatible schema without Gemini", () => {
  const config = normalizeAiProviderConfig({
    provider: "openrouter",
    apiKey: "or-test",
    model: "anthropic/claude-3.5-haiku",
  });

  const request = buildAiParseRequest(config, "프롬프트");

  assert.equal(request.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(request.options.headers.Authorization, "Bearer or-test");
  assert.doesNotMatch(request.url, /gemini|generativelanguage/i);
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
