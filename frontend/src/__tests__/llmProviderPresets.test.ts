import {
  LLM_PROVIDER_PRESETS,
  detectLlmProviderPreset,
  resolveLlmProviderModel,
} from "../config/llmProviderPresets";

test("llm provider presets match the supported custom platforms", () => {
  expect(LLM_PROVIDER_PRESETS).toEqual([
    {
      key: "deepseek",
      label: "DeepSeek",
      baseUrl: "https://api.deepseek.com/v1",
      defaultModel: "deepseek-chat",
      reasoningModel: "deepseek-reasoner",
    },
    {
      key: "openai",
      label: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      defaultModel: "gpt-4o",
    },
    {
      key: "google-gemini",
      label: "Google Gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
      defaultModel: "gemini-1.5-flash",
    },
    {
      key: "anthropic-claude",
      label: "Anthropic Claude",
      baseUrl: "https://api.anthropic.com/v1",
      defaultModel: "claude-3-5-sonnet-20240620",
    },
    {
      key: "glm",
      label: "GLM",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      defaultModel: "glm-5.1",
    },
    {
      key: "minimax",
      label: "MiniMax",
      baseUrl: "https://api.minimax.io/v1",
      defaultModel: "MiniMax-M2.7",
    },
    {
      key: "siliconflow",
      label: "SiliconFlow",
      baseUrl: "https://api.siliconflow.cn/v1",
      defaultModel: "deepseek-ai/DeepSeek-V3",
    },
    {
      key: "custom-local",
      label: "Custom / Local",
      baseUrl: "",
      defaultModel: "",
    },
  ]);
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
