import { afterEach, describe, expect, it, vi } from "vitest";

import { executionService } from "../services/domain";
import { createTaskExecutionOutcome } from "../services/domain/taskSubmission";
import { synthesisRetryHandler } from "../services/tasks/retry/synthesisRetry";
import type { Task } from "../types/task";
import { TASK_CONTRACT_VERSION } from "../contracts/runtimeContracts";

function createFailedSynthesisTask(options: Record<string, unknown>): Task {
  return {
    id: "failed-synthesis",
    type: "synthesis",
    status: "failed",
    task_source: "backend",
    task_contract_version: TASK_CONTRACT_VERSION,
    revision: 0,
    persistence_scope: "runtime",
    lifecycle: "resumable",
    queue_state: "failed",
    queue_position: null,
    primary_operation: "synthesis",
    progress: 0,
    created_at: 1,
    message_code: "failed",
    message_params: {},
    request_params: {
      video_ref: {
        path: "D:/media/source.mp4",
        name: "source.mp4",
        media_kind: "video",
        role: "source",
      },
      options,
    },
  };
}

describe("synthesis retry", () => {
  afterEach(() => vi.restoreAllMocks());

  it("retries a subtitle-free export when skip_subtitles is enabled", async () => {
    const synthesize = vi.spyOn(executionService, "synthesize").mockResolvedValue(
      createTaskExecutionOutcome({
        task_id: "retry-synthesis",
        status: "pending",
        task_source: "backend",
        task_contract_version: TASK_CONTRACT_VERSION,
        revision: 0,
        persistence_scope: "runtime",
        lifecycle: "resumable",
        queue_state: "queued",
        queue_position: null,
        primary_operation: "synthesis",
        message_code: "queued",
        message_params: {},
      }),
    );

    const submission = await synthesisRetryHandler.submit(
      createFailedSynthesisTask({ skip_subtitles: true }),
    );

    expect(synthesize).toHaveBeenCalledWith(expect.objectContaining({
      srt_ref: null,
      options: { skip_subtitles: true },
    }));
    expect(submission?.descriptor.request_params).toMatchObject({
      srt_ref: null,
      options: { skip_subtitles: true },
    });
  });

  it("still requires a subtitle reference when subtitles are enabled", async () => {
    const synthesize = vi.spyOn(executionService, "synthesize");

    await expect(
      synthesisRetryHandler.submit(createFailedSynthesisTask({ skip_subtitles: false })),
    ).resolves.toBeNull();
    expect(synthesize).not.toHaveBeenCalled();
  });
});
