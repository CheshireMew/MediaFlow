import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOCRProcessor } from "../hooks/preprocessing/useOCRProcessor";
import { usePreprocessingStore } from "../stores/preprocessingStore";

const useTaskContextMock = vi.fn();
const getOcrResultsMock = vi.fn();

vi.mock("../context/taskContext", () => ({
  useTaskContext: () => useTaskContextMock(),
}));

vi.mock("../services/domain", () => ({
  preprocessingService: {
    getOcrResults: (...args: unknown[]) => getOcrResultsMock(...args),
    extractText: vi.fn(),
    enhanceVideo: vi.fn(),
    cleanVideo: vi.fn(),
  },
}));

describe("useOCRProcessor", () => {
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
      preprocessingIsProcessing: false,
      preprocessingActiveTaskId: null,
      preprocessingActiveTaskTool: null,
      preprocessingActiveTaskVideoPath: null,
      preprocessingActiveTaskVideoRef: null,
      preprocessingFiles: [],
      preprocessingVideoPath: "E:/video.mp4",
      preprocessingVideoRef: {
        path: "E:/canonical/video.mp4",
        name: "video.mp4",
      },
    });
    getOcrResultsMock.mockResolvedValue({ events: [] });
    useTaskContextMock.mockReturnValue({
      addTask: vi.fn(),
      tasks: [],
    });
  });

  it("recovers completed OCR results for the current video without restoring active task state", async () => {
    useTaskContextMock.mockReturnValue({
      addTask: vi.fn(),
      tasks: [
        {
          id: "extract-history",
          type: "extract",
          status: "completed",
          progress: 100,
          created_at: 1,
          request_params: {
            video_ref: {
              path: "E:/canonical/video.mp4",
              name: "video.mp4",
            },
          },
          result: {
            events: [{ start: 0, end: 1, text: "hello", box: [] }],
          },
        },
      ],
    });

    renderHook(() =>
      useOCRProcessor({
        videoPath: "E:/video.mp4",
        videoRef: {
          path: "E:/canonical/video.mp4",
          name: "video.mp4",
        },
        roi: null,
        canvasRef: { current: null },
        videoResolution: { w: 1920, h: 1080 },
        activeTool: "extract",
        ocrEngine: "rapid",
        enhanceModel: "RealESRGAN-x4plus",
        enhanceScale: "4x",
        enhanceMethod: "realesrgan",
        cleanMethod: "telea",
      }),
    );

    await waitFor(() => {
      expect(usePreprocessingStore.getState().ocrResults).toEqual([
        { start: 0, end: 1, text: "hello", box: [] },
      ]);
    });

    expect(getOcrResultsMock).toHaveBeenCalledWith({
      video_path: "E:/video.mp4",
      video_ref: {
        path: "E:/canonical/video.mp4",
        name: "video.mp4",
      },
    });

    expect(usePreprocessingStore.getState().preprocessingActiveTaskId).toBeNull();
    expect(usePreprocessingStore.getState().preprocessingIsProcessing).toBe(false);
  });
});
