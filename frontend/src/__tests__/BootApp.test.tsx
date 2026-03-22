import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BootApp } from "../components/startup/BootApp";
import { resetDesktopRuntimeInfoCache } from "../services/desktop";
import { installElectronMock, type MockedElectronAPI } from "./testUtils/electronMock";

const checkHealthMock = vi.fn();
const getSettingsMock = vi.fn();
const changeLanguageMock = vi.fn();

vi.mock("../App", () => ({
  default: ({
    appReady,
    remoteBackendReady,
    startupMessage,
  }: {
    appReady?: boolean;
    remoteBackendReady?: boolean;
    startupMessage?: string;
  }) => (
    <div>
      <div data-testid="app-ready">{String(appReady)}</div>
      <div data-testid="remote-backend-ready">{String(remoteBackendReady)}</div>
      <div data-testid="startup-message">{startupMessage}</div>
    </div>
  ),
}));

vi.mock("../api/client", () => ({
  apiClient: {
    checkHealth: (...args: unknown[]) => checkHealthMock(...args),
  },
}));

vi.mock("../services/domain", () => ({
  isDesktopRuntime: () => true,
  settingsService: {
    getSettings: (...args: unknown[]) => getSettingsMock(...args),
  },
}));

vi.mock("../i18n", () => ({
  default: {
    t: (key: string) => key,
    changeLanguage: (...args: unknown[]) => changeLanguageMock(...args),
  },
}));

describe("BootApp", () => {
  let electronMock: MockedElectronAPI;

  beforeEach(() => {
    vi.clearAllMocks();
    resetDesktopRuntimeInfoCache();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    electronMock = installElectronMock();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("marks app ready after desktop worker ping before backend health is ready", async () => {
    vi.useFakeTimers();
    getSettingsMock.mockResolvedValue({ language: "zh" });
    checkHealthMock
      .mockRejectedValueOnce(new Error("starting"))
      .mockResolvedValueOnce({ status: "ok" });

    render(<BootApp />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId("app-ready").textContent).toBe("true");
    expect(screen.getByTestId("remote-backend-ready").textContent).toBe("false");
    expect(screen.getByTestId("startup-message").textContent).toBe(
      "startup.status.retryingHealth",
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.resolve();
    });

    expect(screen.getByTestId("remote-backend-ready").textContent).toBe("true");
    expect(screen.getByTestId("startup-message").textContent).toBe("startup.status.ready");
    expect(getSettingsMock).toHaveBeenCalledTimes(1);
    expect(changeLanguageMock).toHaveBeenCalledWith("zh");
    expect(electronMock.getDesktopRuntimeInfo).toHaveBeenCalledTimes(1);
  });

  it("stays in bootstrap retry when desktop runtime handshake is incompatible", async () => {
    vi.useFakeTimers();
    electronMock.getDesktopRuntimeInfo = vi.fn().mockResolvedValue({
      status: "pong",
      contract_version: 0,
      bridge_version: "old-bridge",
      task_owner_mode: "backend",
      capabilities: ["desktopPing"],
      worker: {
        protocol_version: 1,
        app_version: "old-worker",
      },
    });

    render(<BootApp />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId("app-ready").textContent).toBe("false");
    expect(screen.getByTestId("remote-backend-ready").textContent).toBe("false");
    expect(screen.getByTestId("startup-message").textContent).toBe(
      "Desktop bridge contract mismatch. Required >= 1, received 0.",
    );
    expect(getSettingsMock).not.toHaveBeenCalled();
  });
});
