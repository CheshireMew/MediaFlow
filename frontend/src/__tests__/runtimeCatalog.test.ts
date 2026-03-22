import { describe, expect, it } from "vitest";

import {
  backendHttpRuntimeCatalog,
  domainRuntimeCatalog,
  getRuntimeStrategy,
} from "../services/domain";

describe("runtimeCatalog", () => {
  it("marks desktop-first domain services explicitly", () => {
    expect(getRuntimeStrategy(domainRuntimeCatalog, "executionService", "transcribe")).toBe(
      "desktop-primary",
    );
    expect(getRuntimeStrategy(domainRuntimeCatalog, "editorService", "getPeaks")).toBe(
      "desktop-primary",
    );
    expect(getRuntimeStrategy(domainRuntimeCatalog, "settingsService", "getSettings")).toBe(
      "desktop-primary",
    );
  });

  it("marks remaining backend fallbacks explicitly", () => {
    expect(
      getRuntimeStrategy(domainRuntimeCatalog, "translationService", "startTranslation"),
    ).toBe("backend-fallback");
    expect(getRuntimeStrategy(backendHttpRuntimeCatalog, "taskApi", "pauseAllTasks")).toBe(
      "backend-fallback",
    );
  });

  it("keeps startup health checks in the web-only bucket", () => {
    expect(getRuntimeStrategy(backendHttpRuntimeCatalog, "startupApi", "checkHealth")).toBe(
      "web-only",
    );
  });
});
