import { beforeEach, describe, expect, it, vi } from "vitest";

import { executionService } from "../services/domain/executionService";
import { createMockUserSettings } from "./testUtils/mockUserSettings";
import {
  normalizeTranscribeResultMediaReferences,
} from "../services/tasks/resultMediaReferences";
import { normalizeTranscribeResult } from "../services/ui/transcribeResult";
import { apiClient } from "../api/client";
import type { TaskResponse } from "../types/api";
import { TASK_CONTRACT_VERSION } from "../contracts/runtimeContracts";

const apiClientMock = {
  getSettings: vi.spyOn(apiClient, "getSettings"),
  runPipeline: vi.spyOn(apiClient, "runPipeline"),
  startTranslation: vi.spyOn(apiClient, "startTranslation"),
  synthesizeVideo: vi.spyOn(apiClient, "synthesizeVideo"),
};

vi.mock("../services/desktop", () => ({
  isDesktopRuntime: vi.fn(() => false),
  requireDesktopApiMethod: vi.fn(),
}));

const backendReceipt = (task_id: string): TaskResponse => ({
  task_id,
  status: "pending",
  task_source: "backend",
  task_contract_version: TASK_CONTRACT_VERSION,
  persistence_scope: "runtime",
  lifecycle: "resumable",
  queue_state: "queued",
  queue_position: null,
  primary_operation: "pipeline",
  message_code: "queued",
  message_params: {},
});

describe("service media contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClientMock.getSettings.mockResolvedValue(createMockUserSettings());
    apiClientMock.synthesizeVideo.mockResolvedValue(backendReceipt("task-synthesize"));
    apiClientMock.runPipeline.mockResolvedValue(backendReceipt("task-transcribe"));
    apiClientMock.startTranslation.mockResolvedValue(backendReceipt("task-translate"));
  });

  it("keeps video and subtitle refs in backend synthesis submissions", async () => {
    await executionService.synthesize({
      video_ref: {
        path: "E:/canonical/source.mp4",
        name: "source.mp4",
        media_kind: "video",
        role: "source",
        origin: "navigation",
      },
      srt_ref: {
        path: "E:/canonical/source.srt",
        name: "source.srt",
        media_kind: "subtitle",
        role: "context",
        origin: "task",
      },
      watermark_ref: {
        path: "E:/canonical/watermark.png",
        name: "watermark.png",
        media_kind: "image",
        role: "context",
      },
      output_ref: {
        path: "E:/out/burned.mp4",
        name: "burned.mp4",
        role: "output",
      },
      options: {},
    });

    expect(apiClientMock.synthesizeVideo).toHaveBeenCalledWith(expect.objectContaining({
      video_ref: expect.objectContaining({
        path: "E:/canonical/source.mp4",
        name: "source.mp4",
        media_kind: "video",
        role: "source",
        origin: "navigation",
      }),
      srt_ref: expect.objectContaining({
        path: "E:/canonical/source.srt",
        name: "source.srt",
        media_kind: "subtitle",
        role: "context",
        origin: "task",
      }),
      watermark_ref: expect.objectContaining({
        path: "E:/canonical/watermark.png",
        name: "watermark.png",
        media_kind: "image",
        role: "context",
      }),
      output_ref: expect.objectContaining({
        path: "E:/out/burned.mp4",
        name: "burned.mp4",
        role: "output",
      }),
      options: {},
    }));
    expect(apiClientMock.synthesizeVideo.mock.calls[0]?.[0]).not.toHaveProperty("video_path");
    expect(apiClientMock.synthesizeVideo.mock.calls[0]?.[0]).not.toHaveProperty("srt_path");
  });

  it("submits a subtitle-free video export through the same synthesis boundary", async () => {
    await executionService.synthesize({
      video_ref: {
        path: "E:/canonical/source.mp4",
        name: "source.mp4",
        media_kind: "video",
        role: "source",
      },
      srt_ref: null,
      watermark_ref: null,
      output_ref: {
        path: "E:/out/exported.mp4",
        name: "exported.mp4",
        role: "output",
      },
      options: { skip_subtitles: true },
    });

    expect(apiClientMock.synthesizeVideo).toHaveBeenCalledWith(expect.objectContaining({
      srt_ref: null,
      options: { skip_subtitles: true },
    }));
  });

  it("keeps ref-first transcribe and translate submissions until the execution adapter resolves paths", async () => {
    await executionService.transcribe({
      audio_ref: {
        path: "E:/canonical/source.mp4",
        name: "source.mp4",
        media_kind: "video",
        role: "source",
        origin: "navigation",
      },
      task_name: "Transcribe source.mp4",
      model: "base",
      device: "cpu",
    });

    expect(apiClientMock.runPipeline).toHaveBeenCalledWith({
      pipeline_id: "transcriber_tool",
      task_name: "Transcribe source.mp4",
      steps: [
        {
          step_name: "transcribe",
          params: {
            audio_ref: expect.objectContaining({
              path: "E:/canonical/source.mp4",
              name: "source.mp4",
              media_kind: "video",
              role: "source",
              origin: "navigation",
            }),
            engine: "builtin",
            model: "base",
            device: "cpu",
          },
        },
      ],
    });
    expect(apiClientMock.runPipeline.mock.calls[0]?.[0].steps[0].params).not.toHaveProperty("audio_path");

    await executionService.translate({
      segments: [],
      target_language: "SimplifiedChinese",
      mode: "standard",
      context_ref: {
        path: "E:/canonical/source.srt",
        name: "source.srt",
        media_kind: "subtitle",
        role: "context",
        origin: "task",
      },
    });
    expect(apiClientMock.startTranslation.mock.calls[0]?.[0]).not.toHaveProperty("context_path");

    expect(apiClientMock.startTranslation).toHaveBeenCalledWith(expect.objectContaining({
      segments: [],
      target_language: "SimplifiedChinese",
      mode: "standard",
      context_ref: expect.objectContaining({
        path: "E:/canonical/source.srt",
        name: "source.srt",
        media_kind: "subtitle",
        role: "context",
        origin: "task",
      }),
    }));
  });

  it("preserves typed download params when applying execution settings", async () => {
    await executionService.download(
      {
        pipeline_id: "downloader_tool",
        steps: [
          {
            step_name: "download",
            params: {
              url: "https://example.com/video",
              resolution: "1080",
            },
          },
        ],
      },
      {
        default_download_path: "D:/MediaFlow Downloads",
        auto_execute_flow: false,
      },
    );

    expect(apiClientMock.runPipeline).toHaveBeenCalledWith({
      pipeline_id: "downloader_tool",
      steps: [
        {
          step_name: "download",
          params: {
            url: "https://example.com/video",
            resolution: "1080",
            output_dir: "D:/MediaFlow Downloads",
          },
        },
      ],
    });
  });

  it("normalizes task results into structured media refs before UI consumption", () => {
    expect(
      normalizeTranscribeResult(
        {
          segments: [],
          text: "",
          language: "en",
          subtitle_ref: {
            path: "E:/canonical/source.srt",
            name: "source.srt",
          },
        },
        {
          path: "E:/canonical/source.mp4",
          name: "source.mp4",
          media_kind: "video",
          role: "source",
          origin: "navigation",
        },
      ),
    ).toMatchObject({
      video_ref: {
        path: "E:/canonical/source.mp4",
        name: "source.mp4",
        media_kind: "video",
        role: "source",
        origin: "navigation",
      },
      subtitle_ref: {
        path: "E:/canonical/source.srt",
        name: "source.srt",
      },
    });

  });

  it("uses shared result media reference normalization as the single source", () => {
    expect(
      normalizeTranscribeResultMediaReferences(
        {
          segments: [],
          text: "",
          language: "en",
          subtitle_ref: {
            path: "E:/canonical/source.srt",
            name: "source.srt",
          },
        },
        {
          path: "E:/canonical/source.mp4",
          name: "source.mp4",
          media_kind: "video",
          role: "source",
          origin: "navigation",
        },
      ),
    ).toMatchObject({
      video_ref: {
        path: "E:/canonical/source.mp4",
        name: "source.mp4",
        media_kind: "video",
        role: "source",
        origin: "navigation",
      },
      subtitle_ref: {
        path: "E:/canonical/source.srt",
        name: "source.srt",
      },
    });

  });

  it("does not synthesize subtitle refs without structured refs", () => {
    expect(
      normalizeTranscribeResultMediaReferences(
        {
          segments: [],
          text: "",
          language: "en",
        },
        {
          path: "E:/canonical/source.mp4",
          name: "source.mp4",
        },
      ),
    ).toMatchObject({
      video_ref: {
        path: "E:/canonical/source.mp4",
        name: "source.mp4",
      },
      subtitle_ref: null,
    });

  });

  it("does not expose audio-only transcribe sources as video refs", () => {
    expect(
      normalizeTranscribeResultMediaReferences(
        {
          segments: [],
          text: "",
          language: "en",
          subtitle_ref: {
            path: "E:/canonical/source.srt",
            name: "source.srt",
          },
        },
        {
          path: "E:/canonical/source.mp3",
          name: "source.mp3",
          media_kind: "audio",
          type: "audio/mpeg",
        },
      ),
    ).toMatchObject({
      video_ref: null,
      subtitle_ref: {
        path: "E:/canonical/source.srt",
        name: "source.srt",
      },
    });
  });

  it("treats transport stream transcribe sources as video refs", () => {
    expect(
      normalizeTranscribeResultMediaReferences(
        {
          segments: [],
          text: "",
          language: "en",
          subtitle_ref: {
            path: "E:/canonical/source.srt",
            name: "source.srt",
          },
        },
        {
          path: "E:/canonical/source.ts",
          name: "source.ts",
        },
      ),
    ).toMatchObject({
      video_ref: {
        path: "E:/canonical/source.ts",
        name: "source.ts",
      },
      subtitle_ref: {
        path: "E:/canonical/source.srt",
        name: "source.srt",
      },
    });
  });
});
