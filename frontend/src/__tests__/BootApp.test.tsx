import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BootApp } from "../components/startup/BootApp";
import { resetDesktopRuntimeInfoCache } from "../services/desktop";
import { installElectronMock, type MockedElectronAPI } from "./testUtils/electronMock";

const getSettingsMock = vi.fn();
const changeLanguageMock = vi.fn();
const probeBackendHealthMock = vi.fn();
const ensureI18nNamespacesMock = vi.fn();
const routePreloadMock = vi.fn();

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

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
  ensureI18nNamespaces: (...args: unknown[]) => ensureI18nNamespacesMock(...args),
}));

vi.mock("../startup/routePageDefinitions", () => {
  const routeModule = {
    namespaces: ["downloader", "taskmonitor"],
    load: (...args: unknown[]) => routePreloadMock(...args),
  };
  return {
    ROUTE_PAGE_MODULES: {
      dashboard: routeModule,
      editor: routeModule,
      downloader: routeModule,
      transcriber: routeModule,
      translator: routeModule,
      preprocessing: routeModule,
      settings: routeModule,
    },
  };
});

describe("BootApp", () => {
  let electronMock: MockedElectronAPI;

  beforeEach(() => {
    vi.clearAllMocks();
    resetDesktopRuntimeInfoCache();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    probeBackendHealthMock.mockResolvedValue({ ok: true, health: { status: "ok" } });
    ensureI18nNamespacesMock.mockResolvedValue(undefined);
    routePreloadMock.mockResolvedValue({});
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

  it("waits for the startup route module before marking the app ready", async () => {
    vi.useFakeTimers();
    const routePreload = createDeferred<Record<string, never>>();
    routePreloadMock.mockReturnValue(routePreload.promise);
    getSettingsMock.mockResolvedValue({ language: "zh" });

    render(<BootApp />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId("app-ready").textContent).toBe("false");
    expect(screen.getByTestId("remote-backend-ready").textContent).toBe("false");
    expect(routePreloadMock).toHaveBeenCalledTimes(1);
    expect(ensureI18nNamespacesMock).toHaveBeenCalledWith([
      "downloader",
      "taskmonitor",
    ]);

    await act(async () => {
      routePreload.resolve({});
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId("app-ready").textContent).toBe("true");
    expect(screen.getByTestId("remote-backend-ready").textContent).toBe("true");
  });

  it("polls backend health quickly without restarting route preload", async () => {
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
    expect(routePreloadMock).toHaveBeenCalledTimes(1);

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
    expect(routePreloadMock).toHaveBeenCalledTimes(1);
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
