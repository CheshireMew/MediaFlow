import { describe, expect, it, vi } from "vitest";

import {
  clearPersistenceFailure,
  reportPersistenceFailure,
  resetPersistenceHealthForTests,
  subscribePersistenceHealth,
} from "../services/persistence/persistenceHealth";

describe("persistence health", () => {
  it("deduplicates active failures and reports recovery", () => {
    resetPersistenceHealthForTests();
    const listener = vi.fn();
    const unsubscribe = subscribePersistenceHealth(listener);

    reportPersistenceFailure("workspace-write", new Error("disk full"));
    reportPersistenceFailure("workspace-write", new Error("disk full"));
    clearPersistenceFailure("workspace-write");

    expect(listener.mock.calls).toEqual([
      [{ scope: "workspace-write", status: "failed" }],
      [{ scope: "workspace-write", status: "recovered" }],
    ]);
    unsubscribe();
  });

  it("replays active failures to late UI subscribers", () => {
    resetPersistenceHealthForTests();
    reportPersistenceFailure("workspace-read", new Error("corrupt file"));
    const listener = vi.fn();

    subscribePersistenceHealth(listener);

    expect(listener).toHaveBeenCalledWith({
      scope: "workspace-read",
      status: "failed",
    });
  });
});
