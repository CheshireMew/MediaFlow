import type { PipelineRequest } from "../../../types/api";
import type { Task } from "../../../types/task";
import { executionService, settingsService } from "../../domain";
import type { RetryHandler, RetrySubmission } from "./types";
import {
  createRetryDescriptor,
  getPipelineStep,
  getPipelineSteps,
  getRequestParams,
  resolveRetryTaskId,
} from "./taskParams";

async function submitDownloadRetry(task: Task): Promise<RetrySubmission | null> {
  const params = getRequestParams(task);
  if (!params) {
    return null;
  }

  const steps = getPipelineSteps(task);
  const pipeline: PipelineRequest =
    steps.length > 0
      ? {
          pipeline_id: typeof params.pipeline_id === "string" ? params.pipeline_id : "downloader_tool",
          task_name: task.name,
          steps: steps as PipelineRequest["steps"],
        }
      : {
          pipeline_id: "downloader_tool",
          task_name: task.name,
          steps: [
            {
              step_name: "download",
              params: Object.fromEntries(
                Object.entries({
                  url: params.url,
                  proxy: params.proxy,
                  output_dir: params.output_dir,
                  playlist_title: params.playlist_title,
                  playlist_items: params.playlist_items,
                  download_subs: params.download_subs,
                  resolution: params.resolution,
                  cookie_file: params.cookie_file,
                  filename: params.filename,
                  local_source: params.local_source,
                  codec: params.codec,
                }).filter(([, value]) => value !== undefined),
              ),
            },
          ],
        };

  const downloadParams = pipeline.steps[0]?.params;
  if (!downloadParams || typeof downloadParams.url !== "string" || !downloadParams.url.trim()) {
    return null;
  }

  const settings = await settingsService.getSettings().catch(() => undefined);
  const outcome = await executionService.download(
    pipeline,
    settings,
    resolveRetryTaskId(task),
  );

  return {
    outcome,
    descriptor: createRetryDescriptor(
      "download",
      {
        steps: pipeline.steps,
        ...(pipeline.steps[0]?.params ?? {}),
      },
      task.name,
      task.created_at,
    ),
  };
}

export const downloadRetryHandler: RetryHandler = {
  accepts: (task) => task.type === "download" || Boolean(getPipelineStep(task, "download")),
  submit: submitDownloadRetry,
};

