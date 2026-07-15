import type { AnalyzeResult } from "../../api/client";
import type { PipelineRequest } from "../../types/api";
import type { Task } from "../../types/task";
import type { DownloadHistoryItem } from "../../stores/downloaderStore";
import { executionService, isDesktopRuntime } from "./executionService";
import { settingsService } from "./settingsService";
import i18n from "../../i18n";
import {
  createTaskFromExecutionOutcome,
  getExecutionSubmission,
} from "./taskSubmission";

export type DownloadQueueItem = {
  url: string;
  title?: string;
  index?: number;
};

export type DownloadExtraInfo = Record<string, unknown> & {
  title?: string;
  direct_src?: string;
};

type QueueDownloadItemsOptions = {
  items: DownloadQueueItem[];
  playlistTitle?: string;
  extraInfo?: DownloadExtraInfo;
  totalItemCount?: number;
  downloadSubs: boolean;
  resolution: string;
  codec: string;
  lastAnalysis: AnalyzeResult | null;
  remoteTasksReady: boolean;
  addTask: (task: Task) => void;
  addToHistory: (item: DownloadHistoryItem) => void;
};

function resolveDownloadFilename(
  item: DownloadQueueItem,
  itemCount: number,
  extraInfo: DownloadExtraInfo,
  lastAnalysis: AnalyzeResult | null,
) {
  if (item.title) {
    return item.title;
  }

  if (itemCount === 1) {
    if (extraInfo.title) {
      return extraInfo.title;
    }
    if (lastAnalysis?.title) {
      return lastAnalysis.title;
    }
  }

  if (item.url.includes("douyin.com")) {
    return `Douyin_Video_${Date.now()}`;
  }

  return undefined;
}

function buildDownloadPipeline({
  item,
  itemCount,
  playlistTitle,
  extraInfo,
  downloadSubs,
  resolution,
  codec,
  lastAnalysis,
}: {
  item: DownloadQueueItem;
  itemCount: number;
  playlistTitle?: string;
  extraInfo: DownloadExtraInfo;
  downloadSubs: boolean;
  resolution: string;
  codec: string;
  lastAnalysis: AnalyzeResult | null;
}): PipelineRequest {
  const customFilename = resolveDownloadFilename(
    item,
    itemCount,
    extraInfo,
    lastAnalysis,
  );
  const directUrl =
    typeof extraInfo.direct_src === "string" && extraInfo.direct_src
      ? extraInfo.direct_src
      : null;

  return {
    pipeline_id: "downloader_tool",
    task_name: customFilename,
    steps: [
      {
        step_name: "download",
        params: {
          url: directUrl || item.url,
          playlist_title: playlistTitle,
          playlist_items: item.index ? item.index.toString() : undefined,
          download_subs: downloadSubs,
          resolution,
          codec,
          ...extraInfo,
          filename: customFilename,
        },
      },
    ],
  };
}

export async function queueDownloadItems({
  items,
  playlistTitle,
  extraInfo,
  totalItemCount,
  downloadSubs,
  resolution,
  codec,
  lastAnalysis,
  remoteTasksReady,
  addTask,
  addToHistory,
}: QueueDownloadItemsOptions) {
  const downloadSettings = isDesktopRuntime()
    ? await settingsService.getSettings()
    : undefined;

  if (!downloadSettings && !remoteTasksReady) {
    throw new Error(i18n.t("feedback.backendNotReady", { ns: "downloader" }));
  }

  for (const item of items) {
    const finalExtraInfo: DownloadExtraInfo = { ...(extraInfo ?? {}) };
    const pipeline = buildDownloadPipeline({
      item,
      itemCount: totalItemCount ?? items.length,
      playlistTitle,
      extraInfo: finalExtraInfo,
      downloadSubs,
      resolution,
      codec,
      lastAnalysis,
    });
    const executionResult = downloadSettings
      ? await executionService.download(pipeline, downloadSettings)
      : await executionService.download(pipeline);
    const submission = getExecutionSubmission(executionResult);
    const taskName = pipeline.task_name ?? undefined;

    addTask(
      createTaskFromExecutionOutcome({
        outcome: executionResult,
        type: "pipeline",
        name: taskName,
        request_params: { ...pipeline },
      }),
    );
    addToHistory({
      id: submission.task_id,
      url: item.url,
      title: taskName || "Unknown Video",
      timestamp: Date.now(),
    });
  }
}
