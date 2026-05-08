import { act, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BootApp, resetBootAppStartupForTests } from "../components/startup/BootApp";
import { resetDesktopRuntimeInfoCache } from "../services/desktop";
import { installElectronMock, type MockedElectronAPI } from "./testUtils/electronMock";

const getSettingsMock = vi.fn();
const changeLanguageMock = vi.fn();
const probeBackendHealthMock = vi.fn();

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

vi.mock("../services/domain", () => ({
  isDesktopRuntime: () => true,
  settingsService: {
    getSettings: (...args: unknown[]) => getSettingsMock(...args),
  },
}));

vi.mock("../startup/backendHealthProbe", () => ({
  probeBackendHealth: (...args: unknown[]) => probeBackendHealthMock(...args),
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
    resetBootAppStartupForTests();
    resetDesktopRuntimeInfoCache();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    probeBackendHealthMock.mockResolvedValue({ ok: true, health: { status: "ok" } });
    electronMock = installElectronMock();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("loads user settings before marking app ready", async () => {
    vi.useFakeTimers();
    getSettingsMock.mockResolvedValue({ language: "zh" });

    render(<BootApp />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId("app-ready").textContent).toBe("true");
    expect(screen.getByTestId("remote-backend-ready").textContent).toBe("true");
    expect(screen.getByTestId("startup-message").textContent).toBe("后端已就绪。");
    expect(getSettingsMock).toHaveBeenCalledTimes(1);
    expect(changeLanguageMock).toHaveBeenCalledWith("zh");
    expect(electronMock.getDesktopRuntimeInfo).toHaveBeenCalledTimes(1);
  });

  it("keeps the shared startup bootstrap alive across StrictMode remounts", async () => {
    let resolveRuntimeInfo: (value: unknown) => void = () => undefined;
    const runtimeInfoPromise = new Promise((resolve) => {
      resolveRuntimeInfo = resolve;
    });
    electronMock.getDesktopRuntimeInfo = vi.fn().mockReturnValue(runtimeInfoPromise);
    getSettingsMock.mockResolvedValue({ language: "zh" });

    render(
      <StrictMode>
        <BootApp />
      </StrictMode>,
    );

    await act(async () => {
      resolveRuntimeInfo({
        status: "pong",
        contract_version: 1,
        bridge_version: "test-bridge",
        capabilities: ["getDesktopRuntimeInfo"],
        backend: {
          status: "external",
          host: "127.0.0.1",
          port: 8800,
          api_base_url: "http://127.0.0.1:8800/api/v1",
          ws_base_url: "ws://127.0.0.1:8800/api/v1",
          health_url: "http://127.0.0.1:8800/health",
        },
      });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId("app-ready").textContent).toBe("true");
    expect(screen.getByTestId("remote-backend-ready").textContent).toBe("true");
    expect(screen.getByTestId("startup-message").textContent).toBe("后端已就绪。");
    expect(electronMock.getDesktopRuntimeInfo).toHaveBeenCalledTimes(1);
    expect(probeBackendHealthMock).toHaveBeenCalledTimes(1);
  });

  it("marks app ready without loading the startup route module", async () => {
    vi.useFakeTimers();
    getSettingsMock.mockResolvedValue({ language: "zh" });

    render(<BootApp />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId("app-ready").textContent).toBe("true");
    expect(screen.getByTestId("remote-backend-ready").textContent).toBe("true");
    expect(getSettingsMock).toHaveBeenCalledTimes(1);
  });

  it("polls backend health before marking the app ready", async () => {
    vi.useFakeTimers();
    probeBackendHealthMock
      .mockResolvedValueOnce({ ok: false, error: new Error("offline") })
      .mockResolvedValue({ ok: true, health: { status: "ok" } });
    getSettingsMock.mockResolvedValue({ language: "zh" });

    render(<BootApp />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId("app-ready").textContent).toBe("false");
    expect(screen.getByTestId("startup-message").textContent).toBe(
      "后端正在启动中，正在重试健康检查...",
    );
    expect(probeBackendHealthMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(149);
      await Promise.resolve();
    });

    expect(probeBackendHealthMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId("app-ready").textContent).toBe("true");
    expect(screen.getByTestId("remote-backend-ready").textContent).toBe("true");
    expect(probeBackendHealthMock).toHaveBeenCalledTimes(2);
  });

  it("stays in bootstrap retry when desktop runtime handshake is incompatible", async () => {
    vi.useFakeTimers();
    electronMock.getDesktopRuntimeInfo = vi.fn().mockResolvedValue({
      status: "pong",
      contract_version: 0,
      bridge_version: "old-bridge",
      capabilities: [],
      backend: {
        status: "external",
        host: "127.0.0.1",
        port: 8800,
        api_base_url: "http://127.0.0.1:8800/api/v1",
        ws_base_url: "ws://127.0.0.1:8800/api/v1",
        health_url: "http://127.0.0.1:8800/health",
      },
    });

    render(<BootApp />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
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
