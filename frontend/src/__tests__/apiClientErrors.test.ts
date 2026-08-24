/* @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiClient } from "../api/client";
import { toast } from "../utils/toast";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("apiClient transport errors", () => {
  it("throws a typed HTTP error without owning user notifications", async () => {
    const toastSpy = vi.spyOn(toast, "error");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({
        code: "request_validation_failed",
        message: "Invalid request",
        details: { field: "steps" },
      }),
      { status: 422, headers: { "content-type": "application/json" } },
    )));

    const error = await apiClient.listTasks().catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      endpoint: "/tasks/",
      kind: "http",
      status: 422,
      code: "request_validation_failed",
      details: { field: "steps" },
      message: "Invalid request",
    });
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it("distinguishes transport timeouts", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_, init: RequestInit) => (
      new Promise((_, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      })
    )));

    const pending = apiClient.listTasks().catch((caught) => caught);
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(pending).resolves.toMatchObject({
      endpoint: "/tasks/",
      kind: "timeout",
    });
  });
});
