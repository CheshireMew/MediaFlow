import { describe, expect, it, vi } from "vitest";

import {
  applyPlaybackRegionHighlight,
  buildRegionTimelineIndex,
  findPlaybackRegionId,
  selectVisibleRegions,
  syncWaveformRegions,
} from "../components/editor/waveform/regionSync";
import type { SubtitleSegment } from "../types/task";

function segment(id: number, start: number, end: number): SubtitleSegment {
  return { id, start, end, text: `segment-${id}` };
}

describe("region timeline index", () => {
  it("finds overlapping playback regions and visible windows", () => {
    const index = buildRegionTimelineIndex([
      segment(3, 20, 21),
      segment(1, 0, 100),
      segment(2, 10, 11),
      segment(4, 200, 201),
    ]);

    expect(findPlaybackRegionId(index, 10.5)).toBe("2");
    expect(findPlaybackRegionId(index, 150)).toBeNull();
    expect(selectVisibleRegions(index, 19, 22).map((item) => item.id)).toEqual([1, 3]);
  });

  it("keeps playback lookup bounded with heavily overlapping regions", () => {
    const index = buildRegionTimelineIndex([
      segment(0, 0, 20_000),
      ...Array.from({ length: 10_000 }, (_, itemIndex) =>
        segment(itemIndex + 1, itemIndex + 1, itemIndex + 1.5),
      ),
    ]);

    expect(findPlaybackRegionId(index, 15_000)).toBe("0");
  });
});

describe("waveform region synchronization", () => {
  it("updates existing regions through indexed lookup and only recolors playback changes", () => {
    const regions = Array.from({ length: 1_000 }, (_, index) => ({
      id: String(index),
      start: index,
      end: index + 0.5,
      color: "old",
      setOptions: vi.fn(),
      remove: vi.fn(),
    }));
    const plugin = {
      getRegions: vi.fn(() => regions),
      addRegion: vi.fn(),
    };

    const baseColors = syncWaveformRegions({
      plugin: plugin as never,
      regions: Array.from({ length: 1_000 }, (_, index) => segment(index, index, index + 0.5)),
      selectedIds: [],
      activeSegmentId: null,
      currentTempRegionId: null,
    });
    regions.forEach((region) => region.setOptions.mockClear());

    applyPlaybackRegionHighlight({
      plugin: plugin as never,
      baseColors,
      previousId: "10",
      currentId: "11",
    });

    expect(regions[10].setOptions).toHaveBeenCalledTimes(1);
    expect(regions[11].setOptions).toHaveBeenCalledTimes(1);
    expect(regions[500].setOptions).not.toHaveBeenCalled();
  });
});
