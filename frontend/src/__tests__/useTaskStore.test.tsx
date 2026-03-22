import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useTaskStore } from "../hooks/tasks/useTaskStore";
import { SUPPORTED_TASK_CONTRACT_VERSION } from "../context/taskSources";

describe("useTaskStore", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("ignores incompatible task updates", () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { result } = renderHook(() => useTaskStore());

    act(() => {
      result.current.applyMessage({
        type: "update",
        task: {
          id: "task-unsupported",
          type: "pipeline",
          status: "pending",
          progress: 0,
          created_at: 1,
          task_contract_version: 99,
        },
      });
    });

    expect(result.current.tasks).toEqual([]);
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
  });

  it("filters incompatible tasks from snapshots while keeping supported ones", () => {
    const { result } = renderHook(() => useTaskStore());

    act(() => {
      result.current.applyMessage({
        type: "snapshot",
        tasks: [
          {
            id: "task-supported",
            type: "pipeline",
            status: "pending",
            progress: 0,
            created_at: 2,
            task_contract_version: SUPPORTED_TASK_CONTRACT_VERSION,
          },
          {
            id: "task-unsupported",
            type: "pipeline",
            status: "pending",
            progress: 0,
            created_at: 1,
            task_contract_version: 99,
          },
        ],
      });
    });

    expect(result.current.tasks.map((task) => task.id)).toEqual(["task-supported"]);
  });
});
