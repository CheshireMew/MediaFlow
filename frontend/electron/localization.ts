export type ElectronLocale = "en" | "zh" | "ja";

export interface ElectronMessages {
  htmlLang: "en" | "zh-CN" | "ja";
  cookieVerificationTitle: string;
  menuFile: string;
  menuView: string;
  menuHelp: string;
  menuOpenWorkspace: string;
  loadFailureDocumentTitle: string;
  loadFailureHeading: string;
  loadFailureDescription: string;
  loadFailureSupport: string;
  loadFailureTargetLabel: string;
  loadFailureErrorLabel: string;
}

const ELECTRON_MESSAGES: Record<ElectronLocale, ElectronMessages> = {
  en: {
    htmlLang: "en",
    cookieVerificationTitle:
      "Complete verification, then close this window",
    menuFile: "File",
    menuView: "View",
    menuHelp: "Help",
    menuOpenWorkspace: "Open Workspace",
    loadFailureDocumentTitle: "MediaFlow Startup Error",
    loadFailureHeading: "MediaFlow could not start",
    loadFailureDescription:
      "The application interface did not load. MediaFlow stopped waiting on a blank window.",
    loadFailureSupport:
      "Send the diagnostic details below to the developer:",
    loadFailureTargetLabel: "Target",
    loadFailureErrorLabel: "Error",
  },
  zh: {
    htmlLang: "zh-CN",
    cookieVerificationTitle: "请完成验证后关闭此窗口",
    menuFile: "文件",
    menuView: "视图",
    menuHelp: "帮助",
    menuOpenWorkspace: "打开工作区",
    loadFailureDocumentTitle: "MediaFlow 启动错误",
    loadFailureHeading: "MediaFlow 桌面端启动失败",
    loadFailureDescription:
      "应用界面未能成功加载，MediaFlow 已停止继续等待空白窗口。",
    loadFailureSupport: "请把下面的诊断信息发给开发者：",
    loadFailureTargetLabel: "加载目标",
    loadFailureErrorLabel: "错误",
  },
  ja: {
    htmlLang: "ja",
    cookieVerificationTitle:
      "認証を完了してからこのウィンドウを閉じてください",
    menuFile: "ファイル",
    menuView: "表示",
    menuHelp: "ヘルプ",
    menuOpenWorkspace: "ワークスペースを開く",
    loadFailureDocumentTitle: "MediaFlow 起動エラー",
    loadFailureHeading: "MediaFlow を起動できませんでした",
    loadFailureDescription:
      "アプリ画面を読み込めなかったため、空白ウィンドウでの待機を停止しました。",
    loadFailureSupport: "以下の診断情報を開発者に送ってください：",
    loadFailureTargetLabel: "読み込み先",
    loadFailureErrorLabel: "エラー",
  },
};

export function resolveElectronLocale(locale: string | null | undefined): ElectronLocale {
  const normalized = locale?.trim().toLowerCase() ?? "";
  if (normalized === "zh" || normalized.startsWith("zh-") || normalized.startsWith("zh_")) {
    return "zh";
  }
  if (normalized === "ja" || normalized.startsWith("ja-") || normalized.startsWith("ja_")) {
    return "ja";
  }
  return "en";
}

export function getElectronMessages(
  locale: string | null | undefined,
): ElectronMessages {
  return ELECTRON_MESSAGES[resolveElectronLocale(locale)];
}

export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export interface RendererLoadFailureDetails {
  errorCode: number;
  errorDescription: string;
  target: string;
}

export function buildRendererLoadFailureHtml(
  locale: string | null | undefined,
  details: RendererLoadFailureDetails,
): string {
  const messages = getElectronMessages(locale);
  const target = escapeHtml(details.target);
  const error = escapeHtml(`${details.errorCode}: ${details.errorDescription}`);

  return `<!doctype html>
<html lang="${messages.htmlLang}">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${messages.loadFailureDocumentTitle}</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #111827;
        color: #e5e7eb;
        font-family: "Segoe UI", sans-serif;
      }
      main {
        width: min(720px, calc(100vw - 48px));
        padding: 32px;
        border-radius: 20px;
        background: rgba(17, 24, 39, 0.92);
        border: 1px solid rgba(148, 163, 184, 0.18);
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 24px;
      }
      p {
        margin: 0 0 12px;
        line-height: 1.6;
        color: #cbd5e1;
      }
      code {
        display: block;
        margin-top: 16px;
        padding: 14px 16px;
        border-radius: 12px;
        background: rgba(15, 23, 42, 0.9);
        color: #f8fafc;
        word-break: break-all;
        white-space: pre-wrap;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${messages.loadFailureHeading}</h1>
      <p>${messages.loadFailureDescription}</p>
      <p>${messages.loadFailureSupport}</p>
      <code>${messages.loadFailureTargetLabel}: ${target}
${messages.loadFailureErrorLabel}: ${error}</code>
    </main>
  </body>
</html>`;
}

export function buildRendererLoadFailureDataUrl(
  locale: string | null | undefined,
  details: RendererLoadFailureDetails,
): string {
  return `data:text/html;charset=UTF-8,${encodeURIComponent(
    buildRendererLoadFailureHtml(locale, details),
  )}`;
}
