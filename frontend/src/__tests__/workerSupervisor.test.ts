/* @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChildProcess } from "child_process";

vi.mock("electron", () => ({
  app: {
    getPath: () => "D:/Code/MediaFlow/.tmp/test-user-data",
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
}));

import { DesktopTaskHistoryStore } from "../../electron/desktop/historyStore";
import { DesktopWorkerSupervisor } from "../../electron/desktop/workerSupervisor";
import type { DesktopWorkerProcessFactory } from "../../electron/desktop/workerProcess";
import type { Task } from "../types/task";

const WORKER_PREFIX = "__MEDIAFLOW_WORKER__";

class FakeDesktopWorker {
  readonly pid: number;
  exitCode: number | null = null;
  private readonly callbacks: Parameters<DesktopWorkerProcessFactory>[0];
  readonly writes: Array<{ id: string; command: string; payload: Record<string, unknown> }> = [];
  readonly stdin = {
    writable: true,
    write: (line: string) => {
      this.writes.push(JSON.parse(line));
      return true;
    },
  };

  constructor(
    pid: number,
    callbacks: Parameters<DesktopWorkerProcessFactory>[0],
  ) {
    this.pid = pid;
    this.callbacks = callbacks;
  }

  ready() {
    this.callbacks.onLine(`${WORKER_PREFIX}${JSON.stringify({ type: "ready" })}`);
  }

  respond(id: string, result: unknown = { success: true }) {
    this.callbacks.onLine(
      `${WORKER_PREFIX}${JSON.stringify({
        type: "response",
        id,
        ok: true,
        result,
      })}`,
    );
  }

  close(code: number | null = null) {
    this.exitCode = code;
    this.callbacks.onClose(code);
  }
}

class MemoryDesktopTaskHistoryStore extends DesktopTaskHistoryStore {
  private memoryTasks: Task[] = [];

  override ensureLoaded() {}

  override list() {
    return [...this.memoryTasks];
  }

  override get(taskId: string) {
    return this.memoryTasks.find((task) => task.id === taskId) ?? null;
  }

  override upsert(task: Task) {
    this.memoryTasks = [task, ...this.memoryTasks.filter((existingTask) => existingTask.id !== task.id)];
  }

  override remove(taskId: string) {
    const nextTasks = this.memoryTasks.filter((task) => task.id !== taskId);
    if (nextTasks.length === this.memoryTasks.length) {
      return false;
    }
    this.memoryTasks = nextTasks;
    return true;
  }
}

function createHarness() {
  const workers: FakeDesktopWorker[] = [];
  const processFactory: DesktopWorkerProcessFactory = (callbacks) => {
    const worker = new FakeDesktopWorker(9000 + workers.length, callbacks);
    workers.push(worker);
    return worker as unknown as ChildProcess;
  };

  const supervisor = new DesktopWorkerSupervisor(new MemoryDesktopTaskHistoryStore(), processFactory);
  return { supervisor, workers };
}

describe("DesktopWorkerSupervisor slot scheduler", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.MEDIAFLOW_DESKTOP_TASK_MAX_CONCURRENT = "2";
  });

  it("dispatches tracked desktop tasks to bounded concurrent task slots", () => {
    const { supervisor, workers } = createHarness();

    void supervisor.request("transcribe", { task_id: "task-a", audio_path: "D:/a.mp4" });
    void supervisor.request("translate", { task_id: "task-b", context_path: "D:/b.srt" });
    void supervisor.request("download", { task_id: "task-c", url: "https://example.test/video" });

    workers[0].ready();
    workers[1].ready();

    expect(workers[0].writes).toHaveLength(1);
    expect(workers[0].writes[0]).toMatchObject({ id: "task-a", command: "transcribe" });
    expect(workers[1].writes).toHaveLength(1);
    expect(workers[1].writes[0]).toMatchObject({ id: "task-b", command: "translate" });
    expect(supervisor.listTasks().find((task) => task.id === "task-c")).toMatchObject({
      status: "pending",
      queue_position: 1,
    });

    workers[0].respond("task-a");

    expect(workers[0].writes).toHaveLength(2);
    expect(workers[0].writes[1]).toMatchObject({ id: "task-c", command: "download" });
  });

  it("cancels only the task slot assigned to the cancelled task", async () => {
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    const { supervisor, workers } = createHarness();

    const first = supervisor.request("transcribe", { task_id: "task-a", audio_path: "D:/a.mp4" }).catch(
      (error) => error,
    );
    const second = supervisor.request("translate", { task_id: "task-b", context_path: "D:/b.srt" });

    workers[0].ready();
    workers[1].ready();

    await supervisor.cancelTask("task-a");

    expect(killSpy).toHaveBeenCalledWith(workers[0].pid, "SIGTERM");
    expect(killSpy).not.toHaveBeenCalledWith(workers[1].pid, "SIGTERM");

    workers[1].respond("task-b", { segments: [], subtitle_ref: "D:/b.out.srt" });
    await expect(second).resolves.toBeTruthy();
    await expect(first).resolves.toBeInstanceOf(Error);
  });

  it("keeps control commands responsive while tracked tasks are running", async () => {
    const { supervisor, workers } = createHarness();

    void supervisor.request("transcribe", { task_id: "task-a", audio_path: "D:/a.mp4" });
    workers[0].ready();

    const settings = supervisor.request("get_settings", {});
    workers[2].ready();

    expect(workers[0].writes[0]).toMatchObject({ command: "transcribe" });
    expect(workers[2].writes[0]).toMatchObject({ command: "get_settings" });

    workers[2].respond(workers[2].writes[0].id, { theme: "dark" });
    await expect(settings).resolves.toMatchObject({ theme: "dark" });
  });

  it("routes utility commands away from the control slot", async () => {
    const { supervisor, workers } = createHarness();

    const utility = supervisor.request("update_yt_dlp", {});
    workers[0].ready();

    const control = supervisor.request("get_settings", {});
    workers[1].ready();

    expect(workers[0].writes[0]).toMatchObject({ command: "update_yt_dlp" });
    expect(workers[1].writes[0]).toMatchObject({ command: "get_settings" });

    workers[1].respond(workers[1].writes[0].id, { language: "zh" });
    await expect(control).resolves.toMatchObject({ language: "zh" });

    workers[0].respond(workers[0].writes[0].id, { updated: true });
    await expect(utility).resolves.toMatchObject({ updated: true });
  });
});
