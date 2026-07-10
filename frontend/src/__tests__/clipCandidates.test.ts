import { describe, expect, it } from "vitest";

import { mergeDetectedClipCandidates } from "../services/domain/clipCandidates";
import type { ClipCandidate } from "../types/task";

function candidate(
  id: string,
  start: number,
  end: number,
  title = id,
): ClipCandidate {
  return {
    id,
    start,
    end,
    title,
    reason: "reason",
    score: 80,
    selected: true,
  };
}

describe("mergeDetectedClipCandidates", () => {
  it("preserves edits when a new AI suggestion substantially overlaps", () => {
    const edited = {
      ...candidate("clip-1", 10, 20, "User title"),
      selected: false,
    };

    const merged = mergeDetectedClipCandidates(
      [edited],
      [candidate("clip-1", 11, 19, "AI title")],
    );

    expect(merged).toEqual([edited]);
  });

  it("appends a genuinely new suggestion without colliding ids", () => {
    const merged = mergeDetectedClipCandidates(
      [candidate("clip-1", 0, 5)],
      [candidate("clip-1", 10, 15)],
    );

    expect(merged).toHaveLength(2);
    expect(merged[1]).toMatchObject({ id: "clip-1-2", start: 10, end: 15 });
  });

  it("does not hide a short new clip inside a much longer existing range", () => {
    const merged = mergeDetectedClipCandidates(
      [candidate("long", 0, 100)],
      [candidate("short", 20, 30)],
    );

    expect(merged).toHaveLength(2);
  });
});
