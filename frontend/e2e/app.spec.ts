import { expect, test, type Page } from "@playwright/test";

const backendOrigin = "http://127.0.0.1:8800";
const taskSocketUrl = "ws://127.0.0.1:8800/api/v1/ws/tasks";

type BackendMockOptions = {
  analyzeFailure?: boolean;
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

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ detail: `Unexpected E2E request: ${request.method()} ${pathname}` }),
    });
  });

  await page.routeWebSocket(taskSocketUrl, (socket) => {
    const snapshotTimer = setTimeout(() => {
      socket.send(JSON.stringify({ type: "snapshot", tasks: [] }));
    }, 25);

    socket.onClose(() => clearTimeout(snapshotTimer));
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
