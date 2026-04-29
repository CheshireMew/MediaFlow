import type { Task } from "../../../types/task";
import { executionService } from "../../domain";
import type { RetryHandler, RetrySubmission } from "./types";
import {
  createRetryDescriptor,
  getRequestParams,
  getTaskMediaReference,
  readOptionalString,
  readRecord,
  resolveRetryTaskId,
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
            "__desktop_worker",
            "task_id",
            "video_ref",
            "video_path",
            "subtitle_ref",
            "srt_ref",
            "context_ref",
            "srt_path",
            "watermark_path",
            "output_path",
            "options",
          ].includes(key),
      ),
    );

  return {
    params,
    options,
    watermarkPath: readOptionalString(params.watermark_path),
    outputPath: readOptionalString(params.output_path),
  };
}

async function submitSynthesizeRetry(task: Task): Promise<RetrySubmission | null> {
  const normalized = normalizeSynthesisTaskParams(task);
  if (!normalized) {
    return null;
  }
  const { params, options, watermarkPath, outputPath } = normalized;

  const videoRef = getTaskMediaReference(params, ["video_ref"], "video/mp4");
  const srtRef = getTaskMediaReference(
    params,
    ["srt_ref", "subtitle_ref", "context_ref"],
    "application/x-subrip",
  );
  if (!videoRef?.path || !srtRef?.path) {
    return null;
  }

  const outcome = await executionService.synthesize({
    task_id: resolveRetryTaskId(task),
    video_ref: videoRef,
    srt_ref: srtRef,
    watermark_path: watermarkPath ?? null,
    output_path: outputPath ?? null,
    options,
  });

  return {
    outcome,
    descriptor: createRetryDescriptor(
      task.type,
      {
        video_ref: videoRef,
        srt_ref: srtRef,
        ...(watermarkPath !== undefined
          ? { watermark_path: watermarkPath }
          : {}),
        ...(outputPath !== undefined
          ? { output_path: outputPath }
          : {}),
        options,
      },
      task.name,
      task.created_at,
    ),
  };
}

export const synthesisRetryHandler: RetryHandler = {
  accepts: (task) => task.type === "synthesize" || task.type === "synthesis",
  submit: submitSynthesizeRetry,
};

