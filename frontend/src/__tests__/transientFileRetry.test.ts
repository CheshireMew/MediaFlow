import { describe, expect, it, vi } from "vitest";

import { withTransientFileRetry } from "../../electron/persistence/transientFileRetry";

describe("transient file retry", () => {
  it("retries Windows file contention errors", async () => {
    const operation = vi.fn(async () => {
      if (operation.mock.calls.length < 3) {
        throw Object.assign(new Error("temporarily busy"), { code: "EBUSY" });
      }
      return "saved";
    });

    await expect(
      withTransientFileRetry(operation, { retryDelaysMs: [0, 0] }),
    ).resolves.toBe("saved");
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("does not hide permanent storage errors", async () => {
    const error = Object.assign(new Error("disk full"), { code: "ENOSPC" });
    const operation = vi.fn(async () => {
      throw error;
    });

    await expect(
      withTransientFileRetry(operation, { retryDelaysMs: [0, 0] }),
    ).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
