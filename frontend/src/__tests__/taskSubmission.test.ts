import { describe, expect, it } from "vitest";

import {
  createTaskFromSubmissionReceipt,
  createTaskExecutionSubmissionReceipt,
} from "../services/domain/taskSubmission";

describe("taskSubmission", () => {
  it("builds backend task skeletons from submission metadata", () => {
    const task = createTaskFromSubmissionReceipt({
      receipt: createTaskExecutionSubmissionReceipt({
        task_id: "backend-task-1",
        status: "running",
        message: "Working",
        task_source: "backend",
        task_contract_version: 2,
        persistence_scope: "runtime",
        lifecycle: "resumable",
        queue_state: "running",
        queue_position: null,
        primary_operation: "translate",
      }),
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
      primary_operation: "translate",
      request_params: {
        context_path: "E:/video.srt",
      },
    });
  });
});
