import { act, fireEvent, renderHook, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useEditorFileLoader } from "../hooks/editor/useEditorFileLoader";
import { editorService } from "../services/domain";
import { useEditorStore } from "../stores/editorStore";
import type { ElectronAPI } from "../contracts/desktopBridgeContract";
import { resetEditorStoreForTests } from "./testFixtures";
import { installElectronMock } from "./testUtils/electronMock";
import { ConfirmationProvider } from "../components/ui/ConfirmationProvider";
import i18n from "../i18n";
import { createEditorDocument } from "../stores/editorDocument";

describe("useEditorFileLoader", () => {
  beforeEach(() => {
    resetEditorStoreForTests();

    installElectronMock({
      readFile: vi.fn(),
      getFileSize: vi.fn().mockResolvedValue(1024),
    });
  });

  test("stores media refs when loading a subtitle with a related video", async () => {
    const subtitlePath = "E:/subs/demo.srt";
    const videoPath = "E:/subs/demo.mp4";
    const electronAPI = (window as unknown as Window & { electronAPI: ElectronAPI }).electronAPI;

    vi.mocked(electronAPI.readFile).mockImplementation(async (path: string) => {
      if (path === subtitlePath) {
        return "1\n00:00:00,000 --> 00:00:01,000\nhello\n";
      }
      return "";
    });

    const { result } = renderHook(() => useEditorFileLoader(), {
      wrapper: ConfirmationProvider,
    });

    await act(async () => {
      await result.current.loadSubtitleFromPath({ path: subtitlePath, name: "demo.srt" });
    });

    await waitFor(() => {
      expect(useEditorStore.getState().document.video?.path).toBe(videoPath);
    });

    expect(useEditorStore.getState().document.video).toEqual({
      path: videoPath,
      name: "demo.mp4",
    });
    expect(useEditorStore.getState().document.subtitle).toEqual({
      path: subtitlePath,
      name: "demo.srt",
    });
  });

  test("opens subtitles through the generic subtitle dialog profile", async () => {
    const electronAPI = (window as unknown as Window & { electronAPI: ElectronAPI }).electronAPI;
    vi.mocked(electronAPI.openFile).mockResolvedValue(null);
    const { result } = renderHook(() => useEditorFileLoader(), {
      wrapper: ConfirmationProvider,
    });

    await act(async () => {
      await result.current.handleOpenSubtitle();
    });

    expect(electronAPI.openFile).toHaveBeenCalledWith({ profile: "subtitle" });
  });

  test("loads a transport stream video when the subtitle keeps the media suffix", async () => {
    const subtitlePath = "E:/subs/demo.ts.srt";
    const videoPath = "E:/subs/demo.ts";
    const electronAPI = (window as unknown as Window & { electronAPI: ElectronAPI }).electronAPI;

    vi.mocked(electronAPI.readFile).mockImplementation(async (path: string) => {
      if (path === subtitlePath) {
        return "1\n00:00:00,000 --> 00:00:01,000\nhello\n";
      }
      return "";
    });
    vi.mocked(electronAPI.getFileSize).mockImplementation(async (path: string) => {
      if (path === videoPath) {
        return 1024;
      }
      throw new Error(`Missing file: ${path}`);
    });
    vi.spyOn(editorService, "resolvePreviewMediaSource").mockResolvedValue({
      source_ref: { path: videoPath, name: "demo.ts" },
      media_ref: { path: "E:/preview/demo.mp4", name: "demo.mp4" },
      remuxed: true,
    });

    const { result } = renderHook(() => useEditorFileLoader(), {
      wrapper: ConfirmationProvider,
    });

    await act(async () => {
      await result.current.loadSubtitleFromPath({ path: subtitlePath, name: "new.srt" });
    });

    await waitFor(() => {
      expect(useEditorStore.getState().document.video?.path).toBe(videoPath);
    });

    expect(useEditorStore.getState().document.video).toEqual({
      path: videoPath,
      name: "demo.ts",
    });
    expect(useEditorStore.getState().document.previewUrl).toContain("demo.mp4");
  });

  test("keeps the current document when the user rejects an unsaved switch", async () => {
    useEditorStore.setState({
      document: {
        ...createEditorDocument(
          {
            video: { path: "E:/old.mp4", name: "old.mp4" },
            subtitle: { path: "E:/old.srt", name: "old.srt" },
            previewUrl: "file:///E:/old.mp4",
            regions: [{ id: "1", start: 0, end: 1, text: "unsaved" }],
          },
          2,
        ),
        savedRevision: 1,
      },
      revisionClock: 2,
    });
    const { result } = renderHook(() => useEditorFileLoader(), {
      wrapper: ConfirmationProvider,
    });

    let loadPromise: Promise<boolean>;
    act(() => {
      loadPromise = result.current.loadMediaAndResources({ path: "E:/new.mp4", name: "new.mp4" });
    });
    fireEvent.click(await screen.findByRole("button", {
      name: i18n.t("document.discardChangesCancel", { ns: "editor" }),
    }));
    await act(async () => {
      await loadPromise!;
    });

    expect(useEditorStore.getState().document.video?.path).toBe("E:/old.mp4");
    expect(useEditorStore.getState().document.regions[0].text).toBe("unsaved");
  });

  test("atomically clears stale subtitles when the new video has no related subtitle", async () => {
    useEditorStore.setState({
      document: createEditorDocument({
        video: { path: "E:/old.mp4", name: "old.mp4" },
        subtitle: { path: "E:/old.srt", name: "old.srt" },
        previewUrl: "file:///E:/old.mp4",
        regions: [{ id: "1", start: 0, end: 1, text: "old" }],
      }),
    });
    const electronAPI = (window as unknown as Window & { electronAPI: ElectronAPI }).electronAPI;
    vi.mocked(electronAPI.readFile).mockResolvedValue(null);
    const { result } = renderHook(() => useEditorFileLoader(), {
      wrapper: ConfirmationProvider,
    });

    await act(async () => {
      await result.current.loadMediaAndResources({ path: "E:/new.mp4", name: "new.mp4" });
    });

    const document = useEditorStore.getState().document;
    expect(document.video?.path).toBe("E:/new.mp4");
    expect(document.subtitle).toBeNull();
    expect(document.regions).toEqual([]);
    expect(document.revision).toBe(document.savedRevision);
  });
});
