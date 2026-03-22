import { beforeEach, describe, expect, it } from "vitest";
import { usePreprocessingStore } from "../stores/preprocessingStore";

describe("preprocessingStore persistence", () => {
  beforeEach(() => {
    localStorage.clear();
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
      preprocessingVideoPath: null,
      preprocessingVideoRef: null,
    });
  });

  it("does not persist runtime-only preprocessing task state", () => {
    usePreprocessingStore.setState({
      preprocessingVideoPath: "E:/video.mp4",
      preprocessingVideoRef: { path: "E:/video.mp4", name: "video.mp4" },
      preprocessingFiles: [{ path: "E:/video.mp4", name: "video.mp4", size: 1024 }],
      preprocessingIsProcessing: true,
      preprocessingActiveTaskId: "pre-task-1",
      preprocessingActiveTaskTool: "extract",
      preprocessingActiveTaskVideoPath: "E:/video.mp4",
      preprocessingActiveTaskVideoRef: { path: "E:/video.mp4", name: "video.mp4" },
    });

    const persistedRaw = localStorage.getItem("preprocessing-storage");
    expect(persistedRaw).toBeTruthy();
    const persisted = JSON.parse(persistedRaw as string) as {
      state: Record<string, unknown>;
    };

    expect(persisted.state).toMatchObject({
      preprocessingVideoPath: "E:/video.mp4",
      preprocessingVideoRef: { path: "E:/video.mp4", name: "video.mp4" },
      preprocessingFiles: [{ path: "E:/video.mp4", name: "video.mp4", size: 1024 }],
    });
    expect(persisted.state.preprocessingIsProcessing).toBeUndefined();
    expect(persisted.state.preprocessingActiveTaskId).toBeUndefined();
    expect(persisted.state.preprocessingActiveTaskTool).toBeUndefined();
    expect(persisted.state.preprocessingActiveTaskVideoPath).toBeUndefined();
    expect(persisted.state.preprocessingActiveTaskVideoRef).toBeUndefined();
  });
});
