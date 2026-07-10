import type { Task } from "../../../types/task";
import { executionService } from "../../domain";
import type { RetryHandler, RetrySubmission } from "./types";
import {
  createRetryDescriptor,
  getRequestParams,
  getTaskMediaReference,
  readRecord,
} from "./taskParams";

function normalizeSynthesisTaskParams(task: Task) {
  const params = getRequestParams(task);
  if (!params) {
    return null;
  }

  const optionsFromParams = readRecord(params.options);
  const options =
    optionsFromParams ??
    Object.fromEntries(
      Object.entries(params).filter(
        ([key]) =>
          ![
            "task_id",
            "video_ref",
            "srt_ref",
            "watermark_path",
            "output_ref",
            "options",
          ].includes(key),
      ),
    );

  return {
    params,
    options,
    watermarkPath: typeof params.watermark_path === "string" ? params.watermark_path : null,
    outputRef: getTaskMediaReference(params, ["output_ref"], "video/mp4"),
  };
}

async function submitSynthesizeRetry(task: Task): Promise<RetrySubmission | null> {
  const normalized = normalizeSynthesisTaskParams(task);
  if (!normalized) {
    return null;
  }
  const { params, options, watermarkPath, outputRef } = normalized;

  const videoRef = getTaskMediaReference(params, ["video_ref"], "video/mp4");
  const srtRef = getTaskMediaReference(
    params,
    ["srt_ref"],
    "application/x-subrip",
  );
  const skipSubtitles = options.skip_subtitles === true;
  if (!videoRef?.path || (!skipSubtitles && !srtRef?.path)) {
    return null;
  }

  const outcome = await executionService.synthesize({
    video_ref: videoRef,
    srt_ref: srtRef ?? null,
    watermark_path: watermarkPath ?? null,
    output_ref: outputRef ?? null,
    options,
  });

  return {
    outcome,
    descriptor: createRetryDescriptor(
      task.type,
      {
        video_ref: videoRef,
        srt_ref: srtRef ?? null,
        ...(watermarkPath !== undefined
          ? { watermark_path: watermarkPath }
          : {}),
        ...(outputRef
          ? { output_ref: outputRef }
          : {}),
        options,
      },
      task.name,
      task.created_at,
    ),
  };
}

export const synthesisRetryHandler: RetryHandler = {
  accepts: (task) => task.type === "synthesis",
  submit: submitSynthesizeRetry,
};
