/* @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VideoExportDialog } from "../components/dialogs/SynthesisDialog";
import { editorService } from "../services/domain";
import type { VideoExportSubmission } from "../services/domain/videoExport";
import { updateStoredSynthesisExecutionPreferences } from "../services/persistence/synthesisExecutionPreferences";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("VideoExportDialog clip scope", () => {
  beforeEach(() => {
    localStorage.clear();
    updateStoredSynthesisExecutionPreferences({
      subtitleEnabled: true,
      watermarkEnabled: false,
      targetResolution: "original",
    });
    vi.spyOn(editorService, "getLatestWatermark").mockResolvedValue(null);
    vi.spyOn(editorService, "getMediaExportTimeline").mockResolvedValue({
      duration: 60,
      trim_start: 0,
      trim_end: 60,
      no_speech_trim_enabled: false,
      has_speech_timeline: true,
      has_leading_black: false,
      has_leading_no_speech: false,
      has_trailing_no_speech: false,
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      font: "",
      measureText: (value: string) => ({ width: value.length * 10 }),
    } as unknown as CanvasRenderingContext2D);
    Object.defineProperty(HTMLMediaElement.prototype, "load", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("submits a clip batch without full-video trim or a single output file", async () => {
    const onExport = vi
      .fn<(submission: VideoExportSubmission) => Promise<boolean>>()
      .mockResolvedValue(true);
    const onClose = vi.fn();
    render(
      <VideoExportDialog
        isOpen
        onClose={onClose}
        regions={[{ id: "s1", start: 0, end: 20, text: "Subtitle" }]}
        video={{ path: "D:/media/demo.mp4", name: "demo.mp4" }}
        mediaUrl="file:///D:/media/demo.mp4"
        exportScope={{
          kind: "clips",
          segments: [
            { id: "c1", start: 1, end: 3, title: "One" },
            { id: "c2", start: 5, end: 8, title: "Two" },
          ],
        }}
        onExport={onExport}
      />,
    );

    expect(screen.getByRole("dialog", { name: "clipExport.title" })).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("clipExport.title")).toBeInTheDocument();
    expect(screen.getByText("output.batchFiles")).toBeInTheDocument();
    expect(screen.queryByTitle("preview.trimVideo")).toBeNull();

    fireEvent.click(screen.getByText("clipExport.startExport"));
    await waitFor(() => expect(onExport).toHaveBeenCalledOnce());

    const submission = onExport.mock.calls[0][0];
    expect(submission.outputRef).toBeNull();
    expect(submission.outputDir).toBe("D:/media/demo_clips");
    expect(submission.options).not.toHaveProperty("trim_start");
    expect(submission.options).not.toHaveProperty("trim_end");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps the dialog open when the caller does not submit a task", async () => {
    const onExport = vi
      .fn<(submission: VideoExportSubmission) => Promise<boolean>>()
      .mockResolvedValue(false);
    const onClose = vi.fn();
    render(
      <VideoExportDialog
        isOpen
        onClose={onClose}
        regions={[]}
        video={{ path: "D:/media/demo.mp4", name: "demo.mp4" }}
        mediaUrl="file:///D:/media/demo.mp4"
        exportScope={{
          kind: "clips",
          segments: [{ id: "c1", start: 1, end: 3, title: "One" }],
        }}
        onExport={onExport}
      />,
    );

    fireEvent.click(screen.getByText("clipExport.startExport"));
    await waitFor(() => expect(onExport).toHaveBeenCalledOnce());

    expect(onExport.mock.calls[0][0].subtitleEnabled).toBe(false);
    expect(onExport.mock.calls[0][0].options.skip_subtitles).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("clipExport.startExport")).toBeEnabled();
  });

  it("keeps the full-video path as a single-file export", async () => {
    const onExport = vi
      .fn<(submission: VideoExportSubmission) => Promise<boolean>>()
      .mockResolvedValue(true);
    render(
      <VideoExportDialog
        isOpen
        onClose={vi.fn()}
        regions={[{ id: "s1", start: 0, end: 2, text: "Subtitle" }]}
        video={{ path: "D:/media/demo.mp4", name: "demo.mp4" }}
        mediaUrl="file:///D:/media/demo.mp4"
        exportScope={{ kind: "full-video" }}
        onExport={onExport}
      />,
    );

    const videoElement = await waitFor(() => {
      const element = document.querySelector("video");
      expect(element).not.toBeNull();
      return element as HTMLVideoElement;
    });
    Object.defineProperties(videoElement, {
      videoWidth: { configurable: true, value: 1280 },
      videoHeight: { configurable: true, value: 720 },
      duration: { configurable: true, value: 60 },
    });
    fireEvent.loadedMetadata(videoElement);
    fireEvent.canPlay(videoElement);

    await waitFor(() =>
      expect(screen.getByLabelText("style.sizePx")).toHaveValue(48),
    );

    expect(screen.queryByText("output.batchFiles")).toBeNull();
    expect(screen.getByDisplayValue("demo_synthesized.mp4")).toBeInTheDocument();
    expect(screen.getByTitle("preview.trimVideo")).toBeInTheDocument();

    fireEvent.click(screen.getByText("preview.startExport"));
    await waitFor(() => expect(onExport).toHaveBeenCalledOnce());
    expect(onExport.mock.calls[0][0].outputRef?.path).toBe(
      "D:/media/demo_synthesized.mp4",
    );
    expect(onExport.mock.calls[0][0].options.font_size).toBe(48);
  });

  it("uses the existing Whisper segment timeline for preview and export", async () => {
    vi.mocked(editorService.getMediaExportTimeline).mockResolvedValueOnce({
      duration: 52.941497,
      trim_start: 1.25,
      trim_end: 49.5,
      no_speech_trim_enabled: true,
      has_speech_timeline: true,
      has_leading_black: false,
      has_leading_no_speech: true,
      has_trailing_no_speech: true,
    });
    const speechSegments = [
      { id: "later", start: 40, end: 49.5, text: "Later speech" },
      { id: "first", start: 1.25, end: 10, text: "First speech" },
    ];
    const onExport = vi
      .fn<(submission: VideoExportSubmission) => Promise<boolean>>()
      .mockResolvedValue(true);

    render(
      <VideoExportDialog
        isOpen
        onClose={vi.fn()}
        regions={speechSegments}
        video={{ path: "D:/media/demo.mp4", name: "demo.mp4" }}
        mediaUrl="file:///D:/media/demo.mp4"
        exportScope={{ kind: "full-video" }}
        onExport={onExport}
      />,
    );

    const videoElement = await waitFor(() => document.querySelector("video") as HTMLVideoElement);
    Object.defineProperties(videoElement, {
      videoWidth: { configurable: true, value: 1280 },
      videoHeight: { configurable: true, value: 720 },
      duration: { configurable: true, value: 52.941497 },
    });
    fireEvent.loadedMetadata(videoElement);
    fireEvent.canPlay(videoElement);

    const seek = await screen.findByLabelText("preview.seek");
    await waitFor(() => {
      expect(editorService.getMediaExportTimeline).toHaveBeenCalledWith({
        video_ref: { path: "D:/media/demo.mp4", name: "demo.mp4" },
        speech_segments: speechSegments,
      });
      expect(seek).toHaveAttribute("min", "1.25");
      expect(seek).toHaveAttribute("max", "49.5");
      expect(screen.getByText("0:48")).toBeInTheDocument();
      expect(screen.getByText("preview.startExport")).toBeEnabled();
    });

    fireEvent.click(screen.getByText("preview.startExport"));
    await waitFor(() => expect(onExport).toHaveBeenCalledOnce());

    expect(onExport.mock.calls[0][0].options).toMatchObject({
      trim_start: 1.25,
      trim_end: 49.5,
    });
    expect(onExport.mock.calls[0][0].options).not.toHaveProperty("auto_trim_silence");
  });
});
