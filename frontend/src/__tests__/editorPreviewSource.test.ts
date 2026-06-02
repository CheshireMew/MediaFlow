import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canUseOriginalMediaUrlForEditorPreview,
  resolveEditorPreviewMediaUrl,
} from "../hooks/editor/editorPreviewSource";
import { editorService } from "../services/domain";
import { installElectronMock } from "./testUtils/electronMock";

describe("editorPreviewSource", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses original media URLs for browser-playable media", async () => {
    const previewSpy = vi.spyOn(editorService, "resolvePreviewMediaSource");

    await expect(resolveEditorPreviewMediaUrl("E:/media/source.mp4")).resolves.toContain(
      "source.mp4",
    );
    expect(canUseOriginalMediaUrlForEditorPreview("E:/media/source.mp4")).toBe(true);
    expect(previewSpy).not.toHaveBeenCalled();
  });

  it("uses backend remuxed preview media for transport streams", async () => {
    installElectronMock();
    vi.spyOn(editorService, "resolvePreviewMediaSource").mockResolvedValue({
      source_ref: { path: "E:/media/source.ts", name: "source.ts" },
      media_ref: { path: "E:/cache/source-preview.mp4", name: "source-preview.mp4" },
      remuxed: true,
    });

    await expect(resolveEditorPreviewMediaUrl("E:/media/source.ts")).resolves.toContain(
      "source-preview.mp4",
    );
    expect(canUseOriginalMediaUrlForEditorPreview("E:/media/source.ts")).toBe(false);
  });
});
