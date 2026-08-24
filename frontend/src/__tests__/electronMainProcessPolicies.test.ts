import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  buildRendererLoadFailureDataUrl,
  buildRendererLoadFailureHtml,
  getElectronMessages,
  resolveElectronLocale,
} from "../../electron/localization";
import { shouldForwardBackendOutput } from "../../electron/backend/backendOutputPolicy";
import { DESKTOP_BRIDGE_CAPABILITIES } from "../../electron/desktop/bridgeContract";
import {
  DESKTOP_LOG_MAX_BYTES,
  DESKTOP_LOG_RETENTION_MS,
} from "../../electron/desktopLogger";

describe("Electron desktop bridge policy", () => {
  it("exposes one generic file-picker capability", () => {
    expect(DESKTOP_BRIDGE_CAPABILITIES).toEqual([
      "openFile",
      "readFile",
      "showSaveDialog",
      "selectDirectory",
      "showInExplorer",
      "fetchCookies",
      "getPathForFile",
      "writeFile",
      "getFileSize",
      "readWorkspaceState",
      "writeWorkspaceState",
      "getDesktopRuntimeInfo",
      "minimize",
      "maximize",
      "close",
      "notifyRendererReady",
      "onPrepareToClose",
    ]);
  });

  it("uses one asynchronous workspace writer and never builds the renderer at runtime", () => {
    const workspaceHandler = fs.readFileSync(
      path.resolve("electron/ipc/workspace-state-handlers.ts"),
      "utf-8",
    );
    const desktopRuntime = fs.readFileSync(
      path.resolve("electron/desktopRuntime.ts"),
      "utf-8",
    );

    expect(workspaceHandler).not.toContain("writeWorkspaceStateSync");
    expect(workspaceHandler).not.toContain("writeWorkspaceStateFileSync");
    expect(desktopRuntime).not.toContain("spawnSync");
    expect(desktopRuntime).not.toContain("auto-build renderer");
  });
});

describe("Electron main-process localization", () => {
  it("normalizes system locale variants to the supported compact dictionary", () => {
    expect(resolveElectronLocale("zh-CN")).toBe("zh");
    expect(resolveElectronLocale("zh_TW")).toBe("zh");
    expect(resolveElectronLocale("ja-JP")).toBe("ja");
    expect(resolveElectronLocale("en-US")).toBe("en");
    expect(resolveElectronLocale("fr-FR")).toBe("en");
  });

  it("provides localized cookie titles and application menu labels", () => {
    expect(getElectronMessages("en-US")).toMatchObject({
      cookieVerificationTitle:
        "Complete verification, then close this window",
      menuFile: "File",
      menuOpenWorkspace: "Open Workspace",
    });
    expect(getElectronMessages("zh-CN")).toMatchObject({
      cookieVerificationTitle: "请完成验证后关闭此窗口",
      menuFile: "文件",
      menuOpenWorkspace: "打开工作区",
    });
    expect(getElectronMessages("ja-JP")).toMatchObject({
      cookieVerificationTitle:
        "認証を完了してからこのウィンドウを閉じてください",
      menuFile: "ファイル",
      menuOpenWorkspace: "ワークスペースを開く",
    });
  });

  it("escapes renderer failure details before embedding them in the data page", () => {
    const html = buildRendererLoadFailureHtml("en-US", {
      errorCode: -6,
      errorDescription: '<script>alert("error")</script>',
      target: 'file:///tmp/</code><img src=x onerror="alert(1)">&',
    });

    expect(html).toContain('<html lang="en">');
    expect(html).toContain("Content-Security-Policy");
    expect(html).not.toContain('<script>alert("error")</script>');
    expect(html).not.toContain("</code><img");
    expect(html).toContain(
      "&lt;script&gt;alert(&quot;error&quot;)&lt;/script&gt;",
    );
    expect(html).toContain("&lt;/code&gt;&lt;img");

    const dataUrl = buildRendererLoadFailureDataUrl("ja-JP", {
      errorCode: -6,
      errorDescription: "ERR_FILE_NOT_FOUND",
      target: "file:///missing.html",
    });
    expect(decodeURIComponent(dataUrl.split(",")[1] ?? "")).toContain(
      "MediaFlow を起動できませんでした",
    );
  });
});

describe("bundled backend output policy", () => {
  it("suppresses raw output in production by default", () => {
    expect(shouldForwardBackendOutput(false, undefined)).toBe(false);
    expect(shouldForwardBackendOutput(false, "false")).toBe(false);
  });

  it("allows raw output only in development or explicit diagnostic mode", () => {
    expect(shouldForwardBackendOutput(true, undefined)).toBe(true);
    expect(shouldForwardBackendOutput(false, "true")).toBe(true);
    expect(shouldForwardBackendOutput(false, " ON ")).toBe(true);
  });
});

describe("desktop diagnostic file policy", () => {
  it("keeps desktop logs bounded by size and retention", () => {
    expect(DESKTOP_LOG_MAX_BYTES).toBe(10 * 1024 * 1024);
    expect(DESKTOP_LOG_RETENTION_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
