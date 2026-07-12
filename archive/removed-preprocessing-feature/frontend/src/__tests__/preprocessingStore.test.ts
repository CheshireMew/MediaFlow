import { beforeEach, describe, expect, it } from "vitest";
import {
  normalizePreprocessingSnapshot,
  usePreprocessingStore,
} from "../stores/preprocessingStore";
import {
  readWorkspaceStateValue,
  resetWorkspaceStateForTests,
} from "../services/persistence/workspaceState";
import { resetPreprocessingStoreForTests } from "./testFixtures";

describe("preprocessingStore persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    resetWorkspaceStateForTests();
    resetPreprocessingStoreForTests();
  });

  it("does not persist runtime-only preprocessing task state", () => {
    usePreprocessingStore.setState({
      preprocessingVideoRef: { path: "E:/video.mp4", name: "video.mp4" },
      preprocessingFiles: [{ path: "E:/video.mp4", name: "video.mp4", size: 1024 }],
      preprocessingIsProcessing: true,
      currentPreprocessingTaskId: "pre-task-1",
      currentPreprocessingTaskTool: "extract",
      currentPreprocessingTaskVideoRef: { path: "E:/video.mp4", name: "video.mp4" },
    });

    const persisted = readWorkspaceStateValue<Record<string, unknown>>(
      "preprocessing-storage",
    );
    expect(persisted).toBeTruthy();

    expect(persisted).toMatchObject({
      preprocessingVideoRef: { path: "E:/video.mp4", name: "video.mp4" },
      preprocessingFiles: [{ path: "E:/video.mp4", name: "video.mp4", size: 1024 }],
    });
    expect(persisted?.preprocessingIsProcessing).toBeUndefined();
    expect(persisted?.currentPreprocessingTaskId).toBeUndefined();
    expect(persisted?.currentPreprocessingTaskTool).toBeUndefined();
    expect(persisted?.currentPreprocessingTaskVideoPath).toBeUndefined();
    expect(persisted?.currentPreprocessingTaskVideoRef).toBeUndefined();
    expect(persisted?.preprocessingVideoPath).toBeUndefined();
  });

  it("normalizes persisted media references and rejects malformed project files", () => {
    const snapshot = normalizePreprocessingSnapshot({
      cleanMethod: "propainter",
      preprocessingVideoRef: {
        path: "  E:/media/source.png  ",
        name: "   ",
        size: 2048,
      },
      preprocessingFiles: [
        {
          path: "  E:/media/source.png  ",
          name: "   ",
          size: 2048,
          resolution: " 1200x800 ",
        },
        {
          path: "E:/media/source.png",
          name: "duplicate.png",
          size: 2048,
        },
        { path: "   ", name: "empty.png", size: 12 },
        { path: "E:/media/missing-size.png", name: "missing-size.png" },
        { path: "E:/media/negative-size.png", name: "negative.png", size: -1 },
        { path: "E:/media/string-size.png", name: "string.png", size: "12" },
        null,
      ],
    });

    expect(snapshot.preprocessingVideoRef).toMatchObject({
      path: "E:/media/source.png",
      name: "source.png",
      size: 2048,
    });
    expect(snapshot.preprocessingFiles).toEqual([
      expect.objectContaining({
        path: "E:/media/source.png",
        name: "source.png",
        size: 2048,
        resolution: "1200x800",
      }),
    ]);
    expect(snapshot.cleanMethod).toBe("telea");
  });

  it("drops malformed persisted video references", () => {
    expect(
      normalizePreprocessingSnapshot({
        preprocessingVideoRef: { path: "   ", name: "missing.png" },
      }).preprocessingVideoRef,
    ).toBeNull();
  });
});
