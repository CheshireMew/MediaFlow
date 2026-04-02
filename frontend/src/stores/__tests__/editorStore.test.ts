import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore } from "../editorStore";
import type { SubtitleSegment } from "../../types/task";

describe("useEditorStore", () => {
  beforeEach(() => {
    useEditorStore.setState({
      regions: [],
      activeSegmentId: null,
      selectedIds: [],
      past: [],
      future: [],
    });
  });

  it("should set regions", () => {
    const regions: SubtitleSegment[] = [{ id: "1", start: 0, end: 10, text: "test" }];
    useEditorStore.getState().setRegions(regions);
    expect(useEditorStore.getState().regions).toHaveLength(1);
    expect(useEditorStore.getState().regions[0].text).toBe("test");
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
    useEditorStore.getState().setRegions(regions);
    useEditorStore.getState().deleteSegments(["1"]);
    expect(useEditorStore.getState().regions).toHaveLength(1);
    expect(useEditorStore.getState().regions[0].id).toBe("2");
  });

  it("should merge subtitle text without inserting spaces", () => {
    const regions: SubtitleSegment[] = [
      { id: "1", start: 0, end: 5, text: "第一句" },
      { id: "2", start: 5, end: 10, text: "第二句" },
    ];

    useEditorStore.getState().setRegions(regions);
    useEditorStore.getState().mergeSegments(["1", "2"]);

    expect(useEditorStore.getState().regions).toHaveLength(1);
    expect(useEditorStore.getState().regions[0]).toMatchObject({
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

    useEditorStore.getState().setRegions(regions);
    useEditorStore.getState().snapshot();
    useEditorStore.getState().updateRegion("1", { start: 1 });

    expect(useEditorStore.getState().regions[0].start).toBe(1);

    useEditorStore.getState().undo();

    expect(useEditorStore.getState().regions[0].start).toBe(0);
    expect(useEditorStore.getState().past).toHaveLength(0);
  });

  it("should undo a text edit from updateRegionText in a single step", () => {
    const regions: SubtitleSegment[] = [
      { id: "1", start: 0, end: 5, text: "before" },
    ];

    useEditorStore.getState().setRegions(regions);
    useEditorStore.getState().updateRegionText("1", "after");

    expect(useEditorStore.getState().regions[0].text).toBe("after");
    expect(useEditorStore.getState().past).toHaveLength(1);

    useEditorStore.getState().undo();

    expect(useEditorStore.getState().regions[0].text).toBe("before");
    expect(useEditorStore.getState().past).toHaveLength(0);
  });

  it("should reset selection and history when replacing the editor document", () => {
    useEditorStore.setState({
      regions: [{ id: "old", start: 0, end: 1, text: "old" }],
      activeSegmentId: "old",
      selectedIds: ["old"],
      past: [[{ id: "past", start: 0, end: 1, text: "past" }]],
      future: [[{ id: "future", start: 0, end: 1, text: "future" }]],
    });

    useEditorStore.getState().replaceEditorDocument([
      { id: "new", start: 2, end: 3, text: "new" },
    ]);

    expect(useEditorStore.getState().regions).toEqual([
      { id: "new", start: 2, end: 3, text: "new" },
    ]);
    expect(useEditorStore.getState().activeSegmentId).toBeNull();
    expect(useEditorStore.getState().selectedIds).toEqual([]);
    expect(useEditorStore.getState().past).toEqual([]);
    expect(useEditorStore.getState().future).toEqual([]);
  });

  it("should undo a full-region replacement in a single step", () => {
    useEditorStore.getState().setRegions([
      { id: "1", start: 0, end: 1, text: "before" },
    ]);

    useEditorStore.getState().replaceRegionsWithUndo([
      { id: "2", start: 1, end: 2, text: "after" },
    ]);

    expect(useEditorStore.getState().regions).toEqual([
      { id: "2", start: 1, end: 2, text: "after" },
    ]);
    expect(useEditorStore.getState().past).toHaveLength(1);

    useEditorStore.getState().undo();

    expect(useEditorStore.getState().regions).toEqual([
      { id: "1", start: 0, end: 1, text: "before" },
    ]);
    expect(useEditorStore.getState().past).toHaveLength(0);
  });
});
