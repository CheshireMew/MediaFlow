import { describe, expect, it } from "vitest";
import {
  findRecoverablePreprocessingTask,
  getActivePreprocessingTask,
} from "../hooks/preprocessing/taskSelectors";
import type { Task } from "../types/task";

describe("preprocessing task selectors", () => {
  it("treats the current preprocessing task as active when canonical refs match", () => {
    const task: Task = {
      id: "task-own",
      type: "extract",
      status: "running",
      progress: 50,
      created_at: 1,
    };

    expect(
      getActivePreprocessingTask(
        [task],
        "task-own",
        "E:/workspace/video-a.mp4",
        {
          path: "E:/canonical/video-a.mp4",
          name: "video-a.mp4",
        },
        "E:/workspace/video-b.mp4",
        {
          path: "E:/canonical/video-a.mp4",
          name: "video-a.mp4",
        },
      ),
    ).toBe(task);
  });

  it("hides the task when canonical refs differ even if legacy paths still match", () => {
    const task: Task = {
      id: "task-own",
      type: "extract",
      status: "running",
      progress: 50,
      created_at: 1,
    };

    expect(
      getActivePreprocessingTask(
        [task],
        "task-own",
        "E:/workspace/video-a.mp4",
        {
          path: "E:/canonical/video-a.mp4",
          name: "video-a.mp4",
        },
        "E:/workspace/video-a.mp4",
        {
          path: "E:/canonical/video-b.mp4",
          name: "video-b.mp4",
        },
      ),
    ).toBeNull();
  });

  it("finds a recoverable completed preprocessing task by canonical video identity", () => {
    const task: Task = {
      id: "task-history",
      type: "extract",
      status: "completed",
      progress: 100,
      created_at: 1,
      request_params: {
        video_ref: {
          path: "E:/canonical/video-a.mp4",
          name: "video-a.mp4",
        },
      },
    };

    expect(
      findRecoverablePreprocessingTask(
        [task],
        "E:/workspace/video-a.mp4",
        {
          path: "E:/canonical/video-a.mp4",
          name: "video-a.mp4",
        },
      ),
    ).toBe(task);
  });
});
