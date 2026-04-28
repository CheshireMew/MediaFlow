import { beforeEach, describe, expect, it, vi } from "vitest";

import { executionService } from "../services/domain/executionService";
import { preprocessingService } from "../services/domain/preprocessingService";
import { createMockUserSettings } from "./testUtils/mockUserSettings";
import {
  normalizeDirectTranscribeResult,
  normalizeDirectTranslateResult,
} from "../services/tasks/directResultMediaResolver";
import { normalizeTranscribeResult } from "../services/ui/transcribeResult";
import { normalizeTranslateResult } from "../services/ui/translateResult";

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
      output_path: "E:/out/burned.mp4",
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
      output_path: "E:/out/burned.mp4",
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
      video_path: "E:/workspace/source.mp4",
      video_ref: {
        path: "E:/canonical/source.mp4",
        name: "source.mp4",
        media_kind: "video",
        role: "source",
        origin: "navigation",
      },
    });

    expect(apiClientMock.getOcrResults).toHaveBeenCalledWith(
      "E:/canonical/source.mp4",
    );
  });

  it("normalizes direct results into structured media refs before UI consumption", () => {
    expect(
      normalizeTranscribeResult(
        {
          segments: [],
          text: "",
          language: "en",
          srt_path: "E:/canonical/source.srt",
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

    expect(
      normalizeTranslateResult(
        {
          segments: [],
          language: "Chinese",
          srt_path: "E:/canonical/output.srt",
          subtitle_ref: {
            path: "E:/canonical/output.srt",
            name: "output.srt",
          },
          output_ref: {
            path: "E:/canonical/output.srt",
            name: "output.srt",
          },
          mode: "standard",
        },
        {
          path: "E:/canonical/source.srt",
          name: "source.srt",
          media_kind: "subtitle",
          role: "context",
          origin: "task",
        },
      ),
    ).toMatchObject({
      context_ref: {
        path: "E:/canonical/source.srt",
        name: "source.srt",
        media_kind: "subtitle",
        role: "context",
        origin: "task",
      },
      subtitle_ref: {
        path: "E:/canonical/output.srt",
        name: "output.srt",
      },
    });
  });

  it("uses the shared direct-result resolver as the single media normalization source", () => {
    expect(
      normalizeDirectTranscribeResult(
        {
          segments: [],
          text: "",
          language: "en",
          srt_path: "E:/canonical/source.srt",
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

    expect(
      normalizeDirectTranslateResult(
        {
          segments: [],
          language: "Chinese",
          srt_path: "E:/canonical/output.srt",
          subtitle_ref: {
            path: "E:/canonical/output.srt",
            name: "output.srt",
          },
          output_ref: {
            path: "E:/canonical/output.srt",
            name: "output.srt",
          },
          mode: "standard",
        },
        {
          path: "E:/canonical/source.srt",
          name: "source.srt",
          media_kind: "subtitle",
          role: "context",
          origin: "task",
        },
      ),
    ).toMatchObject({
      context_ref: {
        path: "E:/canonical/source.srt",
        name: "source.srt",
        media_kind: "subtitle",
        role: "context",
        origin: "task",
      },
      subtitle_ref: {
        path: "E:/canonical/output.srt",
        name: "output.srt",
      },
    });
  });

  it("does not synthesize subtitle refs from direct-result srt_path once producers emit structured refs", () => {
    expect(
      normalizeDirectTranscribeResult(
        {
          segments: [],
          text: "",
          language: "en",
          srt_path: "E:/legacy/source.srt",
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

    expect(
      normalizeDirectTranslateResult(
        {
          segments: [],
          language: "Chinese",
          srt_path: "E:/legacy/output.srt",
          mode: "standard",
        },
        {
          path: "E:/canonical/source.srt",
          name: "source.srt",
        },
      ),
    ).toMatchObject({
      context_ref: {
        path: "E:/canonical/source.srt",
        name: "source.srt",
      },
      subtitle_ref: null,
    });
  });
});
