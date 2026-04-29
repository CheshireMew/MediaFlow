import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTranscriber } from "../hooks/useTranscriber";
import type { Task } from "../types/task";
import { apiClient } from "../api/client";
import { createTranscribeStepRequestParams } from "./testFixtures";
import { clearElectronMock, installElectronMock } from "./testUtils/electronMock";
import type { MockedElectronAPI } from "./testUtils/electronMock";

const useTaskContextMock = vi.fn();
const addTaskMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../context/taskContext", () => ({
  useTaskContext: () => useTaskContextMock(),
}));

vi.mock("../api/client", () => ({
  apiClient: {
    runPipeline: vi.fn(),
    getSettings: vi.fn(),
  },
}));

describe("useTranscriber", () => {
  let electronMock: MockedElectronAPI;

  const expectTranscriberResultMedia = (
    currentResult: ReturnType<typeof useTranscriber>["state"]["result"],
    expected: {
      subtitleRef: { path: string; name: string; size?: number; type?: string };
      videoRef?: { path: string; name: string; size?: number; type?: string };
    },
  ) => {
    expect(currentResult?.video_ref).toEqual(expected.videoRef);
    expect(currentResult?.subtitle_ref).toEqual(expected.subtitleRef);
  };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    vi.mocked(apiClient.getSettings).mockResolvedValue({
      llm_providers: [],
      default_download_path: null,
      faster_whisper_cli_path: null,
      language: "zh",
      auto_execute_flow: false,
      smart_split_text_limit: 24,
    });

    useTaskContextMock.mockReturnValue({
      tasks: [],
      connected: true,
      remoteTasksReady: true,
      tasksSettled: true,
      cancelTask: vi.fn(),
      addTask: addTaskMock,
    });
    addTaskMock.mockReset();
    electronMock = installElectronMock();
  });

  it("opens the desktop picker with the transcriber media profile", async () => {
    electronMock.openFile = vi.fn().mockResolvedValue({
      path: "E:/sample.mp4",
      name: "sample.mp4",
      size: 1024,
    });

    const { result } = renderHook(() => useTranscriber());

    await act(async () => {
      await result.current.actions.onFileSelect();
    });

    expect(electronMock.openFile).toHaveBeenCalledWith({
      profile: "transcriber-media",
    });
    expect(result.current.state.file).toMatchObject({
      path: "E:/sample.mp4",
      name: "sample.mp4",
    });
  });

  it("recovers an active pipeline task containing a transcribe step", async () => {
    const pipelineTask: Task = {
      id: "pipeline-123",
      type: "pipeline",
      status: "running",
      progress: 35,
      name: "Transcribe sample.mp4",
      message: "Executing step: transcribe",
      request_params: {
        pipeline_id: "transcriber_tool",
        steps: [
          {
            step_name: "transcribe",
            params: {
              audio_path: "E:/sample.mp4",
              model: "base",
              device: "cpu",
            },
          },
        ],
      },
      created_at: Date.now(),
    };

    useTaskContextMock.mockReturnValue({
      tasks: [pipelineTask],
      connected: true,
      remoteTasksReady: true,
      tasksSettled: true,
      cancelTask: vi.fn(),
      addTask: vi.fn(),
    });

    const { result } = renderHook(() => useTranscriber());

    await waitFor(() => {
      expect(result.current.state.currentTranscriptionTaskId).toBe("pipeline-123");
    });
    expect(result.current.state.currentTranscriptionTask?.id).toBe("pipeline-123");
  });

  it("submits a transcribe pipeline with cpu as the default device", async () => {
    vi.mocked(apiClient.runPipeline).mockResolvedValue({
      task_id: "task-123",
      status: "pending",
    });
    clearElectronMock();

    const { result } = renderHook(() => useTranscriber());

    act(() => {
      result.current.actions.setFile({
        name: "sample.mp4",
        path: "E:/sample.mp4",
        size: 1024,
        type: "video/mp4",
      } as unknown as File);
    });

    await act(async () => {
      await result.current.actions.startTranscription();
    });

    expect(apiClient.runPipeline).toHaveBeenCalledTimes(1);
    expect(apiClient.runPipeline).toHaveBeenCalledWith({
      pipeline_id: "transcriber_tool",
      task_name: "Transcribe sample.mp4",
      steps: [
        {
          step_name: "transcribe",
          params: {
            audio_ref: expect.objectContaining({
              path: "E:/sample.mp4",
              name: "sample.mp4",
              size: 1024,
              type: "video/mp4",
            }),
            engine: "builtin",
            model: "base",
            device: "cpu",
            vad_filter: true,
          },
        },
      ],
    });
    expect(addTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "task-123",
        type: "pipeline",
        task_source: "backend",
        task_contract_version: 2,
        queue_state: "queued",
        request_params: expect.objectContaining({
          pipeline_id: "transcriber_tool",
          steps: [
            expect.objectContaining({
              step_name: "transcribe",
              params: expect.objectContaining({
                audio_ref: expect.objectContaining({
                  path: "E:/sample.mp4",
                  name: "sample.mp4",
                  size: 1024,
                  type: "video/mp4",
                }),
                engine: "builtin",
              }),
            }),
          ],
          video_ref: {
            path: "E:/sample.mp4",
            name: "sample.mp4",
            size: 1024,
            type: "video/mp4",
          },
        }),
      }),
    );
  });

  it("uses desktop worker transcription when available", async () => {
    const desktopTranscribe = vi.fn().mockResolvedValue({
      task_id: "desktop-transcribe-task",
      status: "pending",
    });

    installElectronMock({
      desktopTranscribe,
    });

    const { result } = renderHook(() => useTranscriber());

    act(() => {
      result.current.actions.setFile({
        name: "sample.mp4",
        path: "E:/sample.mp4",
        size: 1024,
        type: "video/mp4",
      } as unknown as File);
    });

    await act(async () => {
      await result.current.actions.startTranscription();
    });

    expect(desktopTranscribe).toHaveBeenCalledWith(expect.objectContaining({
      audio_ref: expect.objectContaining({
        path: "E:/sample.mp4",
        name: "sample.mp4",
        size: 1024,
        type: "video/mp4",
      }),
      engine: "builtin",
      model: "base",
      device: "cpu",
    }));
    expect(desktopTranscribe.mock.calls[0]?.[0]).not.toHaveProperty("audio_path");
    expect(apiClient.runPipeline).not.toHaveBeenCalled();
    expect(result.current.state.result).toBeNull();
    expect(addTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      id: "desktop-transcribe-task",
      type: "transcribe",
      status: "pending",
      task_source: "desktop",
    }));
  });

  it("repairs a stale cached path before invoking desktop transcription", async () => {
    const desktopTranscribe = vi.fn().mockResolvedValue({
      task_id: "desktop-transcribe-repaired-task",
      status: "pending",
    });

    installElectronMock({
      resolveExistingPath: vi.fn(async (filePath: string, fallbackName?: string) => {
        if (
          filePath === "E:/workspace/Patient Investor - 鈥淎I Won鈥檛 Replace Software!.mp4" &&
          fallbackName === "Patient Investor - “AI Won’t Replace Software!.mp4"
        ) {
          return "E:/workspace/Patient Investor - “AI Won’t Replace Software!.mp4";
        }
        return filePath;
      }),
      desktopTranscribe,
    });

    const { result } = renderHook(() => useTranscriber());

    act(() => {
      result.current.actions.setFile({
        name: "Patient Investor - “AI Won’t Replace Software!.mp4",
        path: "E:/workspace/Patient Investor - 鈥淎I Won鈥檛 Replace Software!.mp4",
        size: 1024,
        type: "video/mp4",
      } as unknown as File);
    });

    await act(async () => {
      await result.current.actions.startTranscription();
    });

    expect(desktopTranscribe).toHaveBeenCalledWith(expect.objectContaining({
      audio_ref: expect.objectContaining({
        path: "E:/workspace/Patient Investor - “AI Won’t Replace Software!.mp4",
        name: "Patient Investor - “AI Won’t Replace Software!.mp4",
        size: 1024,
        type: "video/mp4",
      }),
      engine: "builtin",
      model: "base",
      device: "cpu",
    }));
    expect(desktopTranscribe.mock.calls[0]?.[0]).not.toHaveProperty("audio_path");
    expect(addTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      id: "desktop-transcribe-repaired-task",
      type: "transcribe",
      status: "pending",
      task_source: "desktop",
    }));
    expect(result.current.state.file?.path).toBe(
      "E:/workspace/Patient Investor - “AI Won’t Replace Software!.mp4",
    );
  });

  it("repairs a stale restored transcriber snapshot before submission", async () => {
    localStorage.setItem(
      "transcriber_snapshot",
      JSON.stringify({
        schema_version: 2,
        lifecycle: {
          model: "history-only",
          device: "history-only",
          file: "history-only",
          result: "history-only",
        },
        payload: {
          model: "base",
          device: "cpu",
          result: null,
          file: {
            name: "Patient Investor - “AI Won’t Replace Software!.mp4",
            path: "E:/workspace/Patient Investor - 鈥淎I Won鈥檛 Replace Software!.mp4",
            size: 1024,
          },
        },
      }),
    );

    installElectronMock({
      resolveExistingPath: vi.fn(async (filePath: string, fallbackName?: string) => {
        if (
          filePath === "E:/workspace/Patient Investor - 鈥淎I Won鈥檛 Replace Software!.mp4" &&
          fallbackName === "Patient Investor - “AI Won’t Replace Software!.mp4"
        ) {
          return "E:/workspace/Patient Investor - “AI Won’t Replace Software!.mp4";
        }
        return filePath;
      }),
    });

    const { result } = renderHook(() => useTranscriber());

    await waitFor(() => {
      expect(result.current.state.file?.path).toBe(
        "E:/workspace/Patient Investor - “AI Won’t Replace Software!.mp4",
      );
    });
    expect(localStorage.getItem("transcriber_snapshot")).toBeTruthy();
  });

  it("restores transcriber state from the versioned snapshot only", async () => {
    localStorage.setItem(
      "transcriber_snapshot",
      JSON.stringify({
        schema_version: 2,
        payload: {
          model: "small",
          device: "cuda",
          currentTranscriptionTaskId: "task-snapshot",
          file: {
            path: "E:/snapshot.mp4",
            name: "snapshot.mp4",
            size: 2048,
            type: "video/mp4",
          },
          result: {
            segments: [{ id: "1", start: 0, end: 1, text: "snapshot" }],
            text: "snapshot",
            language: "en",
            subtitle_ref: {
              path: "E:/snapshot.srt",
              name: "snapshot.srt",
            },
          },
        },
      }),
    );

    useTaskContextMock.mockReturnValue({
      tasks: [],
      connected: true,
      remoteTasksReady: false,
      tasksSettled: false,
      cancelTask: vi.fn(),
      addTask: vi.fn(),
    });

    const { result } = renderHook(() => useTranscriber());

    await waitFor(() => {
      expect(result.current.state.file?.path).toBe("E:/snapshot.mp4");
    });

    expect(result.current.state.model).toBe("base");
    expect(result.current.state.device).toBe("cpu");
    expect(result.current.state.currentTranscriptionTaskId).toBeNull();
    expect(result.current.state.result?.text).toBe("snapshot");
    expect(localStorage.getItem("asr_execution_preferences")).toContain("\"model\":\"base\"");
    expect(localStorage.getItem("asr_execution_preferences")).toContain("\"device\":\"cpu\"");
  });

  it("persists transcriber document state separately from shared ASR preferences", async () => {
    clearElectronMock();

    const { result } = renderHook(() => useTranscriber());

    act(() => {
      result.current.actions.setFile({
        name: "snapshot-only.mp4",
        path: "E:/snapshot-only.mp4",
        size: 1024,
        type: "video/mp4",
      } as unknown as File);
    });

    await waitFor(() => {
      expect(localStorage.getItem("transcriber_snapshot")).toBeTruthy();
    });

    expect(localStorage.getItem("transcriber_snapshot")).not.toContain("\"currentTranscriptionTaskId\"");
    expect(localStorage.getItem("transcriber_snapshot")).not.toContain("\"model\"");
    expect(localStorage.getItem("transcriber_snapshot")).not.toContain("\"device\"");
    expect(localStorage.getItem("asr_execution_preferences")).toContain("\"model\":\"base\"");
    expect(localStorage.getItem("asr_execution_preferences")).toContain("\"device\":\"cpu\"");
  });

  it("falls back to replacing the basename when resolveExistingPath is unavailable", async () => {
    const desktopTranscribe = vi.fn().mockResolvedValue({
      task_id: "desktop-transcribe-basename-task",
      status: "pending",
    });

    installElectronMock({
      resolveExistingPath: undefined as never,
      desktopTranscribe,
    });

    const { result } = renderHook(() => useTranscriber());

    act(() => {
      result.current.actions.setFile({
        name: "Patient Investor - “AI Won’t Replace Software!.mp4",
        path: "E:/workspace/Patient Investor - 鈥淎I Won鈥檛 Replace Software!.mp4",
        size: 1024,
        type: "video/mp4",
      } as unknown as File);
    });

    await act(async () => {
      await result.current.actions.startTranscription();
    });

    expect(desktopTranscribe).toHaveBeenCalledWith(expect.objectContaining({
      audio_ref: expect.objectContaining({
        path: "E:/workspace/Patient Investor - “AI Won’t Replace Software!.mp4",
        name: "Patient Investor - “AI Won’t Replace Software!.mp4",
        size: 1024,
        type: "video/mp4",
      }),
      engine: "builtin",
      model: "base",
      device: "cpu",
    }));
    expect(desktopTranscribe.mock.calls[0]?.[0]).not.toHaveProperty("audio_path");
  });

  it("maps a completed task result back into transcriber state", async () => {
    const completedTask: Task = {
      id: "task-789",
      type: "pipeline",
      status: "completed",
      progress: 100,
      name: "Transcribe sample.mp4",
      message: "Pipeline completed",
      request_params: {
        pipeline_id: "transcriber_tool",
        ...createTranscribeStepRequestParams(),
      },
      result: {
        success: true,
        files: [
          {
            type: "subtitle",
            path: "E:/sample.srt",
          },
        ],
        meta: {
          text: "hello\nworld",
          language: "en",
          segments: [
            { id: "1", start: 0, end: 1, text: "hello" },
            { id: "2", start: 1, end: 2, text: "world" },
          ],
        },
      },
      created_at: Date.now(),
    };

    localStorage.setItem(
      "transcriber_snapshot",
      JSON.stringify({
        schema_version: 2,
        lifecycle: {
          model: "history-only",
          device: "history-only",
          file: "history-only",
          result: "history-only",
          currentTranscriptionTaskId: "runtime-only",
        },
        payload: {
          model: "base",
          device: "cpu",
          file: {
            name: "sample.mp4",
            path: "E:/sample.mp4",
            size: 1024,
          },
          result: null,
        },
      }),
    );

    useTaskContextMock.mockReturnValue({
      tasks: [completedTask],
      connected: true,
      remoteTasksReady: true,
      tasksSettled: true,
      cancelTask: vi.fn(),
      addTask: vi.fn(),
    });

    const { result } = renderHook(() => useTranscriber());

    await waitFor(() => {
      expect(result.current.state.currentTranscriptionTaskId).toBeNull();
    });

    expect(result.current.state.result).toMatchObject({
      segments: [
        { id: "1", start: 0, end: 1, text: "hello" },
        { id: "2", start: 1, end: 2, text: "world" },
      ],
      text: "hello\nworld",
      language: "en",
    });
    expectTranscriberResultMedia(result.current.state.result, {
      videoRef: {
        path: "E:/sample.mp4",
        name: "sample.mp4",
      },
      subtitleRef: {
        path: "E:/sample.srt",
        name: "sample.srt",
      },
    });
  });

  it("falls back to transcript when pipeline metadata has no text field", async () => {
    const completedTask: Task = {
      id: "task-790",
      type: "pipeline",
      status: "completed",
      progress: 100,
      name: "Transcribe sample.mp4",
      message: "Pipeline completed",
      request_params: {
        pipeline_id: "transcriber_tool",
        ...createTranscribeStepRequestParams(),
      },
      result: {
        success: true,
        files: [
          {
            type: "subtitle",
            path: "E:/sample.srt",
          },
        ],
        meta: {
          transcript: "stored transcript",
          segments: [{ id: "1", start: 0, end: 1, text: "hello" }],
        },
      },
      created_at: Date.now(),
    };

    localStorage.setItem(
      "transcriber_snapshot",
      JSON.stringify({
        schema_version: 2,
        lifecycle: {
          model: "history-only",
          device: "history-only",
          file: "history-only",
          result: "history-only",
          currentTranscriptionTaskId: "runtime-only",
        },
        payload: {
          model: "base",
          device: "cpu",
          file: {
            name: "sample.mp4",
            path: "E:/sample.mp4",
            size: 1024,
          },
          result: null,
        },
      }),
    );

    useTaskContextMock.mockReturnValue({
      tasks: [completedTask],
      connected: true,
      remoteTasksReady: true,
      tasksSettled: true,
      cancelTask: vi.fn(),
      addTask: vi.fn(),
    });

    const { result } = renderHook(() => useTranscriber());

    await waitFor(() => {
      expect(result.current.state.currentTranscriptionTaskId).toBeNull();
    });

    expect(result.current.state.result?.text).toBe("stored transcript");
    expect(result.current.state.result?.language).toBe("auto");
  });

  it("does not restore runtime-only currentTranscriptionTaskId during reload", async () => {
    localStorage.setItem(
      "transcriber_snapshot",
      JSON.stringify({
        schema_version: 2,
        lifecycle: {
          model: "history-only",
          device: "history-only",
          file: "history-only",
          result: "history-only",
          currentTranscriptionTaskId: "runtime-only",
        },
        payload: {
          model: "base",
          device: "cpu",
          currentTranscriptionTaskId: "task-pending-sync",
          file: {
            name: "sample.mp4",
            path: "E:/sample.mp4",
            size: 1024,
          },
          result: null,
        },
      }),
    );

    useTaskContextMock.mockReturnValue({
      tasks: [],
      connected: true,
      remoteTasksReady: false,
      tasksSettled: false,
      cancelTask: vi.fn(),
      addTask: vi.fn(),
    });

    const { result } = renderHook(() => useTranscriber());

    expect(result.current.state.currentTranscriptionTaskId).toBeNull();
    expect(result.current.state.currentTranscriptionTask).toBeNull();
  });

  it("writes smart-split output only through subtitle_ref path in desktop mode", async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);
    localStorage.setItem(
      "transcriber_snapshot",
      JSON.stringify({
        schema_version: 2,
        payload: {
          model: "base",
          device: "cpu",
          file: {
            path: "E:/sample.mp4",
            name: "sample.mp4",
            size: 1024,
            type: "video/mp4",
          },
          result: {
            text:
              "hello world this sentence is intentionally long enough to trigger smart split behavior, and the desktop runtime should persist the split output",
            language: "en",
            srt_path: "E:/stale/sample.srt",
            subtitle_ref: {
              path: "E:/canonical/sample.srt",
              name: "sample.srt",
            },
            segments: [
              {
                id: "1",
                start: 0,
                end: 6,
                text:
                  "hello world this sentence is intentionally long enough to trigger smart split behavior, and the desktop runtime should persist the split output",
              },
            ],
          },
        },
      }),
    );
    installElectronMock({
      writeFile,
    });

    const { result } = renderHook(() => useTranscriber());

    await waitFor(() => {
      expect(result.current.state.result?.subtitle_ref?.path).toBe(
        "E:/canonical/sample.srt",
      );
    });

    await act(async () => {
      await result.current.actions.smartSplitSegments();
    });

    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledWith(
      "E:/canonical/sample.srt",
      expect.any(String),
    );
  });
});
