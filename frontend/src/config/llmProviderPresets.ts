export const LLM_PROVIDER_PRESETS = [
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
] as const;

export type LLMProviderPreset = (typeof LLM_PROVIDER_PRESETS)[number];
export type LLMProviderPresetKey = LLMProviderPreset["key"];

export const DEFAULT_LLM_PROVIDER_PRESET_KEY: LLMProviderPresetKey = "deepseek";
export const CUSTOM_LLM_PROVIDER_PRESET_KEY: LLMProviderPresetKey = "custom-local";

function normalizeBaseUrl(value?: string): string {
  return (value ?? "").trim().replace(/\/+$/, "");
}

export function getLlmProviderPreset(
  key: LLMProviderPresetKey,
): LLMProviderPreset {
  return (
    LLM_PROVIDER_PRESETS.find((preset) => preset.key === key) ??
    LLM_PROVIDER_PRESETS.find(
      (preset) => preset.key === CUSTOM_LLM_PROVIDER_PRESET_KEY,
    )!
  );
}

export function detectLlmProviderPreset(baseUrl?: string): LLMProviderPresetKey {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (!normalizedBaseUrl) return CUSTOM_LLM_PROVIDER_PRESET_KEY;

  const matched = LLM_PROVIDER_PRESETS.find(
    (preset) =>
      preset.key !== CUSTOM_LLM_PROVIDER_PRESET_KEY &&
      normalizeBaseUrl(preset.baseUrl) === normalizedBaseUrl,
  );
  return matched?.key ?? CUSTOM_LLM_PROVIDER_PRESET_KEY;
}

export function supportsReasoningMode(key: LLMProviderPresetKey): boolean {
  return "reasoningModel" in getLlmProviderPreset(key);
}

export function isDeepSeekReasoningModel(model?: string): boolean {
  return (model ?? "").trim() === "deepseek-reasoner";
}

export function resolveLlmProviderModel(
  key: LLMProviderPresetKey,
  reasoningMode: boolean,
): string {
  const preset = getLlmProviderPreset(key);
  if (reasoningMode && "reasoningModel" in preset) {
    return preset.reasoningModel;
  }
  return preset.defaultModel;
}
