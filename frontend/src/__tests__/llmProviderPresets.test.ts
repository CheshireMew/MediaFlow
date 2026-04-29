import {
  LLM_PROVIDER_PRESETS,
  detectLlmProviderPreset,
  resolveLlmProviderModel,
} from "../config/llmProviderPresets";

test("llm provider presets match the supported custom platforms", () => {
  expect(LLM_PROVIDER_PRESETS.map((preset) => preset.key)).toEqual([
    "deepseek",
    "openai",
    "google-gemini",
    "anthropic-claude",
    "glm",
    "minimax",
    "siliconflow",
    "custom-local",
  ]);
  for (const preset of LLM_PROVIDER_PRESETS) {
    expect(preset.label).not.toBe("");
    expect("baseUrl" in preset).toBe(true);
    expect("defaultModel" in preset).toBe(true);
  }
});

test("provider detection normalizes trailing slashes", () => {
  expect(
    detectLlmProviderPreset(
      "https://generativelanguage.googleapis.com/v1beta/openai",
    ),
  ).toBe("google-gemini");
  expect(detectLlmProviderPreset("https://open.bigmodel.cn/api/paas/v4/")).toBe(
    "glm",
  );
  expect(detectLlmProviderPreset("https://api.minimax.io/v1")).toBe(
    "minimax",
  );
  expect(detectLlmProviderPreset("https://example.com/v1")).toBe(
    "custom-local",
  );
});

test("deepseek reasoning mode resolves the active model", () => {
  expect(resolveLlmProviderModel("deepseek", false)).toBe("deepseek-chat");
  expect(resolveLlmProviderModel("deepseek", true)).toBe("deepseek-reasoner");
  expect(resolveLlmProviderModel("openai", true)).toBe("gpt-4o");
});
