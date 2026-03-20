/* @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreprocessingPage } from "../pages/PreprocessingPage";
import { usePreprocessingStore } from "../stores/preprocessingStore";

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
      preprocessingIsProcessing: true,
      preprocessingActiveTaskId: "task-own",
      preprocessingActiveTaskTool: "extract",
      preprocessingActiveTaskVideoPath: "E:/video-a.mp4",
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
});
