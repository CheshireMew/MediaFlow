import type {
  ActiveProviderResponse,
  CudaReadinessResponse,
  FasterWhisperCliInstallResponse,
  ProviderConnectionRequest,
  ProviderConnectionResponse,
  ToolUpdateResponse,
  LLMProvider as WireLLMProvider,
  UserSettings as WireUserSettings,
  UserPreferencesPatch,
  UiStatePatch,
} from "../../types/api";
import { resolveSmartSplitTextLimit } from "../../utils/subtitleSmartSplit";
import { apiClient } from "../../api/client";

export type ResolvedLLMProvider = Omit<WireLLMProvider, "is_active"> & {
  is_active: boolean;
};

export interface ResolvedUserSettings {
  llm_providers: ResolvedLLMProvider[];
  default_download_path: string | null;
  faster_whisper_cli_path: string | null;
  language: string;
  auto_execute_flow: boolean;
  auto_trim_silence: boolean;
  smart_split_text_limit: number;
  ui_state: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function resolveUserSettings(settings: WireUserSettings): ResolvedUserSettings {
  return {
    llm_providers: (settings.llm_providers ?? []).map((provider) => ({
      ...provider,
      is_active: provider.is_active ?? false,
    })),
    default_download_path: settings.default_download_path ?? null,
    faster_whisper_cli_path: settings.faster_whisper_cli_path ?? null,
    language: settings.language ?? "zh",
    auto_execute_flow: settings.auto_execute_flow ?? false,
    auto_trim_silence: settings.auto_trim_silence ?? false,
    smart_split_text_limit: resolveSmartSplitTextLimit(settings),
    ui_state: isRecord(settings.ui_state) ? settings.ui_state : {},
  };
}

export const settingsService = {
  getSettings(): Promise<ResolvedUserSettings> {
    return apiClient.getSettings().then(resolveUserSettings);
  },

  updatePreferences(patch: UserPreferencesPatch): Promise<ResolvedUserSettings> {
    return apiClient.updatePreferences(patch).then(resolveUserSettings);
  },

  patchUiState(
    patch: UiStatePatch,
    options?: { keepalive?: boolean },
  ): Promise<ResolvedUserSettings> {
    return apiClient.patchUiState(patch, options).then(resolveUserSettings);
  },

  setActiveProvider(providerId: string): Promise<ActiveProviderResponse> {
    return apiClient.setActiveProvider(providerId);
  },

  testProviderConnection(
    provider: ProviderConnectionRequest,
  ): Promise<ProviderConnectionResponse> {
    return apiClient.testProviderConnection(provider);
  },

  updateYtDlp(): Promise<ToolUpdateResponse> {
    return apiClient.updateYtDlp();
  },

  installFasterWhisperCli(): Promise<FasterWhisperCliInstallResponse> {
    return apiClient.installFasterWhisperCli();
  },

  getCudaReadiness(): Promise<CudaReadinessResponse> {
    return apiClient.getCudaReadiness();
  },

  async getSmartSplitTextLimit(): Promise<number> {
    const settings = await Promise.resolve(settingsService.getSettings()).catch(
      () => null,
    );
    return resolveSmartSplitTextLimit(settings);
  },
};
