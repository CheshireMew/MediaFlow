import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TranscriptionResults } from "../components/transcriber/TranscriptionResults";
import {
  createTranscriberEditorNavigationPayload,
  createTranscriberTranslationNavigationPayload,
} from "../hooks/transcriber/useTranscriberCommands";
import { resolveNavigationMediaPayload } from "../services/ui/navigation";
import type { ElectronFile } from "../types/electron";
import { installElectronMock } from "./testUtils/electronMock";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: { count?: number }) => {
      if (key === "results.title") return "Result Preview";
      if (key === "results.empty") return "No transcription results yet";
      if (key === "results.missingSubtitleAlert") return "No usable SRT path was found in the result.";
      if (key === "actions.translate") return "Translate";
      if (key === "actions.openEditor") return "Open Editor";
      if (key === "results.segmentsCount") return `${params?.count ?? 0} segments`;
      return key;
    },
  }),
}));

describe("TranscriptionResults actions", () => {
  const expectTranslatorPayload = (
    payload: unknown,
    expected: {
      videoRef?: { path: string; name: string; type?: string };
      subtitleRef?: { path: string; name: string; type?: string };
    },
  ) => {
    expect(payload).toMatchObject({
      video_ref: expected.videoRef,
      subtitle_ref: expected.subtitleRef,
    });
  };

  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    installElectronMock();
  });

  it("passes resolved paths to translator action", () => {
    const onSendToTranslator = vi.fn();

    render(
      <TranscriptionResults
        result={{
          text: "hello world",
          language: "en",
          srt_path: "E:/sample.srt",
          video_ref: {
            path: "E:/sample.mp4",
            name: "sample.mp4",
          },
          subtitle_ref: {
            path: "E:/sample.srt",
            name: "sample.srt",
          },
          segments: [{ id: "1", start: 0, end: 1, text: "hello" }],
        }}
        isSmartSplitting={false}
        onSmartSplit={vi.fn()}
        onSendToEditor={vi.fn()}
        onSendToTranslator={onSendToTranslator}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Translate" }));

    expectTranslatorPayload(onSendToTranslator.mock.calls[0]?.[0], {
      videoRef: { path: "E:/sample.mp4", name: "sample.mp4" },
      subtitleRef: { path: "E:/sample.srt", name: "sample.srt" },
    });
  });

  it("passes structured media refs to translator action when available", () => {
    const onSendToTranslator = vi.fn();

    render(
      <TranscriptionResults
        result={{
          text: "hello world",
          language: "en",
          srt_path: "E:/sample.srt",
          video_ref: {
            path: "E:/canonical.mp4",
            name: "canonical.mp4",
            type: "video/mp4",
          },
          subtitle_ref: {
            path: "E:/canonical.srt",
            name: "canonical.srt",
            type: "application/x-subrip",
          },
          segments: [{ id: "1", start: 0, end: 1, text: "hello" }],
        }}
        isSmartSplitting={false}
        onSmartSplit={vi.fn()}
        onSendToEditor={vi.fn()}
        onSendToTranslator={onSendToTranslator}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Translate" }));

    expectTranslatorPayload(onSendToTranslator.mock.calls[0]?.[0], {
      videoRef: {
        path: "E:/canonical.mp4",
        name: "canonical.mp4",
        type: "video/mp4",
      },
      subtitleRef: {
        path: "E:/canonical.srt",
        name: "canonical.srt",
        type: "application/x-subrip",
      },
    });
  });

  it("allows translator navigation with ref-only media identity", () => {
    const onSendToTranslator = vi.fn();

    render(
      <TranscriptionResults
        result={{
          text: "hello world",
          language: "en",
          video_ref: {
            path: "E:/canonical.mp4",
            name: "canonical.mp4",
            type: "video/mp4",
          },
          subtitle_ref: {
            path: "E:/canonical.srt",
            name: "canonical.srt",
            type: "application/x-subrip",
          },
          segments: [{ id: "1", start: 0, end: 1, text: "hello" }],
        }}
        isSmartSplitting={false}
        onSmartSplit={vi.fn()}
        onSendToEditor={vi.fn()}
        onSendToTranslator={onSendToTranslator}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Translate" }));

    expectTranslatorPayload(onSendToTranslator.mock.calls[0]?.[0], {
      videoRef: {
        path: "E:/canonical.mp4",
        name: "canonical.mp4",
        type: "video/mp4",
      },
      subtitleRef: {
        path: "E:/canonical.srt",
        name: "canonical.srt",
        type: "application/x-subrip",
      },
    });
  });

  it("invokes editor action when open editor is clicked", () => {
    const onSendToEditor = vi.fn();

    render(
      <TranscriptionResults
        result={{
          text: "hello world",
          language: "en",
          srt_path: "E:/sample.srt",
          video_ref: {
            path: "E:/sample.mp4",
            name: "sample.mp4",
          },
          subtitle_ref: {
            path: "E:/sample.srt",
            name: "sample.srt",
          },
          segments: [{ id: "1", start: 0, end: 1, text: "hello" }],
        }}
        isSmartSplitting={false}
        onSmartSplit={vi.fn()}
        onSendToEditor={onSendToEditor}
        onSendToTranslator={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Editor" }));

    expect(onSendToEditor).toHaveBeenCalledTimes(1);
  });

  it("builds translator navigation payloads with canonical media refs", () => {
    const payload = createTranscriberTranslationNavigationPayload({
        video_ref: {
          path: "E:/canonical/sample.mp4",
          name: "sample.mp4",
          type: "video/mp4",
        },
        subtitle_ref: {
          path: "E:/canonical/sample.srt",
          name: "sample.srt",
          type: "application/x-subrip",
        },
      });

    expect(payload).toEqual({
      video_ref: {
        path: "E:/canonical/sample.mp4",
        name: "sample.mp4",
        type: "video/mp4",
      },
      subtitle_ref: {
        path: "E:/canonical/sample.srt",
        name: "sample.srt",
        type: "application/x-subrip",
      },
    });
    expect(resolveNavigationMediaPayload(payload)).toEqual({
      videoPath: "E:/canonical/sample.mp4",
      subtitlePath: "E:/canonical/sample.srt",
      videoRef: {
        path: "E:/canonical/sample.mp4",
        name: "sample.mp4",
        size: undefined,
        type: "video/mp4",
        media_id: undefined,
        media_kind: undefined,
        role: undefined,
        origin: undefined,
      },
      subtitleRef: {
        path: "E:/canonical/sample.srt",
        name: "sample.srt",
        size: undefined,
        type: "application/x-subrip",
        media_id: undefined,
        media_kind: undefined,
        role: undefined,
        origin: undefined,
      },
    });
  });

  it("builds editor navigation payloads with canonical subtitle refs", () => {
    const file = {
      path: "E:/workspace/sample.mp4",
      name: "sample.mp4",
      size: 1024,
      type: "video/mp4",
    } as ElectronFile & { path: string };

    const payload = createTranscriberEditorNavigationPayload({
        file,
        result: {
          text: "hello",
          language: "en",
          srt_path: "E:/workspace/sample.srt",
          subtitle_ref: {
            path: "E:/canonical/sample.srt",
            name: "sample.srt",
            type: "application/x-subrip",
          },
          segments: [{ id: "1", start: 0, end: 1, text: "hello" }],
        },
      });

    expect(payload).toEqual({
      video_ref: {
        path: "E:/workspace/sample.mp4",
        name: "sample.mp4",
        size: 1024,
        type: "video/mp4",
      },
      subtitle_ref: {
        path: "E:/canonical/sample.srt",
        name: "sample.srt",
        type: "application/x-subrip",
      },
    });
    expect(resolveNavigationMediaPayload(payload)).toEqual({
      videoPath: "E:/workspace/sample.mp4",
      subtitlePath: "E:/canonical/sample.srt",
      videoRef: {
        path: "E:/workspace/sample.mp4",
        name: "sample.mp4",
        size: 1024,
        type: "video/mp4",
        media_id: undefined,
        media_kind: undefined,
        role: undefined,
        origin: undefined,
      },
      subtitleRef: {
        path: "E:/canonical/sample.srt",
        name: "sample.srt",
        size: undefined,
        type: "application/x-subrip",
        media_id: undefined,
        media_kind: undefined,
        role: undefined,
        origin: undefined,
      },
    });
  });
});
