import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore } from "../editorStore";

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
    const regions = [{ id: "1", start: 0, end: 10, text: "test" }];
    useEditorStore.getState().setRegions(regions as any);
    expect(useEditorStore.getState().regions).toHaveLength(1);
    expect(useEditorStore.getState().regions[0].text).toBe("test");
  });

  it("should select segment", () => {
    useEditorStore.getState().selectSegment("1", false, false);
    expect(useEditorStore.getState().selectedIds).toContain("1");
    expect(useEditorStore.getState().activeSegmentId).toBe("1");
  });

  it("should delete segments", () => {
    const regions = [
      { id: "1", start: 0, end: 5, text: "1" },
      { id: "2", start: 5, end: 10, text: "2" },
    ];
    useEditorStore.getState().setRegions(regions as any);
    useEditorStore.getState().deleteSegments(["1"]);
    expect(useEditorStore.getState().regions).toHaveLength(1);
    expect(useEditorStore.getState().regions[0].id).toBe("2");
  });
});
