import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTranslatorEditorNavigationPayload,
  useTranslatorOutputActions,
} from "../hooks/translator/useTranslatorOutputActions";
import { resolveNavigationMediaPayload } from "../services/ui/navigation";
import { useTranslatorStore } from "../stores/translatorStore";
import { installElectronMock } from "./testUtils/electronMock";

describe("useTranslatorOutputActions", () => {
  beforeEach(() => {
    useTranslatorStore.setState({
      sourceSegments: [{ id: "1", start: 0, end: 1, text: "hello" }],
      targetSegments: [{ id: "1", start: 0, end: 1, text: "你好" }],
      glossary: [],
      sourceFilePath: "E:/subs/demo.srt",
      sourceFileRef: { path: "E:/subs/demo.srt", name: "demo.srt" },
      targetSubtitleRef: {
        path: "E:/subs/demo_CN.srt",
        name: "demo_CN.srt",
        type: "application/x-subrip",
      },
      targetLang: "Chinese",
      mode: "standard",
      activeMode: null,
      resultMode: "standard",
      taskId: null,
      taskStatus: "completed",
      progress: 100,
      taskError: null,
      executionMode: null,
    });

    installElectronMock({
      getFileSize: vi.fn(async (targetPath: string) => {
        if (targetPath === "E:/subs/demo.mp4") {
          return 1024;
        }
        throw new Error(`Missing file: ${targetPath}`);
      }),
      writeFile: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("prefers target subtitle ref when navigating to editor", async () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    const electronApi = installElectronMock({
      getFileSize: vi.fn(async (targetPath: string) => {
        if (targetPath === "E:/subs/demo.mp4") {
          return 1024;
        }
        throw new Error(`Missing file: ${targetPath}`);
      }),
      writeFile: vi.fn().mockResolvedValue(undefined),
    });
    const { result } = renderHook(() => useTranslatorOutputActions());

    await act(async () => {
      await result.current.handleOpenInEditor();
    });

    expect(electronApi.writeFile).toHaveBeenCalledWith(
      "E:/subs/demo_CN.srt",
      expect.any(String),
    );

    const event = dispatchSpy.mock.calls[0]?.[0] as CustomEvent;
    expect(event.type).toBe("mediaflow:navigate");
    expect(event.detail).toEqual(
      expect.objectContaining({
        destination: "editor",
        payload: expect.objectContaining({
          subtitle_path: null,
          subtitle_ref: expect.objectContaining({
            path: "E:/subs/demo_CN.srt",
            name: "demo_CN.srt",
            type: "application/x-subrip",
          }),
        }),
      }),
    );
  });

  it("builds editor navigation payloads with canonical subtitle refs", () => {
    expect(
      createTranslatorEditorNavigationPayload({
        videoPath: "E:/workspace/demo.mp4",
        subtitlePath: "E:/workspace/demo_CN.srt",
        targetSubtitleRef: {
          path: "E:/canonical/demo_CN.srt",
          name: "demo_CN.srt",
          type: "application/x-subrip",
        },
      }),
    ).toEqual({
      video_path: null,
      subtitle_path: null,
      video_ref: {
        path: "E:/workspace/demo.mp4",
        name: "demo.mp4",
        size: undefined,
        type: undefined,
        media_id: undefined,
        media_kind: undefined,
        role: undefined,
        origin: undefined,
      },
      subtitle_ref: {
        path: "E:/canonical/demo_CN.srt",
        name: "demo_CN.srt",
        type: "application/x-subrip",
        size: undefined,
        media_id: undefined,
        media_kind: undefined,
        role: undefined,
        origin: undefined,
      },
    });
    expect(
      resolveNavigationMediaPayload(
        createTranslatorEditorNavigationPayload({
          videoPath: "E:/workspace/demo.mp4",
          subtitlePath: "E:/workspace/demo_CN.srt",
          targetSubtitleRef: {
            path: "E:/canonical/demo_CN.srt",
            name: "demo_CN.srt",
            type: "application/x-subrip",
          },
        }),
      ),
    ).toEqual({
      videoPath: "E:/workspace/demo.mp4",
      subtitlePath: "E:/canonical/demo_CN.srt",
      videoRef: {
        path: "E:/workspace/demo.mp4",
        name: "demo.mp4",
        size: undefined,
        type: undefined,
        media_id: undefined,
        media_kind: undefined,
        role: undefined,
        origin: undefined,
      },
      subtitleRef: {
        path: "E:/canonical/demo_CN.srt",
        name: "demo_CN.srt",
        size: undefined,
        type: "application/x-subrip",
        media_id: undefined,
        media_kind: undefined,
        role: undefined,
        origin: undefined,
      },
    });
  });
});
