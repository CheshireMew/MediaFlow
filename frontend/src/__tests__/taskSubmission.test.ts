import { describe, expect, it } from "vitest";

import {
  createTaskFromSubmissionReceipt,
  createTaskExecutionSubmissionReceipt,
} from "../services/domain/taskSubmission";
import { TASK_CONTRACT_VERSION } from "../contracts/runtimeContracts";

describe("taskSubmission", () => {
  it("builds backend task skeletons from submission metadata", () => {
    const task = createTaskFromSubmissionReceipt({
      receipt: createTaskExecutionSubmissionReceipt({
        task_id: "backend-task-1",
        status: "running",
        message_code: "queued",
        message_params: {},
        task_source: "backend",
        task_contract_version: TASK_CONTRACT_VERSION,
        revision: 0,
        persistence_scope: "runtime",
        lifecycle: "resumable",
        queue_state: "running",
        queue_position: null,
        primary_operation: "translate",
      }),
      type: "pipeline",
      request_params: {
        pipeline_id: "translator_tool",
        steps: [{
          step_name: "translate",
          params: {
            context_ref: {
              path: "E:/video.srt",
              name: "video.srt",
            },
          },
        }],
      },
    });

    expect(task).toMatchObject({
      id: "backend-task-1",
      type: "pipeline",
      status: "running",
      task_source: "backend",
      lifecycle: "resumable",
      queue_state: "running",
      primary_operation: "translate",
      request_params: {
        pipeline_id: "translator_tool",
        steps: [{
          step_name: "translate",
          params: {
            context_ref: {
              path: "E:/video.srt",
              name: "video.srt",
            },
          },
        }],
      },
    });
  });
});
