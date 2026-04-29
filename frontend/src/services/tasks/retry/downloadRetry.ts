import type { DownloadStepRequest, PipelineRequest } from "../../../types/api";
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
              params: {
                url: typeof params.url === "string" ? params.url : "",
                ...(typeof params.proxy === "string" ? { proxy: params.proxy } : {}),
                ...(typeof params.output_dir === "string" ? { output_dir: params.output_dir } : {}),
                ...(typeof params.playlist_title === "string" ? { playlist_title: params.playlist_title } : {}),
                ...(typeof params.playlist_items === "string" ? { playlist_items: params.playlist_items } : {}),
                ...(typeof params.download_subs === "boolean" ? { download_subs: params.download_subs } : {}),
                ...(typeof params.resolution === "string" ? { resolution: params.resolution } : {}),
                ...(typeof params.cookie_file === "string" ? { cookie_file: params.cookie_file } : {}),
                ...(typeof params.filename === "string" ? { filename: params.filename } : {}),
                ...(typeof params.codec === "string" ? { codec: params.codec } : {}),
              },
            },
          ],
        };

  const downloadStep = pipeline.steps.find((step): step is DownloadStepRequest => step.step_name === "download");
  const downloadParams = downloadStep?.params;
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
