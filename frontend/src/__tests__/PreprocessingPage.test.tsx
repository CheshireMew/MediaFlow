/* @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreprocessingPage } from "../pages/PreprocessingPage";
import { usePreprocessingStore } from "../stores/preprocessingStore";
import { writePendingMediaNavigation } from "../services/ui/pendingMediaNavigation";

const useTaskContextMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../context/taskContext", () => ({
  useTaskContext: () => useTaskContextMock(),
}));

vi.mock("../hooks/preprocessing/useROIInteraction", () => ({
  useROIInteraction: () => ({
    roi: null,
    setRoi: vi.fn(),
    interactionMode: "idle",
    handleMouseDown: vi.fn(),
    handleMouseMove: vi.fn(),
    handleMouseUp: vi.fn(),
  }),
}));

vi.mock("../hooks/preprocessing/useOCRProcessor", () => ({
  useOCRProcessor: () => ({
    handleStartProcessing: vi.fn(),
  }),
}));

vi.mock("../components/preprocessing/ProjectFileList", () => ({
  ProjectFileList: () => <div data-testid="project-file-list" />,
}));

vi.mock("../components/preprocessing/VideoControlBar", () => ({
  VideoControlBar: () => <div data-testid="video-control-bar" />,
}));

vi.mock("../components/preprocessing/PreprocessingToolsPanel", () => ({
  PreprocessingToolsPanel: () => <div data-testid="preprocessing-tools-panel" />,
}));

describe("PreprocessingPage task ownership", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    usePreprocessingStore.setState({
      preprocessingActiveTool: "extract",
      enhanceModel: "RealESRGAN-x4plus",
      enhanceScale: "4x",
      enhanceMethod: "realesrgan",
      cleanMethod: "telea",
      ocrEngine: "rapid",
      ocrResults: [],
      preprocessingFiles: [
        {
          path: "E:/video-a.mp4",
          name: "video-a.mp4",
          size: 123,
        },
      ],
      preprocessingVideoPath: "E:/video-a.mp4",
      preprocessingVideoRef: {
        path: "E:/canonical/video-a.mp4",
        name: "video-a.mp4",
        size: 123,
      },
      preprocessingIsProcessing: true,
      preprocessingActiveTaskId: "task-own",
      preprocessingActiveTaskTool: "extract",
      preprocessingActiveTaskVideoPath: "E:/canonical/video-a.mp4",
      preprocessingActiveTaskVideoRef: {
        path: "E:/canonical/video-a.mp4",
        name: "video-a.mp4",
        size: 123,
      },
    });
  });

  it("renders only the active preprocessing task for the current file", () => {
    useTaskContextMock.mockReturnValue({
      tasks: [
        {
          id: "task-other",
          type: "download",
          status: "running",
          progress: 73,
          message: "Downloader task",
          created_at: 2,
        },
        {
          id: "task-own",
          type: "extract",
          status: "running",
          progress: 25,
          message: "OCR current file",
          created_at: 1,
        },
      ],
    });

    render(<PreprocessingPage />);

    expect(screen.getByText("OCR current file")).toBeTruthy();
    expect(screen.getByText("25%")).toBeTruthy();
    expect(screen.queryByText("Downloader task")).toBeNull();
  });

  it("hides the overlay when the active preprocessing task belongs to another file", () => {
    usePreprocessingStore.setState({
      preprocessingActiveTaskVideoPath: "E:/video-b.mp4",
      preprocessingActiveTaskVideoRef: {
        path: "E:/canonical/video-b.mp4",
        name: "video-b.mp4",
        size: 456,
      },
    });

    useTaskContextMock.mockReturnValue({
      tasks: [
        {
          id: "task-own",
          type: "extract",
          status: "running",
          progress: 25,
          message: "OCR other file",
          created_at: 1,
        },
      ],
    });

    render(<PreprocessingPage />);

    expect(screen.queryByText("OCR other file")).toBeNull();
    expect(screen.queryByText("25%")).toBeNull();
  });

  it("restores preprocessing media from pending navigation using canonical refs", () => {
    writePendingMediaNavigation({
      target: "preprocessing",
      video_path: "E:/workspace/video-c.mp4",
      video_ref: {
        path: "E:/canonical/video-c.mp4",
        name: "video-c.mp4",
        size: 999,
      },
    });

    render(<PreprocessingPage />);

    expect(usePreprocessingStore.getState().preprocessingVideoPath).toBe(
      "E:/canonical/video-c.mp4",
    );
    expect(usePreprocessingStore.getState().preprocessingVideoRef).toEqual({
      path: "E:/canonical/video-c.mp4",
      name: "video-c.mp4",
      size: 999,
    });
    expect(sessionStorage.getItem("mediaflow:pending_file")).toBeNull();
  });

  it("restores preprocessing media from a ref-only pending payload", () => {
    writePendingMediaNavigation({
      target: "preprocessing",
      video_ref: {
        path: "E:/canonical/video-d.mp4",
        name: "video-d.mp4",
        size: 555,
      },
    });

    render(<PreprocessingPage />);

    expect(usePreprocessingStore.getState().preprocessingVideoPath).toBe(
      "E:/canonical/video-d.mp4",
    );
    expect(usePreprocessingStore.getState().preprocessingVideoRef).toEqual({
      path: "E:/canonical/video-d.mp4",
      name: "video-d.mp4",
      size: 555,
    });
  });
});
