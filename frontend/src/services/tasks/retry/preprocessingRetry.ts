import type { OCRExtractRequest } from "../../../types/api";
import type { Task } from "../../../types/task";
import { preprocessingService } from "../../domain";
import type { RetryHandler, RetrySubmission } from "./types";
import {
  createRetryDescriptor,
  getRequestParams,
  getTaskMediaReference,
  isFiniteNumber,
  isRoiTuple,
  readOptionalString,
  resolveRetryTaskId,
} from "./taskParams";

type OcrEngine = OCRExtractRequest["engine"];

function isOcrEngine(value: unknown): value is OcrEngine {
  return value === "rapid" || value === "paddle";
}

async function submitExtractRetry(task: Task): Promise<RetrySubmission | null> {
  const params = getRequestParams(task);
  if (!params) {
    return null;
  }
  const videoRef = getTaskMediaReference(params, ["video_ref"], "video/mp4");
  if (!videoRef?.path) {
    return null;
  }
  const roi = isRoiTuple(params.roi) ? params.roi : undefined;
  const engine: OcrEngine = isOcrEngine(params.engine) ? params.engine : "rapid";
  const sampleRate = isFiniteNumber(params.sample_rate) ? params.sample_rate : undefined;
  const outcome = await preprocessingService.extractText({
    task_id: resolveRetryTaskId(task),
    video_ref: videoRef,
    roi,
    engine,
    sample_rate: sampleRate,
  });
  return {
    outcome,
    descriptor: createRetryDescriptor(
      "extract",
      {
        video_ref: videoRef,
        ...(roi ? { roi } : {}),
        engine,
        ...(sampleRate !== undefined ? { sample_rate: sampleRate } : {}),
      },
      task.name,
      task.created_at,
    ),
  };
}

async function submitEnhanceRetry(task: Task): Promise<RetrySubmission | null> {
  const params = getRequestParams(task);
  if (!params) {
    return null;
  }
  const videoRef = getTaskMediaReference(params, ["video_ref"], "video/mp4");
  if (!videoRef?.path) {
    return null;
  }
  const model = readOptionalString(params.model);
  const scale = readOptionalString(params.scale);
  const method = readOptionalString(params.method);
  const outcome = await preprocessingService.enhanceVideo({
    task_id: resolveRetryTaskId(task),
    video_ref: videoRef,
    model,
    scale,
    method,
  });
  return {
    outcome,
    descriptor: createRetryDescriptor(
      "enhancement",
      {
        video_ref: videoRef,
        ...(model !== undefined ? { model } : {}),
        ...(scale !== undefined ? { scale } : {}),
        ...(method !== undefined ? { method } : {}),
      },
      task.name,
      task.created_at,
    ),
  };
}

async function submitCleanRetry(task: Task): Promise<RetrySubmission | null> {
  const params = getRequestParams(task);
  if (!params) {
    return null;
  }
  const videoRef = getTaskMediaReference(params, ["video_ref"], "video/mp4");
  const roi = isRoiTuple(params.roi) ? params.roi : null;
  if (!videoRef?.path || !roi) {
    return null;
  }
  const method = readOptionalString(params.method);
  const outcome = await preprocessingService.cleanVideo({
    task_id: resolveRetryTaskId(task),
    video_ref: videoRef,
    roi,
    method,
  });
  return {
    outcome,
    descriptor: createRetryDescriptor(
      "cleanup",
      {
        video_ref: videoRef,
        roi,
        ...(method !== undefined ? { method } : {}),
      },
      task.name,
      task.created_at,
    ),
  };
}

export const preprocessingRetryHandlers: RetryHandler[] = [
  { accepts: (task) => task.type === "extract", submit: submitExtractRetry },
  { accepts: (task) => task.type === "enhancement", submit: submitEnhanceRetry },
  { accepts: (task) => task.type === "cleanup", submit: submitCleanRetry },
];

