import { beforeEach, describe, expect, it, vi } from "vitest";

import { executionService } from "../services/domain/executionService";
import { preprocessingService } from "../services/domain/preprocessingService";
import { createMockUserSettings } from "./testUtils/mockUserSettings";
import {
  normalizeTranscribeResultMediaReferences,
} from "../services/tasks/resultMediaReferences";
import { normalizeTranscribeResult } from "../services/ui/transcribeResult";

const apiClientMock = vi.hoisted(() => ({
  getSettings: vi.fn(),
  runPipeline: vi.fn(),
  startTranslation: vi.fn(),
  synthesizeVideo: vi.fn(),
  extractText: vi.fn(),
  getOcrResults: vi.fn(),
  getPeaks: vi.fn(),
  enhanceVideo: vi.fn(),
  cleanVideo: vi.fn(),
}));

vi.mock("../api/client", () => ({
  apiClient: apiClientMock,
}));

vi.mock("../services/desktop", () => ({
  isDesktopRuntime: vi.fn(() => false),
  requireDesktopApiMethod: vi.fn(),
}));

describe("service media contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClientMock.getSettings.mockResolvedValue(createMockUserSettings());
    apiClientMock.synthesizeVideo.mockResolvedValue({
      task_id: "task-synthesize",
      status: "pending",
    });
    apiClientMock.runPipeline.mockResolvedValue({
      task_id: "task-transcribe",
      status: "pending",
    });
    apiClientMock.startTranslation.mockResolvedValue({
      task_id: "task-translate",
      status: "pending",
    });
    apiClientMock.extractText.mockResolvedValue({
      task_id: "task-extract",
      status: "pending",
    });
    apiClientMock.getOcrResults.mockResolvedValue({
      events: [],
    });
    apiClientMock.getPeaks.mockResolvedValue(new ArrayBuffer(8));
    apiClientMock.enhanceVideo.mockResolvedValue({
      task_id: "task-enhance",
      status: "pending",
    });
    apiClientMock.cleanVideo.mockResolvedValue({
      task_id: "task-clean",
      status: "pending",
    });
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
      watermark_path: null,
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
      watermark_path: null,
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

  it("keeps structured video refs in preprocessing submissions", async () => {
    await preprocessingService.extractText({
      video_ref: {
        path: "E:/canonical/source.mp4",
        name: "source.mp4",
        media_kind: "video",
        role: "source",
        origin: "navigation",
      },
      engine: "rapid",
    });

    expect(apiClientMock.extractText).toHaveBeenCalledWith(expect.objectContaining({
      video_ref: expect.objectContaining({
        path: "E:/canonical/source.mp4",
        name: "source.mp4",
        media_kind: "video",
        role: "source",
        origin: "navigation",
      }),
      engine: "rapid",
    }));
    expect(apiClientMock.extractText.mock.calls[0]?.[0]).not.toHaveProperty("video_path");
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
            vad_filter: true,
          },
        },
      ],
    });
    expect(apiClientMock.runPipeline.mock.calls[0]?.[0].steps[0].params).not.toHaveProperty("audio_path");

    await executionService.translate({
      segments: [],
      target_language: "Chinese",
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
      target_language: "Chinese",
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

  it("resolves canonical refs for query-style media lookups", async () => {
    await preprocessingService.getOcrResults({
      video_ref: {
        path: "E:/canonical/source.mp4",
        name: "source.mp4",
        media_kind: "video",
        role: "source",
        origin: "navigation",
      },
    });

    expect(apiClientMock.getOcrResults).toHaveBeenCalledWith(
      expect.objectContaining({ path: "E:/canonical/source.mp4" }),
    );
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
          output_ref: {
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
          output_ref: {
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
});
