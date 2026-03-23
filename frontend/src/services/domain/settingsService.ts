import { callBackendFallback } from "./backendFallback";
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
    return callBackendFallback("settingsService", "getSettings", () =>
      import("../../api/client").then(({ apiClient }) => apiClient.getSettings()),
    );
  },

  updateSettings(settings: UserSettings): Promise<UserSettings> {
    if (isDesktopRuntime()) {
      return requireDesktopApiMethod(
        "updateDesktopSettings",
        "Desktop settings worker is unavailable.",
      )(settings);
    }
    return callBackendFallback("settingsService", "updateSettings", () =>
      import("../../api/client").then(({ apiClient }) => apiClient.updateSettings(settings)),
    );
  },

  setActiveProvider(providerId: string): Promise<ActiveProviderResponse> {
    if (isDesktopRuntime()) {
      return requireDesktopApiMethod(
        "setDesktopActiveProvider",
        "Desktop settings worker is unavailable.",
      )(providerId);
    }
    return callBackendFallback("settingsService", "setActiveProvider", () =>
      import("../../api/client").then(({ apiClient }) => apiClient.setActiveProvider(providerId)),
    );
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
    return callBackendFallback("settingsService", "testProviderConnection", () =>
      import("../../api/client").then(({ apiClient }) => apiClient.testProviderConnection(provider)),
    );
  },

  updateYtDlp(): Promise<ToolUpdateResponse> {
    if (isDesktopRuntime()) {
      return requireDesktopApiMethod(
        "updateDesktopYtDlp",
        "Desktop settings worker is unavailable.",
      )();
    }
    return callBackendFallback("settingsService", "updateYtDlp", () =>
      import("../../api/client").then(({ apiClient }) => apiClient.updateYtDlp()),
    );
  },
};
