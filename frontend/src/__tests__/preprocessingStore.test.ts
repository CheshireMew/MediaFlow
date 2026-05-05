import { beforeEach, describe, expect, it } from "vitest";
import { usePreprocessingStore } from "../stores/preprocessingStore";
import { readUiStateValue } from "../services/persistence/uiStateSettings";
import { resetPreprocessingStoreForTests } from "./testFixtures";

describe("preprocessingStore persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    resetPreprocessingStoreForTests();
  });

  it("does not persist runtime-only preprocessing task state", () => {
    usePreprocessingStore.setState({
      preprocessingVideoPath: "E:/video.mp4",
      preprocessingVideoRef: { path: "E:/video.mp4", name: "video.mp4" },
      preprocessingFiles: [{ path: "E:/video.mp4", name: "video.mp4", size: 1024 }],
      preprocessingIsProcessing: true,
      currentPreprocessingTaskId: "pre-task-1",
      currentPreprocessingTaskTool: "extract",
      currentPreprocessingTaskVideoPath: "E:/video.mp4",
      currentPreprocessingTaskVideoRef: { path: "E:/video.mp4", name: "video.mp4" },
    });

    const persisted = readUiStateValue<Record<string, unknown>>("preprocessing-storage");
    expect(persisted).toBeTruthy();

    expect(persisted).toMatchObject({
      preprocessingVideoPath: "E:/video.mp4",
      preprocessingVideoRef: { path: "E:/video.mp4", name: "video.mp4" },
      preprocessingFiles: [{ path: "E:/video.mp4", name: "video.mp4", size: 1024 }],
    });
    expect(persisted?.preprocessingIsProcessing).toBeUndefined();
    expect(persisted?.currentPreprocessingTaskId).toBeUndefined();
    expect(persisted?.currentPreprocessingTaskTool).toBeUndefined();
    expect(persisted?.currentPreprocessingTaskVideoPath).toBeUndefined();
    expect(persisted?.currentPreprocessingTaskVideoRef).toBeUndefined();
  });
});
