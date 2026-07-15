import type { ResolvedUserSettings as UserSettings } from "../../services/domain";

export function createMockUserSettings(
  overrides: Partial<UserSettings> = {},
): UserSettings {
  return {
    llm_providers:
      overrides.llm_providers ??
      [
        {
          id: "provider-openai",
          name: "OpenAI",
          base_url: "https://api.openai.com/v1",
          api_key: "test-api-key",
          model: "gpt-4o",
          is_active: true,
        },
      ],
    default_download_path: overrides.default_download_path ?? null,
    faster_whisper_cli_path:
      overrides.faster_whisper_cli_path ?? "C:/tools/faster-whisper-cli.exe",
    language: overrides.language ?? "zh",
    auto_execute_flow: overrides.auto_execute_flow ?? false,
    auto_trim_silence: overrides.auto_trim_silence ?? false,
    smart_split_text_limit: overrides.smart_split_text_limit ?? 18,
    ui_state: overrides.ui_state ?? {},
  };
}
