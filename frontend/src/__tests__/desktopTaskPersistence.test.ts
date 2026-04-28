/* @vitest-environment node */
import { describe, expect, it } from "vitest";
import type { Task } from "../types/task";
import {
  DESKTOP_TASK_PERSISTENCE_SCHEMA_VERSION,
  normalizePersistedDesktopTaskHistory,
  parsePersistedDesktopTaskHistory,
  serializePersistedDesktopTaskHistory,
} from "../../electron/desktopTaskPersistence";

function createDesktopTask(overrides: Partial<Task> = {}): Task {
  return {
    id: overrides.id ?? "task-1",
    type: overrides.type ?? "download",
    status: overrides.status ?? "completed",
    progress: overrides.progress ?? 100,
    created_at: overrides.created_at ?? 100,
    request_params: {
      __desktop_worker: true,
      ...(overrides.request_params ?? {}),
    },
    ...overrides,
  };
}

describe("desktopTaskPersistence", () => {
  it("persists only terminal desktop history tasks", () => {
    const history = normalizePersistedDesktopTaskHistory([
      createDesktopTask({ id: "completed-1", status: "completed", created_at: 2 }),
      createDesktopTask({ id: "failed-1", status: "failed", created_at: 3 }),
      createDesktopTask({ id: "pending-1", status: "pending", created_at: 4 }),
      {
        ...createDesktopTask({ id: "remote-1", created_at: 5 }),
        request_params: { url: "https://example.com/video" },
      },
    ]);

    expect(history.map((task) => task.id)).toEqual(["failed-1", "completed-1"]);
    expect(history.every((task) => task.persistence_scope === "history")).toBe(true);
    expect(history.every((task) => task.lifecycle === "history-only")).toBe(true);
  });

  it("serializes persisted desktop history with explicit runtime policy", () => {
    const serialized = serializePersistedDesktopTaskHistory([
      createDesktopTask({ id: "done-1", created_at: 123 }),
    ]);
    const parsed = JSON.parse(serialized) as {
      schema_version: number;
      runtime_policy: Record<string, string>;
      history: Array<{ record_type: string; task: Task }>;
    };

    expect(parsed.schema_version).toBe(DESKTOP_TASK_PERSISTENCE_SCHEMA_VERSION);
    expect(parsed.runtime_policy).toEqual({
      active_tasks: "runtime-only",
      paused_tasks: "runtime-only",
      queued_tasks: "runtime-only",
      history_tasks: "history-only",
    });
    expect(parsed.history).toHaveLength(1);
    expect(parsed.history[0]).toMatchObject({
      record_type: "history",
      task: { id: "done-1" },
    });
  });

  it("rejects history payloads without the current schema envelope", () => {
    const raw = JSON.stringify([
      createDesktopTask({ id: "done-1", status: "completed", created_at: 2 }),
    ]);

    expect(parsePersistedDesktopTaskHistory(raw)).toEqual([]);
  });
});
