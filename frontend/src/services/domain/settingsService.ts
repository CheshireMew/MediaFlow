import type {
  ActiveProviderResponse,
  FasterWhisperCliInstallResponse,
  ProviderConnectionRequest,
  ProviderConnectionResponse,
  ToolUpdateResponse,
  UserSettings,
} from "../../types/api";
import { isDesktopRuntime, requireDesktopApiMethod } from "../desktop/bridge";
import { resolveSmartSplitTextLimit } from "../../utils/subtitleSmartSplit";

export const settingsService = {
  getSettings(): Promise<UserSettings> {
    if (isDesktopRuntime()) {
      return requireDesktopApiMethod(
        "getDesktopSettings",
        "Desktop settings worker is unavailable.",
      )();
    }
    return import("../../api/client").then(({ apiClient }) => apiClient.getSettings());
  },

  updateSettings(settings: UserSettings): Promise<UserSettings> {
    if (isDesktopRuntime()) {
      return requireDesktopApiMethod(
        "updateDesktopSettings",
        "Desktop settings worker is unavailable.",
      )(settings);
    }
    return import("../../api/client").then(({ apiClient }) => apiClient.updateSettings(settings));
  },

  setActiveProvider(providerId: string): Promise<ActiveProviderResponse> {
    if (isDesktopRuntime()) {
      return requireDesktopApiMethod(
        "setDesktopActiveProvider",
        "Desktop settings worker is unavailable.",
      )(providerId);
    }
    return import("../../api/client").then(({ apiClient }) => apiClient.setActiveProvider(providerId));
  },

  testProviderConnection(
    provider: ProviderConnectionRequest,
  ): Promise<ProviderConnectionResponse> {
    if (isDesktopRuntime()) {
      return requireDesktopApiMethod(
        "testDesktopProvider",
        "Desktop settings worker is unavailable.",
      )(provider);
    }
    return import("../../api/client").then(({ apiClient }) => apiClient.testProviderConnection(provider));
  },

  updateYtDlp(): Promise<ToolUpdateResponse> {
    if (isDesktopRuntime()) {
      return requireDesktopApiMethod(
        "updateDesktopYtDlp",
        "Desktop settings worker is unavailable.",
      )();
    }
    return import("../../api/client").then(({ apiClient }) => apiClient.updateYtDlp());
  },

  installFasterWhisperCli(): Promise<FasterWhisperCliInstallResponse> {
    if (isDesktopRuntime()) {
      return requireDesktopApiMethod(
        "installDesktopFasterWhisperCli",
        "Desktop settings worker is unavailable.",
      )();
    }
    return import("../../api/client").then(({ apiClient }) => apiClient.installFasterWhisperCli());
  },

  async getSmartSplitTextLimit(): Promise<number> {
    const settings = await Promise.resolve(settingsService.getSettings()).catch(
      () => null,
    );
    return resolveSmartSplitTextLimit(settings);
  },
};
