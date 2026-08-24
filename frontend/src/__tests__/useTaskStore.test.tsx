import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BACKEND_TASK_CONTRACT_FIELDS } from "./testFixtures";

import { useTaskStore } from "../hooks/tasks/useTaskStore";
import { SUPPORTED_TASK_CONTRACT_VERSION } from "../context/taskSources/shared";

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
        stream_id: "test-stream",
        sequence: 1,
        task: {
          ...BACKEND_TASK_CONTRACT_FIELDS,
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
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { result } = renderHook(() => useTaskStore());

    act(() => {
      result.current.applyMessage({
        type: "snapshot",
        stream_id: "test-stream",
        sequence: 1,
        tasks: [
          {
            ...BACKEND_TASK_CONTRACT_FIELDS,
            id: "task-supported",
            type: "pipeline",
            status: "pending",
            progress: 0,
            created_at: 2,
            task_contract_version: SUPPORTED_TASK_CONTRACT_VERSION,
          },
          {
            ...BACKEND_TASK_CONTRACT_FIELDS,
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
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects out-of-order socket events and stale HTTP task responses", () => {
    const { result } = renderHook(() => useTaskStore());
    const task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "ordered-task",
      type: "pipeline" as const,
      status: "running" as const,
      progress: 60,
      revision: 3,
      created_at: 3,
      task_contract_version: SUPPORTED_TASK_CONTRACT_VERSION,
    };

    act(() => {
      result.current.applyMessage({
        type: "update",
        task,
        stream_id: "ordered-stream",
        sequence: 2,
      });
      result.current.applyMessage({
        type: "update",
        task: { ...task, progress: 10, revision: 1 },
        stream_id: "ordered-stream",
        sequence: 1,
      });
      result.current.applyMessage({
        type: "merge_one",
        task: { ...task, progress: 20, revision: 2 },
      });
    });

    expect(result.current.tasks[0]?.progress).toBe(60);

    act(() => {
      result.current.applyMessage({
        type: "delete",
        task_id: task.id,
        revision: 4,
        stream_id: "ordered-stream",
        sequence: 3,
      });
      result.current.deleteTask(task.id);
      result.current.applyMessage({
        type: "merge_one",
        task,
      });
    });

    expect(result.current.tasks).toEqual([]);
  });

  it("does not notify subscribers for an identical equal-revision task", () => {
    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount += 1;
      return useTaskStore();
    });
    const task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "stable-task",
      type: "pipeline" as const,
      status: "running" as const,
      progress: 50,
      revision: 3,
      created_at: 3,
      task_contract_version: SUPPORTED_TASK_CONTRACT_VERSION,
    };

    act(() => {
      result.current.applyMessage({ type: "merge_one", task });
    });
    const renderCountAfterInsert = renderCount;

    act(() => {
      result.current.applyMessage({ type: "merge_one", task: { ...task } });
    });

    expect(renderCount).toBe(renderCountAfterInsert);
  });

  it("applies compact queue position updates without replacing task details", () => {
    const { result } = renderHook(() => useTaskStore());
    const queuedTask = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "queued-task",
      type: "pipeline" as const,
      status: "pending" as const,
      queue_state: "queued" as const,
      queue_position: 3,
      progress: 0,
      revision: 1,
      created_at: 1,
      task_contract_version: SUPPORTED_TASK_CONTRACT_VERSION,
      request_params: {
        pipeline_id: "queued-task-pipeline",
        steps: [
          {
            step_name: "download" as const,
            params: { url: "https://example.com/video" },
          },
        ],
      },
    };

    act(() => {
      result.current.applyMessage({ type: "merge_one", task: queuedTask });
      result.current.applyMessage({
        type: "queue_positions",
        positions: { "queued-task": 1 },
        stream_id: "queue-stream",
        sequence: 1,
      });
    });

    expect(result.current.tasks[0]?.queue_position).toBe(1);
    expect(result.current.tasks[0]?.request_params).toEqual(queuedTask.request_params);
  });
});
