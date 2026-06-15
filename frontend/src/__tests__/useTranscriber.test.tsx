import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTranscriber } from "../hooks/useTranscriber";
import type { Task, TaskArtifact } from "../types/task";
import { apiClient } from "../api/client";
import {
  BACKEND_TASK_CONTRACT_FIELDS,
  createTranscribeStepRequestParams,
} from "./testFixtures";
import { clearElectronMock, installElectronMock } from "./testUtils/electronMock";
import type { MockedElectronAPI } from "./testUtils/electronMock";
import { readUiStateValue, writeUiStateValue } from "../services/persistence/uiStateSettings";
import { ASR_EXECUTION_PREFERENCES } from "../contracts/runtimeContracts";

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
    prewarmFasterWhisperCli: vi.fn(),
  },
}));

describe("useTranscriber", () => {
  let electronMock: MockedElectronAPI;

  const artifact = (
    kind: "video" | "audio" | "subtitle" | "image" | "file",
    role: "input" | "output" | "context",
    path: string,
    name: string,
  ): TaskArtifact => ({ kind, role, ref: { path, name } });

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
      ui_state: {},
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
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "pipeline-123",
      type: "pipeline",
      primary_operation: "transcribe",
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
              audio_ref: {
                path: "E:/sample.mp4",
                name: "sample.mp4",
              },
              model: "base",
              device: "cpu",
            },
          },
        ],
      },
      artifacts: [artifact("video", "input", "E:/sample.mp4", "sample.mp4")],
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
      task_source: "backend",
      task_contract_version: 2,
      persistence_scope: "runtime",
      lifecycle: "resumable",
      queue_state: "queued",
      queue_position: null,
      primary_operation: "transcribe",
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

  it("submits transcription as a backend task in desktop runtime", async () => {
    vi.mocked(apiClient.runPipeline).mockResolvedValue({
      task_id: "backend-transcribe-task",
      status: "pending",
      task_source: "backend",
      task_contract_version: 2,
      persistence_scope: "runtime",
      lifecycle: "resumable",
      queue_state: "queued",
      queue_position: null,
      primary_operation: "transcribe",
    });

    installElectronMock();

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

    expect(apiClient.runPipeline).toHaveBeenCalledWith(expect.objectContaining({
      steps: expect.arrayContaining([
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
            model: "base",
            device: "cpu",
          }),
        }),
      ]),
    }));
    expect(result.current.state.result).toBeNull();
    expect(addTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      id: "backend-transcribe-task",
      type: "pipeline",
      primary_operation: "transcribe",
      status: "pending",
      task_source: "backend",
    }));
  });


  it("restores transcriber state from the versioned snapshot only", async () => {
    writeUiStateValue(
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
    expect(readUiStateValue<string>(ASR_EXECUTION_PREFERENCES.key)).toBeNull();
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
      expect(readUiStateValue("transcriber_snapshot")).toBeTruthy();
    });

    expect(readUiStateValue<string>("transcriber_snapshot")).not.toContain("\"currentTranscriptionTaskId\"");
    expect(readUiStateValue<string>("transcriber_snapshot")).not.toContain("\"model\"");
    expect(readUiStateValue<string>("transcriber_snapshot")).not.toContain("\"device\"");
    expect(readUiStateValue<string>(ASR_EXECUTION_PREFERENCES.key)).toBeNull();
  });

  it("persists shared ASR preferences only through ASR setting actions", async () => {
    const { result } = renderHook(() => useTranscriber());

    expect(readUiStateValue<string>(ASR_EXECUTION_PREFERENCES.key)).toBeNull();

    act(() => {
      result.current.actions.setModel("small");
      result.current.actions.setDevice("cuda");
      result.current.actions.setEngine("cli");
    });

    expect(readUiStateValue<string>(ASR_EXECUTION_PREFERENCES.key)).toContain("\"model\":\"small\"");
    expect(readUiStateValue<string>(ASR_EXECUTION_PREFERENCES.key)).toContain("\"device\":\"cuda\"");
    expect(readUiStateValue<string>(ASR_EXECUTION_PREFERENCES.key)).toContain("\"engine\":\"cli\"");
  });


  it("maps a completed task result back into transcriber state", async () => {
    const completedTask: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-789",
      type: "pipeline",
      primary_operation: "transcribe",
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
      artifacts: [
        artifact("video", "input", "E:/sample.mp4", "sample.mp4"),
        artifact("subtitle", "output", "E:/sample.srt", "sample.srt"),
      ],
      created_at: Date.now(),
    };

    writeUiStateValue(
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
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-790",
      type: "pipeline",
      primary_operation: "transcribe",
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
      artifacts: [
        artifact("video", "input", "E:/sample.mp4", "sample.mp4"),
        artifact("subtitle", "output", "E:/sample.srt", "sample.srt"),
      ],
      created_at: Date.now(),
    };

    writeUiStateValue(
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
    writeUiStateValue(
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
    writeUiStateValue(
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
                ...BACKEND_TASK_CONTRACT_FIELDS,
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
