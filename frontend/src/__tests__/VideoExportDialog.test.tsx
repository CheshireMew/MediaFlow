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
    vi.spyOn(editorService, "getMediaVisibleStart").mockResolvedValue({
      visible_start: 0,
      has_leading_black: false,
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
      .fn<(submission: VideoExportSubmission, videoPath: string) => Promise<boolean>>()
      .mockResolvedValue(true);
    const onClose = vi.fn();
    render(
      <VideoExportDialog
        isOpen
        onClose={onClose}
        regions={[{ id: "s1", start: 0, end: 20, text: "Subtitle" }]}
        videoPath="D:/media/demo.mp4"
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
      .fn<(submission: VideoExportSubmission, videoPath: string) => Promise<boolean>>()
      .mockResolvedValue(false);
    const onClose = vi.fn();
    render(
      <VideoExportDialog
        isOpen
        onClose={onClose}
        regions={[]}
        videoPath="D:/media/demo.mp4"
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
      .fn<(submission: VideoExportSubmission, videoPath: string) => Promise<boolean>>()
      .mockResolvedValue(true);
    render(
      <VideoExportDialog
        isOpen
        onClose={vi.fn()}
        regions={[{ id: "s1", start: 0, end: 2, text: "Subtitle" }]}
        videoPath="D:/media/demo.mp4"
        mediaUrl="file:///D:/media/demo.mp4"
        exportScope={{ kind: "full-video" }}
        onExport={onExport}
      />,
    );

    expect(screen.queryByText("output.batchFiles")).toBeNull();
    expect(screen.getByDisplayValue("demo_synthesized.mp4")).toBeInTheDocument();
    expect(screen.getByTitle("preview.trimVideo")).toBeInTheDocument();

    fireEvent.click(screen.getByText("preview.startExport"));
    await waitFor(() => expect(onExport).toHaveBeenCalledOnce());
    expect(onExport.mock.calls[0][0].outputRef?.path).toBe(
      "D:/media/demo_synthesized.mp4",
    );
  });
});
