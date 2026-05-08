import type {
  ActiveProviderResponse,
  CudaReadinessResponse,
  FasterWhisperCliInstallResponse,
  ProviderConnectionRequest,
  ProviderConnectionResponse,
  ToolUpdateResponse,
  UserSettings,
} from "../../types/api";
import { resolveSmartSplitTextLimit } from "../../utils/subtitleSmartSplit";

export const settingsService = {
  getSettings(): Promise<UserSettings> {
    return import("../../api/client").then(({ apiClient }) => apiClient.getSettings());
  },

  updateSettings(settings: UserSettings): Promise<UserSettings> {
    return import("../../api/client").then(({ apiClient }) => apiClient.updateSettings(settings));
  },

  setActiveProvider(providerId: string): Promise<ActiveProviderResponse> {
    return import("../../api/client").then(({ apiClient }) => apiClient.setActiveProvider(providerId));
  },

  testProviderConnection(
    provider: ProviderConnectionRequest,
  ): Promise<ProviderConnectionResponse> {
    return import("../../api/client").then(({ apiClient }) => apiClient.testProviderConnection(provider));
  },

  updateYtDlp(): Promise<ToolUpdateResponse> {
    return import("../../api/client").then(({ apiClient }) => apiClient.updateYtDlp());
  },

  installFasterWhisperCli(): Promise<FasterWhisperCliInstallResponse> {
    return import("../../api/client").then(({ apiClient }) => apiClient.installFasterWhisperCli());
  },

  getCudaReadiness(): Promise<CudaReadinessResponse> {
    return import("../../api/client").then(({ apiClient }) => apiClient.getCudaReadiness());
  },

  async getSmartSplitTextLimit(): Promise<number> {
    const settings = await Promise.resolve(settingsService.getSettings()).catch(
      () => null,
    );
    return resolveSmartSplitTextLimit(settings);
  },
};
