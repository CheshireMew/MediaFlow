import { expect, test, type Page } from "@playwright/test";

const backendOrigin = "http://127.0.0.1:8800";
const taskSocketUrl = "ws://127.0.0.1:8800/api/v1/ws/tasks";

type BackendMockOptions = {
  analyzeFailure?: boolean;
  translationWorkflow?: boolean;
  language?: "en" | "zh";
  longProvider?: boolean;
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
  let completedTranslationTask: Record<string, unknown> | null = null;

  await page.route(`${backendOrigin}/**`, async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());

    if (request.method() === "GET" && pathname === "/health") {
      await route.fulfill({ json: { status: "ready" } });
      return;
    }

    if (request.method() === "GET" && pathname === "/api/v1/settings/") {
      await route.fulfill({
        json: {
          ...userSettings,
          language: options.language ?? userSettings.language,
          llm_providers: options.longProvider ? [{
            ...userSettings.llm_providers[0],
            name: "Provider".repeat(18),
            model: "long-model-name-".repeat(10),
            base_url: `https://example.test/${"endpoint/".repeat(20)}v1`,
          }] : userSettings.llm_providers,
        },
      });
      return;
    }

    if (request.method() === "GET" && pathname === "/api/v1/settings/cuda-readiness") {
      await route.fulfill({
        json: {
          status: "ready",
          summary: "CUDA is ready for built-in faster-whisper transcription.",
          gpu_name: "NVIDIA GeForce RTX E2E",
          driver_version: "999.1",
          driver_cuda_capability: "12.9",
          dependencies: [
            {
              key: "nvidia_driver",
              label: "NVIDIA driver",
              status: "ready",
              detail: "Detected NVIDIA GeForce RTX E2E.",
              path: "C:/Windows/System32/nvidia-smi.exe",
              version: "999.1",
            },
            {
              key: "cuda_runtime",
              label: "CUDA 12 runtime",
              status: "ready",
              detail: "cudart64_12.dll is available in PATH.",
              path: "D:/Tools/CUDA/bin/cudart64_12.dll",
            },
          ],
          install_guidance: [
            "CUDA is ready. Use device=cuda for built-in transcription.",
          ],
        },
      });
      return;
    }

    if (request.method() === "GET" && pathname === "/api/v1/tasks/") {
      await route.fulfill({ json: [] });
      return;
    }

    if (
      request.method() === "GET" &&
      pathname === "/api/v1/tasks/e2e-translation-task" &&
      completedTranslationTask
    ) {
      await route.fulfill({ json: completedTranslationTask });
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
          task_contract_version: 10,
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
        completedTranslationTask = {
          id: "e2e-translation-task",
          type: "pipeline",
          status: "completed",
          task_source: "backend",
          task_contract_version: 10,
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
        };
        const taskSummary = { ...completedTranslationTask };
        delete taskSummary.result;
        delete taskSummary.request_params;
        socket.send(JSON.stringify({
          type: "update",
          stream_id: streamId,
          sequence: 2,
          task: taskSummary,
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

  await expect(page.getByRole("heading", { name: "Media Downloader" })).toBeVisible();
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

async function expectInViewport(page: Page, locator: ReturnType<Page["locator"]>) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
}

test("starts in a ready downloader workspace without horizontal overflow", async ({
  page,
}, testInfo) => {
  await openReadyDownloader(page);
  await expectNoHorizontalPageOverflow(page);
  await expect(page.getByTitle("Pause all active tasks")).toBeDisabled();
  await expect(page.getByTitle("Delete all tasks")).toBeDisabled();

  if (testInfo.project.name === "compact") {
    await expectInViewport(page, page.getByText("No active tasks", { exact: true }));
  }

  await expect(
    page
      .getByRole("navigation", { name: "MediaFlow" })
      .getByRole("button", { name: "Download", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  if (testInfo.project.name === "desktop" || testInfo.project.name === "compact") {
    await expect(page).toHaveScreenshot("downloader-ready.png");
  }
});

test("navigates from downloader to the live dashboard", async ({ page }) => {
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

  await expect(page).toHaveScreenshot("dashboard-ready.png");
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

    if (workspace.route === "editor") {
      await expect(page.getByRole("button", { name: "Open Media" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Open Subtitles" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    }
    if (workspace.route === "translator") {
      const modeSelect = page.getByRole("combobox", { name: "Mode" });
      await expect(modeSelect.locator('option[value="proofread"]')).toHaveCount(0);
      await expect(page.getByTitle("Translate subtitles with the selected mode")).toBeVisible();
    }
    if (workspace.route === "transcriber" && testInfo.project.name === "compact") {
      await expectInViewport(
        page,
        page.getByText("No transcription results yet", { exact: true }),
      );
    }

    await expect(page).toHaveScreenshot(`${workspace.route}-ready.png`);
  });
}

test("shows a visible error when backend analysis fails", async ({ page }) => {
  await openReadyDownloader(page, { analyzeFailure: true });

  await page
    .getByRole("textbox", {
      name: "Paste a video or podcast URL (e.g. YouTube, Bilibili, Xiaoyuzhou...)",
    })
    .fill("https://example.test/video");
  await page.getByRole("textbox").press("Enter");

  await expect(page.getByText("E2E analysis unavailable", { exact: true })).toBeVisible();
  await expectNoHorizontalPageOverflow(page);
});

test("keeps editor actions and its full title reachable in the window", async ({ page }) => {
  await installBackendMock(page);
  await page.goto('/#/editor');
  const header = page.locator('header');
  const title = header.getByRole('heading', { name: 'Editor Workspace' });
  await expect(title).toBeVisible();
  expect(await title.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  for (const name of ['Open Media', 'Open Subtitle', 'Translate', 'Save']) {
    await expectInViewport(page, header.getByRole('button', { name, exact: true }));
  }
  await expect(header.getByRole('button', { name: 'Subtitles', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test("fits long provider content and keeps the provider dialog scrollable", async ({ page }) => {
  await installBackendMock(page, { longProvider: true });
  await page.goto('/#/settings');
  const table = page.getByRole('table', { name: 'LLM Providers' });
  await expect(table).toBeVisible();
  await expectInViewport(page, table.getByRole('button', { name: 'Edit', exact: true }));
  await expectNoHorizontalPageOverflow(page);

  const add = page.getByRole('button', { name: 'Add Provider' });
  await add.click();
  const dialog = page.getByRole('dialog', { name: 'Add Provider' });
  await expectInViewport(page, dialog);
  await expect(dialog.getByRole('textbox', { name: 'Display Name' })).toBeFocused();
  await expectInViewport(page, dialog.getByRole('button', { name: 'Save Changes' }));
  await dialog.getByRole('textbox', { name: 'Model Name' }).scrollIntoViewIfNeeded();
  await expectInViewport(page, dialog.getByRole('textbox', { name: 'Model Name' }));
  await expect(page).toHaveScreenshot('provider-dialog.png');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(add).toBeFocused();
});

test("preserves glossary input on failure and restores keyboard focus", async ({ page }) => {
  await installBackendMock(page);
  await page.route(`${backendOrigin}/api/v1/glossary/`, async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 503, json: { detail: 'Temporarily unavailable' } });
    } else {
      await route.fulfill({ json: [] });
    }
  });
  await page.goto('/#/translator');
  const trigger = page.getByRole('button', { name: 'Glossary', exact: true });
  await trigger.click();
  const panel = page.getByRole('complementary', { name: 'Glossary' });
  const source = panel.getByRole('textbox', { name: 'Source', exact: true });
  await expect(source).toBeFocused();
  await expect(panel.getByRole('button', { name: 'Add Term' })).toBeDisabled();
  await source.fill('MediaFlow');
  await panel.getByRole('textbox', { name: 'Target', exact: true }).fill('媒体工作站');
  await panel.getByRole('textbox', { name: 'Target', exact: true }).press('Enter');
  await expect(panel.getByRole('alert')).toContainText('Could not save the term');
  await expect(source).toHaveValue('MediaFlow');
  await source.focus();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test("treats audio-only quality as an audio download workflow", async ({ page }) => {
  await openReadyDownloader(page);

  await page.getByRole("combobox", { name: /Quality/ }).selectOption("audio");

  await expect(page.getByRole("combobox", { name: /Format/ })).toHaveValue("audio");
  await expect(page.getByRole("checkbox", { name: /Subtitles/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Compatible" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Download Audio" })).toBeVisible();
});

test("localizes CUDA diagnostics and uses a specific smart-split save action", async ({ page }) => {
  await installBackendMock(page, { language: "zh" });
  await page.goto("/#/settings");

  await expect(page.getByRole("heading", { name: "设置" })).toBeVisible();
  await page.getByRole("button", { name: "通用设置" }).click();
  await expect(page.getByRole("button", { name: "保存智能分割长度" })).toBeVisible();

  const cliPath = page.getByRole('textbox', { name: /faster-whisper-xxl\.exe/ });
  await cliPath.scrollIntoViewIfNeeded();
  await expectInViewport(page, cliPath);
  await expect(page).toHaveScreenshot('settings-general.png');

  await page.getByRole("button", { name: "CUDA 就绪检查" }).click();
  await expect(
    page.getByText("CUDA 环境已就绪，可以使用内置 faster-whisper 的 GPU 转写。"),
  ).toBeVisible();
  await expect(page.getByText("NVIDIA 驱动", { exact: true })).toBeVisible();
  await expect(page.getByText("已检测到 NVIDIA GeForce RTX E2E。", { exact: true })).toBeVisible();
  await expect(page.getByText("查看原始诊断详情", { exact: true })).toBeVisible();
  await expect(
    page.getByText("CUDA is ready for built-in faster-whisper transcription.", { exact: true }),
  ).toBeHidden();
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
    .locator("header")
    .getByRole("button", { name: /Translate/i })
    .click();

  await expect(page.locator("textarea")).toHaveValue("Playwright 已显示翻译结果");
  await expect(page).toHaveScreenshot('translator-completed.png');
});
