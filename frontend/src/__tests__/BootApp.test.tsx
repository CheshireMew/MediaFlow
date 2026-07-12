import { act, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BootApp } from "../components/startup/BootApp";
import { resetBootAppStartupForTests } from "../components/startup/bootStartupCoordinator";
import { resetDesktopRuntimeInfoCache } from "../services/desktop";
import { installElectronMock, type MockedElectronAPI } from "./testUtils/electronMock";

const getSettingsMock = vi.fn();
const changeLanguageMock = vi.fn();
const probeBackendHealthMock = vi.fn();

async function flushStartupMicrotasks() {
  for (let index = 0; index < 20; index += 1) {
    await Promise.resolve();
  }
}

vi.mock("../App", () => ({
  default: ({
    appReady,
    remoteBackendReady,
    startupMessage,
    startupStatus,
    onRetryStartup,
  }: {
    appReady?: boolean;
    remoteBackendReady?: boolean;
    startupMessage?: string;
    startupStatus?: string;
    onRetryStartup?: () => void;
  }) => (
    <div>
      <div data-testid="app-ready">{String(appReady)}</div>
      <div data-testid="remote-backend-ready">{String(remoteBackendReady)}</div>
      <div data-testid="startup-message">{startupMessage}</div>
      <div data-testid="startup-status">{startupStatus}</div>
      {startupStatus === "retryable-error" && (
        <button type="button" onClick={onRetryStartup}>retry</button>
      )}
    </div>
  ),
}));

vi.mock("../services/domain", () => ({
  settingsService: {
    getSettings: (...args: unknown[]) => getSettingsMock(...args),
  },
}));

vi.mock("../startup/backendHealthProbe", () => ({
  probeBackendHealth: (...args: unknown[]) => probeBackendHealthMock(...args),
}));

vi.mock("../i18n", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../i18n")>();
  return {
    getStartupStatusFallback: actual.getStartupStatusFallback,
    default: {
      t: (key: string) => key,
      changeLanguage: (...args: unknown[]) => changeLanguageMock(...args),
    },
  };
});

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
      await Promise.resolve();
      await flushStartupMicrotasks();
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
        contract_version: 4,
        bridge_version: "test-bridge",
        capabilities: ["getDesktopRuntimeInfo", "readWorkspaceState", "writeWorkspaceState", "writeWorkspaceStateSync"],
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
      await flushStartupMicrotasks();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await flushStartupMicrotasks();
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
      await Promise.resolve();
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

  it("uses desktop backend health cache when it is already ready", async () => {
    vi.useFakeTimers();
    electronMock.getDesktopRuntimeInfo = vi.fn().mockResolvedValue({
      status: "pong",
      contract_version: 4,
      bridge_version: "test-bridge",
      capabilities: ["getDesktopRuntimeInfo", "readWorkspaceState", "writeWorkspaceState", "writeWorkspaceStateSync"],
      backend: {
        status: "managed",
        host: "127.0.0.1",
        port: 8800,
        api_base_url: "http://127.0.0.1:8800/api/v1",
        ws_base_url: "ws://127.0.0.1:8800/api/v1",
        health_url: "http://127.0.0.1:8800/health",
        health_status: "ready",
      },
    });
    getSettingsMock.mockResolvedValue({ language: "zh" });

    render(<BootApp />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId("app-ready").textContent).toBe("true");
    expect(probeBackendHealthMock).not.toHaveBeenCalled();
  });

  it("shows a fatal state without retry when desktop runtime handshake is incompatible", async () => {
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
    expect(screen.getByTestId("startup-status").textContent).toBe("fatal-error");
    expect(screen.getByTestId("startup-message").textContent).toContain(
      "Desktop bridge contract mismatch. Required >= 4, received 0.",
    );
    expect(screen.queryByRole("button", { name: "retry" })).toBeNull();
    expect(getSettingsMock).not.toHaveBeenCalled();
  });

  it("shows a fatal state when the desktop bridge lacks workspace persistence", async () => {
    vi.useFakeTimers();
    electronMock.getDesktopRuntimeInfo = vi.fn().mockResolvedValue({
      status: "pong",
      contract_version: 4,
      bridge_version: "incomplete-bridge",
      capabilities: ["getDesktopRuntimeInfo", "readWorkspaceState", "writeWorkspaceState"],
      backend: {
        status: "managed",
        host: "127.0.0.1",
        port: 8800,
        api_base_url: "http://127.0.0.1:8800/api/v1",
        ws_base_url: "ws://127.0.0.1:8800/api/v1",
        health_url: "http://127.0.0.1:8800/health",
        health_status: "ready",
      },
    });

    render(<BootApp />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
      await flushStartupMicrotasks();
    });

    expect(screen.getByTestId("app-ready").textContent).toBe("false");
    expect(screen.getByTestId("startup-status").textContent).toBe("fatal-error");
    expect(screen.getByTestId("startup-message").textContent).toContain(
      "Desktop bridge capability mismatch. Missing: writeWorkspaceStateSync.",
    );
    expect(screen.queryByRole("button", { name: "retry" })).toBeNull();
    expect(getSettingsMock).not.toHaveBeenCalled();
  });

  it("performs a fresh desktop handshake when the user retries a transient failure", async () => {
    vi.useFakeTimers();
    electronMock.getDesktopRuntimeInfo = vi.fn()
      .mockResolvedValueOnce({
        status: "pong",
        contract_version: 4,
        bridge_version: "test-bridge",
        capabilities: ["getDesktopRuntimeInfo", "readWorkspaceState", "writeWorkspaceState", "writeWorkspaceStateSync"],
        backend: {
          status: "failed",
          error: "Backend process exited",
          host: "127.0.0.1",
          port: 8800,
          api_base_url: "http://127.0.0.1:8800/api/v1",
          ws_base_url: "ws://127.0.0.1:8800/api/v1",
          health_url: "http://127.0.0.1:8800/health",
        },
      })
      .mockResolvedValueOnce({
        status: "pong",
        contract_version: 4,
        bridge_version: "test-bridge",
        capabilities: ["getDesktopRuntimeInfo", "readWorkspaceState", "writeWorkspaceState", "writeWorkspaceStateSync"],
        backend: {
          status: "managed",
          host: "127.0.0.1",
          port: 8800,
          api_base_url: "http://127.0.0.1:8800/api/v1",
          ws_base_url: "ws://127.0.0.1:8800/api/v1",
          health_url: "http://127.0.0.1:8800/health",
          health_status: "ready",
        },
      });
    getSettingsMock.mockResolvedValue({ language: "zh" });

    render(<BootApp />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId("startup-status").textContent).toBe("retryable-error");
    fireEvent.click(screen.getByRole("button", { name: "retry" }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(electronMock.getDesktopRuntimeInfo).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("app-ready").textContent).toBe("true");
    expect(screen.getByTestId("startup-status").textContent).toBe("loading");
  });

  it("automatically retries transient startup failures", async () => {
    vi.useFakeTimers();
    electronMock.getDesktopRuntimeInfo = vi.fn()
      .mockRejectedValueOnce(new Error("IPC temporarily unavailable"))
      .mockResolvedValueOnce({
        status: "pong",
        contract_version: 4,
        bridge_version: "test-bridge",
        capabilities: ["getDesktopRuntimeInfo", "readWorkspaceState", "writeWorkspaceState", "writeWorkspaceStateSync"],
        backend: {
          status: "managed",
          host: "127.0.0.1",
          port: 8800,
          api_base_url: "http://127.0.0.1:8800/api/v1",
          ws_base_url: "ws://127.0.0.1:8800/api/v1",
          health_url: "http://127.0.0.1:8800/health",
          health_status: "ready",
        },
      });
    getSettingsMock.mockResolvedValue({ language: "zh" });

    render(<BootApp />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId("startup-status").textContent).toBe("retryable-error");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(electronMock.getDesktopRuntimeInfo).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("app-ready").textContent).toBe("true");
  });
});
