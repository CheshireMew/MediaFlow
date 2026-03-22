import { describe, expect, it } from "vitest";

import {
  createDesktopTaskSubmissionReceipt,
  createTaskFromSubmissionReceipt,
  createTaskExecutionSubmissionReceipt,
} from "../services/domain/taskSubmission";

describe("taskSubmission", () => {
  it("builds a desktop task skeleton with aligned local source metadata", () => {
    const task = createTaskFromSubmissionReceipt({
      receipt: createDesktopTaskSubmissionReceipt("desktop-task-1", "Queued"),
      type: "download",
      name: "Sample video",
      request_params: {
        url: "https://example.com/video",
      },
      created_at: 123,
    });

    expect(task).toMatchObject({
      id: "desktop-task-1",
      type: "download",
      status: "pending",
      task_source: "desktop",
      task_contract_version: 2,
      persistence_scope: "runtime",
      lifecycle: "runtime-only",
      queue_state: "queued",
      queue_position: null,
      name: "Sample video",
      message: "Queued",
      created_at: 123,
      request_params: {
        __desktop_worker: true,
        url: "https://example.com/video",
      },
    });
  });

  it("keeps backend submissions as backend tasks without desktop markers", () => {
    const task = createTaskFromSubmissionReceipt({
      receipt: createTaskExecutionSubmissionReceipt(
        {
          task_id: "backend-task-1",
          status: "running",
          message: "Working",
        },
        "backend",
      ),
      type: "translate",
      request_params: {
        context_path: "E:/video.srt",
      },
    });

    expect(task).toMatchObject({
      id: "backend-task-1",
      type: "translate",
      status: "running",
      task_source: "backend",
      lifecycle: "resumable",
      queue_state: "running",
      request_params: {
        context_path: "E:/video.srt",
      },
    });
    expect(task.request_params?.__desktop_worker).toBeUndefined();
  });
});
