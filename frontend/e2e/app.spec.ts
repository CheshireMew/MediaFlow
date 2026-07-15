import { expect, test, type Page } from "@playwright/test";

const backendOrigin = "http://127.0.0.1:8800";
const taskSocketUrl = "ws://127.0.0.1:8800/api/v1/ws/tasks";

type BackendMockOptions = {
  analyzeFailure?: boolean;
  translationWorkflow?: boolean;
};

const userSettings = {
  llm_providers: [
    {
      id: "e2e-provider",
      name: "E2E Provider",
      base_url: "https://example.test/v1",
      api_key: "e2e-key",
      model: "e2e-model",
      is_active: true,
    },
  ],
  default_download_path: null,
  faster_whisper_cli_path: null,
  language: "en",
  auto_execute_flow: false,
  smart_split_text_limit: 18,
  ui_state: {},
};

async function installBackendMock(
  page: Page,
  options: BackendMockOptions = {},
) {
  let sendCompletedTranslation: ((requestParams: unknown) => void) | null = null;

  await page.route(`${backendOrigin}/**`, async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());

    if (request.method() === "GET" && pathname === "/health") {
      await route.fulfill({ json: { status: "ok" } });
      return;
    }

    if (request.method() === "GET" && pathname === "/api/v1/settings/") {
      await route.fulfill({ json: userSettings });
      return;
    }

    if (request.method() === "GET" && pathname === "/api/v1/tasks/") {
      await route.fulfill({ json: [] });
      return;
    }

    if (request.method() === "GET" && pathname === "/api/v1/glossary/") {
      await route.fulfill({ json: [] });
      return;
    }

    if (
      request.method() === "PATCH" &&
      (pathname === "/api/v1/settings/ui-state" ||
        pathname === "/api/v1/settings/preferences")
    ) {
      await route.fulfill({ json: userSettings });
      return;
    }

    if (
      options.analyzeFailure &&
      request.method() === "POST" &&
      pathname === "/api/v1/analyze/"
    ) {
      await route.fulfill({
        status: 503,
        json: { detail: "E2E analysis unavailable" },
      });
      return;
    }

    if (
      options.translationWorkflow &&
      request.method() === "POST" &&
      pathname === "/api/v1/pipeline/run"
    ) {
      const requestParams: unknown = request.postDataJSON();
      await route.fulfill({
        json: {
          task_id: "e2e-translation-task",
          status: "pending",
          task_source: "backend",
          task_contract_version: 9,
          revision: 0,
          persistence_scope: "runtime",
          lifecycle: "resumable",
          queue_state: "queued",
          queue_position: null,
          primary_operation: "translate",
          message_code: "queued",
          message_params: {},
        },
      });
      sendCompletedTranslation?.(requestParams);
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ detail: `Unexpected E2E request: ${request.method()} ${pathname}` }),
    });
  });

  await page.routeWebSocket(taskSocketUrl, (socket) => {
    const streamId = "e2e-task-stream";
    const snapshotTimer = setTimeout(() => {
      socket.send(JSON.stringify({
        type: "snapshot",
        tasks: [],
        stream_id: streamId,
        sequence: 1,
      }));
    }, 25);

    sendCompletedTranslation = (requestParams) => {
      setTimeout(() => {
        const outputArtifact = {
          kind: "subtitle",
          role: "output",
          ref: {
            path: "E:/subs/e2e_zh.srt",
            name: "e2e_zh.srt",
          },
        };
        socket.send(JSON.stringify({
          type: "update",
          stream_id: streamId,
          sequence: 2,
          task: {
            id: "e2e-translation-task",
            type: "pipeline",
            status: "completed",
            task_source: "backend",
            task_contract_version: 9,
            persistence_scope: "history",
            lifecycle: "history-only",
            progress: 100,
            revision: 1,
            name: "e2e.srt",
            message_code: "pipeline_completed",
            message_params: {},
            result: {
              success: true,
              artifacts: [outputArtifact],
              outputs: {
                translation: {
                  segments: [{
                    id: "1",
                    start: 0,
                    end: 2,
                    text: "Playwright 已显示翻译结果",
                  }],
                  language: "SimplifiedChinese",
                  mode: "standard",
                },
              },
              execution_trace: [],
            },
            request_params: requestParams,
            primary_operation: "translate",
            artifacts: [
              {
                kind: "subtitle",
                role: "context",
                ref: {
                  path: "E:/subs/e2e.srt",
                  name: "e2e.srt",
                },
              },
              outputArtifact,
            ],
            created_at: Date.now(),
            queue_state: "completed",
            queue_position: null,
          },
        }));
      }, 100);
    };

    socket.onClose(() => {
      clearTimeout(snapshotTimer);
      sendCompletedTranslation = null;
    });
  });
}

async function openReadyDownloader(
  page: Page,
  options: BackendMockOptions = {},
) {
  await installBackendMock(page, options);
  await page.goto("/#/downloader");

  await expect(page.getByRole("heading", { name: "Video Downloader" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "MediaFlow" })).toBeVisible();
  await expect(page.getByText("No active tasks")).toBeVisible();
}

async function expectNoHorizontalPageOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        viewportWidth: window.innerWidth,
      })),
    )
    .toEqual({
      documentWidth: page.viewportSize()?.width,
      bodyWidth: page.viewportSize()?.width,
      viewportWidth: page.viewportSize()?.width,
    });
}

test("starts in a ready downloader workspace without horizontal overflow", async ({
  page,
}, testInfo) => {
  await openReadyDownloader(page);
  await expectNoHorizontalPageOverflow(page);

  await expect(
    page
      .getByRole("navigation", { name: "MediaFlow" })
      .getByRole("button", { name: "Download", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  if (testInfo.project.name === "desktop") {
    await expect(page).toHaveScreenshot("downloader-ready.png");
  }
});

test("navigates from downloader to the live dashboard", async ({ page }, testInfo) => {
  await openReadyDownloader(page);

  const sidebar = page.getByRole("navigation", { name: "MediaFlow" });
  await sidebar.getByRole("button", { name: "Monitor" }).click();

  await expect(page).toHaveURL(/#\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Backend Connection")).toBeVisible();
  await expect(page.getByText("Online", { exact: true })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "Monitor" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expectNoHorizontalPageOverflow(page);

  if (testInfo.project.name === "desktop") {
    await expect(page).toHaveScreenshot("dashboard-ready.png");
  }
});

const workspaceRoutes = [
  {
    route: "editor",
    navigationName: "Editor",
    heading: "Editor Workspace",
    readyText: "No media loaded",
    secondaryReadyText: "No subtitles",
  },
  {
    route: "translator",
    navigationName: "Translate",
    heading: "AI Translator",
    readyText: "Drag & drop subtitle file",
  },
  {
    route: "transcriber",
    navigationName: "Transcribe",
    heading: "Audio Transcriber",
    readyText: "No transcription results yet",
    secondaryReadyText: "Drag & drop audio/video",
  },
  {
    route: "settings",
    navigationName: "Settings",
    heading: "Settings",
    readyText: "E2E Provider",
  },
] as const;

for (const workspace of workspaceRoutes) {
  test(`opens the ready ${workspace.route} workspace`, async ({ page }, testInfo) => {
    await openReadyDownloader(page);

    const sidebar = page.getByRole("navigation", { name: "MediaFlow" });
    await sidebar
      .getByRole("button", { name: workspace.navigationName, exact: true })
      .click();

    await expect(page).toHaveURL(new RegExp(`#/${workspace.route}$`));
    await expect(page.getByRole("heading", { name: workspace.heading })).toBeVisible();
    await expect(page.getByText(workspace.readyText, { exact: true }).first()).toBeVisible();
    if ("secondaryReadyText" in workspace) {
      await expect(
        page.getByText(workspace.secondaryReadyText, { exact: true }).first(),
      ).toBeVisible();
    }
    await expect(
      sidebar.getByRole("button", { name: workspace.navigationName, exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expectNoHorizontalPageOverflow(page);

    if (testInfo.project.name === "desktop") {
      await expect(page).toHaveScreenshot(`${workspace.route}-ready.png`);
    }
  });
}

test("shows a visible error when backend analysis fails", async ({ page }) => {
  await openReadyDownloader(page, { analyzeFailure: true });

  await page
    .getByPlaceholder("Paste video URL here (e.g. YouTube, Bilibili...)")
    .fill("https://example.test/video");
  await page.getByRole("button", { name: "Download Media" }).click();

  await expect(page.getByText("E2E analysis unavailable", { exact: true })).toBeVisible();
  await expectNoHorizontalPageOverflow(page);
});

test("translates a subtitle and renders the completed task output", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "mediaflow:workspace-state:v1",
      JSON.stringify({
        "translator-storage": {
          sourceSegments: [{
            id: "1",
            start: 0,
            end: 2,
            text: "Playwright translation source",
          }],
          targetSegments: [],
          sourceFileRef: {
            path: "E:/subs/e2e.srt",
            name: "e2e.srt",
          },
          targetSubtitleRef: null,
          resultMode: null,
        },
      }),
    );
  });
  await installBackendMock(page, { translationWorkflow: true });
  await page.goto("/#/translator");

  await expect(page.getByRole("heading", { name: "AI Translator" })).toBeVisible();
  await expect(page.getByText("Playwright translation source", { exact: true })).toBeVisible();

  await page
    .getByRole("banner")
    .getByRole("button", { name: /Translate/i })
    .click();

  await expect(page.locator("textarea")).toHaveValue("Playwright 已显示翻译结果");
});
