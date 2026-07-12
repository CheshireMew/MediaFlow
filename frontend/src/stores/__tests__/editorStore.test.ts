import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore } from "../editorStore";
import type { SubtitleSegment } from "../../types/task";
import { createEditorDocument, createEmptyEditorDocument } from "../editorDocument";
import { isEditorDocumentDirty } from "../editorDocument";

function loadRegions(regions: SubtitleSegment[]) {
  useEditorStore.getState().replaceEditorDocument({
    video: null,
    subtitle: null,
    previewUrl: null,
    regions,
  });
}

describe("useEditorStore", () => {
  beforeEach(() => {
    useEditorStore.setState({
      document: createEmptyEditorDocument(),
      revisionClock: 0,
      activeSegmentId: null,
      selectedIds: [],
      past: [],
      future: [],
    });
  });

  it("should set regions", () => {
    const regions: SubtitleSegment[] = [{ id: "1", start: 0, end: 10, text: "test" }];
    loadRegions(regions);
    expect(useEditorStore.getState().document.regions).toHaveLength(1);
    expect(useEditorStore.getState().document.regions[0].text).toBe("test");
  });

  it("should select segment", () => {
    useEditorStore.getState().selectSegment("1", false, false);
    expect(useEditorStore.getState().selectedIds).toContain("1");
    expect(useEditorStore.getState().activeSegmentId).toBe("1");
  });

  it("should delete segments", () => {
    const regions: SubtitleSegment[] = [
      { id: "1", start: 0, end: 5, text: "1" },
      { id: "2", start: 5, end: 10, text: "2" },
    ];
    loadRegions(regions);
    useEditorStore.getState().deleteSegments(["1"]);
    expect(useEditorStore.getState().document.regions).toHaveLength(1);
    expect(useEditorStore.getState().document.regions[0].id).toBe("2");
  });

  it("should merge subtitle text without inserting spaces", () => {
    const regions: SubtitleSegment[] = [
      { id: "1", start: 0, end: 5, text: "第一句" },
      { id: "2", start: 5, end: 10, text: "第二句" },
    ];

    loadRegions(regions);
    useEditorStore.getState().mergeSegments(["1", "2"]);

    expect(useEditorStore.getState().document.regions).toHaveLength(1);
    expect(useEditorStore.getState().document.regions[0]).toMatchObject({
      id: "1",
      start: 0,
      end: 10,
      text: "第一句第二句",
    });
  });

  it("should undo a timing edit in a single step", () => {
    const regions: SubtitleSegment[] = [
      { id: "1", start: 0, end: 5, text: "1" },
    ];

    loadRegions(regions);
    useEditorStore.getState().snapshot();
    useEditorStore.getState().updateRegion("1", { start: 1 });

    expect(useEditorStore.getState().document.regions[0].start).toBe(1);

    useEditorStore.getState().undo();

    expect(useEditorStore.getState().document.regions[0].start).toBe(0);
    expect(useEditorStore.getState().past).toHaveLength(0);
  });

  it("should undo a text edit from updateRegionText in a single step", () => {
    const regions: SubtitleSegment[] = [
      { id: "1", start: 0, end: 5, text: "before" },
    ];

    loadRegions(regions);
    useEditorStore.getState().updateRegionText("1", "after");

    expect(useEditorStore.getState().document.regions[0].text).toBe("after");
    expect(useEditorStore.getState().past).toHaveLength(1);

    useEditorStore.getState().undo();

    expect(useEditorStore.getState().document.regions[0].text).toBe("before");
    expect(useEditorStore.getState().past).toHaveLength(0);
  });

  it("should reset selection and history when replacing the editor document", () => {
    useEditorStore.setState({
      document: createEditorDocument({
        video: null,
        subtitle: null,
        previewUrl: null,
        regions: [{ id: "old", start: 0, end: 1, text: "old" }],
      }),
      activeSegmentId: "old",
      selectedIds: ["old"],
      past: [{ regions: [{ id: "past", start: 0, end: 1, text: "past" }], revision: 0 }],
      future: [{ regions: [{ id: "future", start: 0, end: 1, text: "future" }], revision: 0 }],
    });

    useEditorStore.getState().replaceEditorDocument({
      video: null,
      subtitle: null,
      previewUrl: null,
      regions: [{ id: "new", start: 2, end: 3, text: "new" }],
    });

    expect(useEditorStore.getState().document.regions).toEqual([
      { id: "new", start: 2, end: 3, text: "new" },
    ]);
    expect(useEditorStore.getState().activeSegmentId).toBeNull();
    expect(useEditorStore.getState().selectedIds).toEqual([]);
    expect(useEditorStore.getState().past).toEqual([]);
    expect(useEditorStore.getState().future).toEqual([]);
  });

  it("preserves valid selection when explicitly reloading the same editor document", () => {
    useEditorStore.setState({
      document: createEditorDocument({
        video: null,
        subtitle: null,
        previewUrl: null,
        regions: [
          { id: "1", start: 0, end: 1, text: "before 1" },
          { id: "2", start: 1, end: 2, text: "before 2" },
        ],
      }),
      activeSegmentId: "2",
      selectedIds: ["1", "2"],
      past: [{ regions: [{ id: "past", start: 0, end: 1, text: "past" }], revision: 0 }],
      future: [{ regions: [{ id: "future", start: 0, end: 1, text: "future" }], revision: 0 }],
    });

    useEditorStore.getState().replaceEditorDocument(
      {
        video: null,
        subtitle: null,
        previewUrl: null,
        regions: [
          { id: "1", start: 0, end: 1, text: "after 1" },
          { id: "2", start: 1, end: 2, text: "after 2" },
        ],
      },
      { preserveSelection: true },
    );

    expect(useEditorStore.getState().activeSegmentId).toBe("2");
    expect(useEditorStore.getState().selectedIds).toEqual(["1", "2"]);
    expect(useEditorStore.getState().past).toEqual([]);
    expect(useEditorStore.getState().future).toEqual([]);
  });

  it("should undo a full-region replacement in a single step", () => {
    loadRegions([
      { id: "1", start: 0, end: 1, text: "before" },
    ]);

    useEditorStore.getState().replaceRegionsWithUndo([
      { id: "2", start: 1, end: 2, text: "after" },
    ]);

    expect(useEditorStore.getState().document.regions).toEqual([
      { id: "2", start: 1, end: 2, text: "after" },
    ]);
    expect(useEditorStore.getState().past).toHaveLength(1);

    useEditorStore.getState().undo();

    expect(useEditorStore.getState().document.regions).toEqual([
      { id: "1", start: 0, end: 1, text: "before" },
    ]);
    expect(useEditorStore.getState().past).toHaveLength(0);
  });

  it("tracks save state by revision and returns to clean after undo", () => {
    loadRegions([{ id: "1", start: 0, end: 1, text: "before" }]);
    const subtitle = { path: "E:/video.srt", name: "video.srt" };
    useEditorStore.getState().markDocumentSaved(subtitle);
    expect(isEditorDocumentDirty(useEditorStore.getState().document)).toBe(false);

    useEditorStore.getState().updateRegionText("1", "after");
    expect(isEditorDocumentDirty(useEditorStore.getState().document)).toBe(true);

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().document.regions[0].text).toBe("before");
    expect(isEditorDocumentDirty(useEditorStore.getState().document)).toBe(false);
  });

  it("coalesces consecutive text input into one undo step", () => {
    loadRegions([{ id: "1", start: 0, end: 1, text: "" }]);
    useEditorStore.getState().updateRegionText("1", "a");
    useEditorStore.getState().updateRegionText("1", "ab");
    useEditorStore.getState().updateRegionText("1", "abc");

    expect(useEditorStore.getState().past).toHaveLength(1);
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().document.regions[0].text).toBe("");
  });
});
