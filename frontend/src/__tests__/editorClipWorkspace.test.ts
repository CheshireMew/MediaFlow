import { describe, expect, it } from "vitest";

import {
  createEditorClipWorkspaceState,
  editorClipWorkspaceReducer,
  getClipTimelineRegions,
  getSelectedClipSegments,
  resolveManualClipRange,
} from "../hooks/editor/editorClipWorkspace";
import type { ClipCandidate } from "../types/task";

function candidate(
  id: string,
  overrides: Partial<ClipCandidate> = {},
): ClipCandidate {
  return {
    id,
    start: 10,
    end: 20,
    title: `Clip ${id}`,
    reason: "Reason",
    score: 90,
    transcript: null,
    selected: true,
    ...overrides,
  };
}

describe("editorClipWorkspace pure state", () => {
  it("keeps candidate edits and active selection in one atomic reducer", () => {
    let state = createEditorClipWorkspaceState();
    state = editorClipWorkspaceReducer(state, {
      type: "add-candidate",
      candidate: candidate("clip-1"),
    });
    state = editorClipWorkspaceReducer(state, {
      type: "add-candidate",
      candidate: candidate("clip-2", { start: 30, end: 40 }),
    });
    state = editorClipWorkspaceReducer(state, {
      type: "update-candidate",
      id: "clip-2",
      updates: { title: "Edited", selected: false },
    });
    state = editorClipWorkspaceReducer(state, {
      type: "delete-candidate",
      id: "clip-2",
    });

    expect(state.candidates).toEqual([candidate("clip-1")]);
    expect(state.activeClipId).toBe("clip-1");
  });

  it("projects only selected clips into the export contract", () => {
    const candidates = [
      candidate("clip-1", { title: "Selected" }),
      candidate("clip-2", { selected: false }),
    ];

    expect(getSelectedClipSegments(candidates)).toEqual([
      { id: "clip-1", start: 10, end: 20, title: "Selected" },
    ]);
    expect(getClipTimelineRegions(candidates)[0]).toEqual({
      id: "clip-1",
      start: 10,
      end: 20,
      text: "Selected",
    });
  });

  it("clamps a manual clip to the media duration", () => {
    expect(resolveManualClipRange(95, 100)).toEqual({ start: 95, end: 100 });
    expect(resolveManualClipRange(-2, 10)).toEqual({ start: 0, end: 10 });
    expect(resolveManualClipRange(0, Number.NaN)).toBeNull();
  });
});
