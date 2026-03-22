import { apiClient } from "../../api/client";
import type {
  ActiveProviderResponse,
  ProviderConnectionRequest,
  ProviderConnectionResponse,
  ToolUpdateResponse,
  UserSettings,
} from "../../types/api";
import { isDesktopRuntime, requireDesktopApiMethod } from "../desktop/bridge";

export const settingsService = {
  getSettings(): Promise<UserSettings> {
    if (isDesktopRuntime()) {
      return requireDesktopApiMethod(
        "getDesktopSettings",
        "Desktop settings worker is unavailable.",
      )();
    }
    return apiClient.getSettings();
  },

  updateSettings(settings: UserSettings): Promise<UserSettings> {
    if (isDesktopRuntime()) {
      return requireDesktopApiMethod(
        "updateDesktopSettings",
        "Desktop settings worker is unavailable.",
      )(settings);
    }
    return apiClient.updateSettings(settings);
  },

  setActiveProvider(providerId: string): Promise<ActiveProviderResponse> {
    if (isDesktopRuntime()) {
      return requireDesktopApiMethod(
        "setDesktopActiveProvider",
        "Desktop settings worker is unavailable.",
      )(providerId);
    }
    return apiClient.setActiveProvider(providerId);
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
    return apiClient.testProviderConnection(provider);
  },

  updateYtDlp(): Promise<ToolUpdateResponse> {
    if (isDesktopRuntime()) {
      return requireDesktopApiMethod(
        "updateDesktopYtDlp",
        "Desktop settings worker is unavailable.",
      )();
    }
    return apiClient.updateYtDlp();
  },
};
