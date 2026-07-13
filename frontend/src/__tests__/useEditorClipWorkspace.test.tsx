import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TASK_CONTRACT_VERSION } from "../contracts/runtimeContracts";
import { useEditorClipWorkspace } from "../hooks/editor/useEditorClipWorkspace";
import { createTaskExecutionOutcome } from "../services/domain/taskSubmission";
import type { EditorDocument } from "../stores/editorDocument";
import type { Task } from "../types/task";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const editorServiceMock = vi.hoisted(() => ({
  detectHighlightCandidates: vi.fn(),
  exportClipSegments: vi.fn(),
}));

const taskContextMock = vi.hoisted(() => ({
  tasks: [] as Task[],
  addTask: vi.fn(),
}));

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../services/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/domain")>();
  return {
    ...actual,
    editorService: editorServiceMock,
  };
});

vi.mock("../context/taskContext", () => ({
  useTaskContext: () => taskContextMock,
}));

vi.mock("../utils/toast", () => ({ toast: toastMock }));

function createDocument(videoPath = "D:/media/source.mp4"): EditorDocument {
  return {
    documentId: `editor:${videoPath}`,
    video: { path: videoPath, name: "source.mp4" },
    subtitle: { path: "D:/media/source.srt", name: "source.srt" },
    previewUrl: `media://${videoPath}`,
    regions: [{ id: "1", start: 0, end: 3, text: "subtitle" }],
    revision: 1,
    savedRevision: 1,
  };
}

function createVideoElementRef() {
  return {
    current: {
      currentTime: 0,
      duration: 120,
      videoWidth: 1920,
      videoHeight: 1080,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
    } as unknown as HTMLVideoElement,
  } as React.RefObject<HTMLVideoElement | null>;
}

function createOutcome(taskId: string) {
  return createTaskExecutionOutcome({
    task_id: taskId,
    status: "pending",
    task_source: "backend",
    task_contract_version: TASK_CONTRACT_VERSION,
    revision: 0,
    persistence_scope: "runtime",
    lifecycle: "resumable",
    queue_state: "queued",
    queue_position: 0,
    primary_operation: "clip_export",
    message_code: "queued",
    message_params: {},
  });
}

describe("useEditorClipWorkspace", () => {
  beforeEach(() => {
    editorServiceMock.detectHighlightCandidates.mockReset();
    editorServiceMock.exportClipSegments.mockReset();
    taskContextMock.addTask.mockReset();
    taskContextMock.tasks = [];
    toastMock.success.mockReset();
    toastMock.warning.mockReset();
    toastMock.error.mockReset();
  });

  it("submits the canonical MediaReference when detecting highlights", async () => {
    const document = createDocument();
    editorServiceMock.detectHighlightCandidates.mockResolvedValue({
      candidates: [
        {
          id: "clip-1",
          start: 4,
          end: 18,
          title: "Highlight",
          reason: "Reason",
          score: 95,
          transcript: "subtitle",
          selected: true,
        },
      ],
      source: "llm",
      duration: 120,
    });

    const { result } = renderHook(() =>
      useEditorClipWorkspace({
        document,
        mediaUrl: document.previewUrl,
        waveformReady: true,
        videoElementRef: createVideoElementRef(),
        saveSubtitleFile: vi.fn(),
        setContextMenu: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.handleDetectHighlights();
    });

    expect(editorServiceMock.detectHighlightCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ video_ref: document.video }),
    );
    expect(result.current.workspaceMode).toBe("clips");
    expect(result.current.candidates).toHaveLength(1);
    expect(result.current.activeClipId).toBe("clip-1");
  });

  it("does not attach a completed submission to a newly opened MediaReference", async () => {
    const firstDocument = createDocument("D:/media/first.mp4");
    const secondDocument = createDocument("D:/media/second.mp4");
    let resolveExport: ((value: ReturnType<typeof createOutcome>) => void) | null = null;
    editorServiceMock.exportClipSegments.mockReturnValue(
      new Promise((resolve) => {
        resolveExport = resolve;
      }),
    );

    const videoElementRef = createVideoElementRef();
    const saveSubtitleFile = vi.fn();
    const setContextMenu = vi.fn();
    const { result, rerender } = renderHook(
      ({ document }: { document: EditorDocument }) =>
        useEditorClipWorkspace({
          document,
          mediaUrl: document.previewUrl,
          waveformReady: true,
          videoElementRef,
          saveSubtitleFile,
          setContextMenu,
        }),
      { initialProps: { document: firstDocument } },
    );

    let submission: Promise<boolean>;
    act(() => {
      submission = result.current.submitClipExport(
        [{ id: "clip-1", start: 0, end: 10, title: "Clip" }],
        {
          options: {},
          outputRef: null,
          outputDir: "D:/media/first_clips",
          watermarkRef: null,
          subtitleEnabled: false,
          watermarkEnabled: false,
        },
      );
    });

    rerender({ document: secondDocument });
    await act(async () => {
      resolveExport?.(createOutcome("clip-export-1"));
      await submission!;
    });

    expect(editorServiceMock.exportClipSegments).toHaveBeenCalledWith(
      expect.objectContaining({ video_ref: firstDocument.video }),
    );
    expect(taskContextMock.addTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: "clip-export-1", type: "clip_export" }),
    );
    expect(toastMock.success).not.toHaveBeenCalledWith("clips.exportQueued");
    expect(result.current.exportTask).toBeNull();
  });

  it("tracks the submitted task and projects completed output artifacts", async () => {
    const document = createDocument();
    editorServiceMock.exportClipSegments.mockResolvedValue(
      createOutcome("clip-export-2"),
    );
    const videoElementRef = createVideoElementRef();
    const { result, rerender } = renderHook(() =>
      useEditorClipWorkspace({
        document,
        mediaUrl: document.previewUrl,
        waveformReady: true,
        videoElementRef,
        saveSubtitleFile: vi.fn(),
        setContextMenu: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.submitClipExport(
        [{ id: "clip-1", start: 0, end: 10, title: "Clip" }],
        {
          options: {},
          outputRef: null,
          outputDir: "D:/media/source_clips",
          watermarkRef: null,
          subtitleEnabled: false,
          watermarkEnabled: false,
        },
      );
    });

    const submittedTask = taskContextMock.addTask.mock.calls[0]?.[0] as Task;
    taskContextMock.tasks = [
      {
        ...submittedTask,
        status: "completed",
        progress: 100,
        queue_state: "completed",
        artifacts: [
          {
            kind: "video",
            role: "output",
            ref: { path: "D:/media/source_clips/clip-1.mp4", name: "clip-1.mp4" },
          },
        ],
      },
    ];
    await act(async () => {
      rerender();
    });

    expect(result.current.exportTask).toMatchObject({
      status: "completed",
      outputCount: 1,
    });
    expect(toastMock.success).toHaveBeenCalledWith("clips.exportQueued");
    expect(toastMock.success).toHaveBeenCalledWith("clips.exportCompleted");
  });
});
