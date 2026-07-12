import { describe, expect, it } from "vitest";
import {
  buildRendererLoadFailureDataUrl,
  buildRendererLoadFailureHtml,
  getElectronMessages,
  resolveElectronLocale,
} from "../../electron/localization";
import { shouldForwardBackendOutput } from "../../electron/backend/backendOutputPolicy";
import { DESKTOP_BRIDGE_CAPABILITIES } from "../../electron/desktop/bridgeContract";

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
      "writeWorkspaceStateSync",
      "getDesktopRuntimeInfo",
      "minimize",
      "maximize",
      "close",
      "notifyRendererReady",
    ]);
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
