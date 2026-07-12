import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOCRProcessor } from "../hooks/preprocessing/useOCRProcessor";
import { usePreprocessingStore } from "../stores/preprocessingStore";
import { resetPreprocessingStoreForTests } from "./testFixtures";

const useTaskContextMock = vi.fn();
const getOcrResultsMock = vi.fn();
const extractTextMock = vi.fn();
const cleanVideoMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../context/taskContext", () => ({
  useTaskContext: () => useTaskContextMock(),
}));

vi.mock("../services/domain", () => ({
  preprocessingService: {
    getOcrResults: (...args: unknown[]) => getOcrResultsMock(...args),
    extractText: (...args: unknown[]) => extractTextMock(...args),
    enhanceVideo: vi.fn(),
    cleanVideo: (...args: unknown[]) => cleanVideoMock(...args),
  },
  getExecutionSubmission: (outcome: { task_id: string }) => ({
    task_id: outcome.task_id,
  }),
  createTaskFromExecutionOutcome: (input: unknown) => input,
}));

function createCanvasRef(width: number, height: number) {
  const canvas = document.createElement("div");
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  });
  return { current: canvas };
}

describe("useOCRProcessor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPreprocessingStoreForTests({
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
          message_code: "ocr_completed",
          message_params: {},
          created_at: 1,
          request_params: {
            video_ref: {
              path: "E:/canonical/video.mp4",
              name: "video.mp4",
            },
          },
          result: {
            success: true,
            events: [{ start: 0, end: 1, text: "legacy top-level event" }],
            meta: {
              events: [
                { start: 0, end: 1, text: "hello", box: [] },
                { start: "bad", end: 2, text: "invalid", box: [] },
              ],
            },
          },
        },
      ],
    });

    const { result } = renderHook(() =>
      useOCRProcessor({
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
      video_ref: {
        path: "E:/canonical/video.mp4",
        name: "video.mp4",
      },
    });

    expect(usePreprocessingStore.getState().currentPreprocessingTaskId).toBeNull();
    expect(usePreprocessingStore.getState().preprocessingIsProcessing).toBe(false);
    expect(result.current.processingOutcome).toEqual(expect.objectContaining({
      taskId: "extract-history",
      status: "completed",
      tool: "extract",
      sourceRef: {
        path: "E:/canonical/video.mp4",
        name: "video.mp4",
      },
    }));
  });

  it("surfaces the canonical output artifact when enhancement completes", async () => {
    useTaskContextMock.mockReturnValue({
      addTask: vi.fn(),
      tasks: [
        {
          id: "enhance-history",
          type: "enhancement",
          status: "completed",
          progress: 100,
          message_code: "enhancement_completed",
          message_params: {},
          created_at: 1,
          request_params: {
            video_ref: {
              path: "E:/canonical/video.mp4",
              name: "video.mp4",
            },
          },
          artifacts: [
            {
              kind: "video",
              role: "output",
              ref: {
                path: "E:/canonical/video_realesrgan_4x.mp4",
                name: "video_realesrgan_4x.mp4",
              },
            },
          ],
          result: { success: true },
        },
      ],
    });

    const { result } = renderHook(() =>
      useOCRProcessor({
        videoRef: {
          path: "E:/canonical/video.mp4",
          name: "video.mp4",
        },
        roi: null,
        canvasRef: { current: null },
        videoResolution: { w: 1920, h: 1080 },
        activeTool: "enhance",
        ocrEngine: "rapid",
        enhanceModel: "RealESRGAN-x4plus",
        enhanceScale: "4x",
        enhanceMethod: "realesrgan",
        cleanMethod: "telea",
      }),
    );

    await waitFor(() => {
      expect(result.current.processingOutcome).toEqual({
        taskId: "enhance-history",
        status: "completed",
        tool: "enhance",
        sourceRef: {
          path: "E:/canonical/video.mp4",
          name: "video.mp4",
        },
        outputRef: {
          path: "E:/canonical/video_realesrgan_4x.mp4",
          name: "video_realesrgan_4x.mp4",
        },
        taskMessage: {
          message_code: "enhancement_completed",
          message_params: {},
        },
        detail: null,
      });
    });

    expect(usePreprocessingStore.getState().ocrResults).toEqual([]);
  });

  it("submits OCR ROI in original media pixels through object-contain mapping", async () => {
    const addTask = vi.fn();
    useTaskContextMock.mockReturnValue({ addTask, tasks: [] });
    extractTextMock.mockResolvedValue({ task_id: "ocr-roi", status: "queued" });
    const canvasRef = createCanvasRef(1600, 900);

    const { result } = renderHook(() =>
      useOCRProcessor({
        videoRef: {
          path: "E:/canonical/square.mp4",
          name: "square.mp4",
        },
        roi: { x: 300, y: 100, w: 200, h: 200 },
        canvasRef,
        videoResolution: { w: 900, h: 900 },
        activeTool: "extract",
        ocrEngine: "rapid",
        enhanceModel: "RealESRGAN-x4plus",
        enhanceScale: "4x",
        enhanceMethod: "realesrgan",
        cleanMethod: "telea",
      }),
    );

    await act(async () => {
      await result.current.handleStartOCR();
    });

    expect(extractTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ roi: [0, 100, 150, 200] }),
    );
    expect(addTask).toHaveBeenCalledWith(
      expect.objectContaining({
        request_params: expect.objectContaining({ roi: [0, 100, 150, 200] }),
      }),
    );
  });

  it("submits cleanup ROI in original media pixels", async () => {
    useTaskContextMock.mockReturnValue({ addTask: vi.fn(), tasks: [] });
    cleanVideoMock.mockResolvedValue({ task_id: "clean-roi", status: "queued" });
    const canvasRef = createCanvasRef(1600, 900);

    const { result } = renderHook(() =>
      useOCRProcessor({
        videoRef: {
          path: "E:/canonical/square.mp4",
          name: "square.mp4",
        },
        roi: { x: 300, y: 100, w: 200, h: 200 },
        canvasRef,
        videoResolution: { w: 900, h: 900 },
        activeTool: "clean",
        ocrEngine: "rapid",
        enhanceModel: "RealESRGAN-x4plus",
        enhanceScale: "4x",
        enhanceMethod: "realesrgan",
        cleanMethod: "telea",
      }),
    );

    await act(async () => {
      await result.current.handleStartProcessing();
    });

    expect(cleanVideoMock).toHaveBeenCalledWith(
      expect.objectContaining({ roi: [0, 100, 150, 200] }),
    );
  });
});
