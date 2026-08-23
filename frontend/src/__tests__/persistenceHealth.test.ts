import { describe, expect, it, vi } from "vitest";

import {
  clearPersistenceFailure,
  PERSISTENCE_FAILURE_ALERT_DELAY_MS,
  reportPersistenceFailure,
  resetPersistenceHealthForTests,
  subscribePersistenceHealth,
} from "../services/persistence/persistenceHealth";

describe("persistence health", () => {
  it("deduplicates active failures and reports recovery", () => {
    vi.useFakeTimers();
    resetPersistenceHealthForTests();
    const listener = vi.fn();
    const unsubscribe = subscribePersistenceHealth(listener);

    reportPersistenceFailure("workspace-write", new Error("disk full"));
    reportPersistenceFailure("workspace-write", new Error("disk full"));
    expect(listener).not.toHaveBeenCalled();
    vi.advanceTimersByTime(PERSISTENCE_FAILURE_ALERT_DELAY_MS);
    clearPersistenceFailure("workspace-write");

    expect(listener.mock.calls).toEqual([
      [{ scope: "workspace-write", status: "failed" }],
      [{ scope: "workspace-write", status: "recovered" }],
    ]);
    unsubscribe();
    vi.useRealTimers();
  });

  it("replays active failures to late UI subscribers", () => {
    vi.useFakeTimers();
    resetPersistenceHealthForTests();
    reportPersistenceFailure("workspace-read", new Error("corrupt file"));
    vi.advanceTimersByTime(PERSISTENCE_FAILURE_ALERT_DELAY_MS);
    const listener = vi.fn();

    subscribePersistenceHealth(listener);

    expect(listener).toHaveBeenCalledWith({
      scope: "workspace-read",
      status: "failed",
    });
    vi.useRealTimers();
  });

  it("stays silent when a transient failure recovers during the grace period", () => {
    vi.useFakeTimers();
    resetPersistenceHealthForTests();
    const listener = vi.fn();
    subscribePersistenceHealth(listener);

    reportPersistenceFailure("workspace-write", new Error("file temporarily busy"));
    vi.advanceTimersByTime(PERSISTENCE_FAILURE_ALERT_DELAY_MS - 1);
    clearPersistenceFailure("workspace-write");
    vi.runAllTimers();

    expect(listener).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
