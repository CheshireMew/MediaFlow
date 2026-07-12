/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreprocessingPage } from "../pages/PreprocessingPage";
import { usePreprocessingStore } from "../stores/preprocessingStore";
import { writePendingMediaNavigation } from "../services/ui/pendingMediaNavigation";
import { installElectronMock, type MockedElectronAPI } from "./testUtils/electronMock";

const useTaskContextMock = vi.fn();
const useOCRProcessorMock = vi.fn();

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
  useOCRProcessor: (...args: unknown[]) => useOCRProcessorMock(...args),
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

describe("PreprocessingPage backend task state", () => {
  let electronMock: MockedElectronAPI;

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    electronMock = installElectronMock();
    useOCRProcessorMock.mockReturnValue({
      handleStartProcessing: vi.fn(),
      processingOutcome: null,
      clearProcessingOutcome: vi.fn(),
    });
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
      preprocessingVideoRef: {
        path: "E:/canonical/video-a.mp4",
        name: "video-a.mp4",
        size: 123,
      },
      preprocessingIsProcessing: true,
      currentPreprocessingTaskId: "task-own",
      currentPreprocessingTaskTool: "extract",
      currentPreprocessingTaskVideoRef: {
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
          message_code: "download_progress",
          message_params: { percent: 73 },
          created_at: 2,
        },
        {
          id: "task-own",
          type: "extract",
          status: "running",
          progress: 25,
          message_code: "ocr_scanning",
          message_params: { frame: 25, total: 100 },
          created_at: 1,
        },
      ],
    });

    render(<PreprocessingPage />);

    expect(screen.getByText("taskmonitor:taskMessages.ocr_scanning")).toBeTruthy();
    expect(screen.getByText("25%")).toBeTruthy();
    expect(screen.queryByText("Downloader task")).toBeNull();
  });

  it("hides the overlay when the active preprocessing task belongs to another file", () => {
    usePreprocessingStore.setState({
      currentPreprocessingTaskVideoRef: {
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
          message_code: "ocr_scanning",
          message_params: { frame: 25, total: 100 },
          created_at: 1,
        },
      ],
    });

    render(<PreprocessingPage />);

    expect(screen.queryByText("taskmonitor:taskMessages.ocr_scanning")).toBeNull();
    expect(screen.queryByText("25%")).toBeNull();
  });

  it("restores preprocessing media from pending navigation using canonical refs", () => {
    writePendingMediaNavigation({
      target: "preprocessing",
      video_ref: {
        path: "E:/canonical/video-c.mp4",
        name: "video-c.mp4",
        size: 999,
      },
    });

    render(<PreprocessingPage />);

    expect(usePreprocessingStore.getState().preprocessingVideoRef?.path).toBe(
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

    expect(usePreprocessingStore.getState().preprocessingVideoRef?.path).toBe(
      "E:/canonical/video-d.mp4",
    );
    expect(usePreprocessingStore.getState().preprocessingVideoRef).toEqual({
      path: "E:/canonical/video-d.mp4",
      name: "video-d.mp4",
      size: 555,
    });
  });

  it("uses an image's natural dimensions for preprocessing ROI conversion", async () => {
    useTaskContextMock.mockReturnValue({ tasks: [] });
    usePreprocessingStore.setState({
      preprocessingFiles: [
        {
          path: "E:/canonical/source.png",
          name: "source.png",
          size: 2048,
        },
      ],
      preprocessingVideoRef: {
        path: "E:/canonical/source.png",
        name: "source.png",
        size: 2048,
      },
    });

    render(<PreprocessingPage />);

    const image = screen.getByAltText("canvas.previewAlt");
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 1200 },
      naturalHeight: { configurable: true, value: 800 },
    });
    fireEvent.load(image);

    await waitFor(() => {
      const latestOptions = useOCRProcessorMock.mock.calls.at(-1)?.[0];
      expect(latestOptions.videoResolution).toEqual({ w: 1200, h: 800 });
    });
    expect(usePreprocessingStore.getState().preprocessingFiles[0]?.resolution).toBe(
      "1200x800",
    );
  });

  it("shows completed output on the page and opens its canonical location", async () => {
    const clearProcessingOutcome = vi.fn();
    useOCRProcessorMock.mockReturnValue({
      handleStartProcessing: vi.fn(),
      clearProcessingOutcome,
      processingOutcome: {
        taskId: "enhance-complete",
        status: "completed",
        tool: "enhance",
        sourceRef: {
          path: "E:/canonical/video-a.mp4",
          name: "video-a.mp4",
        },
        outputRef: {
          path: "E:/canonical/video-a_realesrgan_4x.mp4",
          name: "video-a_realesrgan_4x.mp4",
        },
        taskMessage: {
          message_code: "enhancement_completed",
          message_params: {},
        },
        detail: null,
      },
    });
    useTaskContextMock.mockReturnValue({ tasks: [] });

    render(<PreprocessingPage />);

    expect(screen.getByText("feedback.completed.enhance")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "feedback.openOutput" }));

    await waitFor(() => {
      expect(electronMock.showInExplorer).toHaveBeenCalledWith(
        "E:/canonical/video-a_realesrgan_4x.mp4",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "feedback.dismiss" }));
    expect(clearProcessingOutcome).toHaveBeenCalledTimes(1);
  });

  it("keeps preprocessing failures visible instead of returning to a ready state", () => {
    useOCRProcessorMock.mockReturnValue({
      handleStartProcessing: vi.fn(),
      clearProcessingOutcome: vi.fn(),
      processingOutcome: {
        taskId: "cleanup-failed",
        status: "failed",
        tool: "clean",
        sourceRef: {
          path: "E:/canonical/video-a.mp4",
          name: "video-a.mp4",
        },
        outputRef: null,
        taskMessage: {
          message_code: "failed",
          message_params: {},
        },
        detail: "FFmpeg exited with code 1",
      },
    });
    useTaskContextMock.mockReturnValue({ tasks: [] });

    render(<PreprocessingPage />);

    expect(screen.getByRole("alert")).toHaveTextContent("feedback.failed");
    expect(screen.getByRole("alert")).toHaveTextContent("FFmpeg exited with code 1");
  });
});
