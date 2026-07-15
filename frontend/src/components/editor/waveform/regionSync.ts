import type RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";

import type { SubtitleSegment } from "../../../types/task";

type RegionLike = {
  id: string;
  start: number;
  end: number;
  color?: string;
  setOptions: (options: Record<string, unknown>) => void;
  remove: () => void;
};

function buildRegionGeometry({
  regions,
  selectedIds,
  activeSegmentId,
  currentPlaybackRegionId,
}: {
  regions: SubtitleSegment[];
  selectedIds: string[];
  activeSegmentId: string | null;
  currentPlaybackRegionId: string | null;
}) {
  const geometry = new Map<string, { start: number; end: number; color: string }>();
  const overlappingIds = new Set<string>();
  const activeRegions: SubtitleSegment[] = [];
  const tolerance = 0.01;

  for (const region of [...regions].sort((a, b) => a.start - b.start)) {
    for (let index = activeRegions.length - 1; index >= 0; index--) {
      if (activeRegions[index].end <= region.start + tolerance) {
        activeRegions.splice(index, 1);
      } else if (region.start < activeRegions[index].end - tolerance) {
        overlappingIds.add(String(activeRegions[index].id));
        overlappingIds.add(String(region.id));
      }
    }
    activeRegions.push(region);
  }

  const selectedIdSet = new Set(selectedIds);
  for (const segment of regions) {
    const id = String(segment.id);
    const overlapping = overlappingIds.has(id);
    let color = "rgba(79, 70, 229, 0.22)";
    if (currentPlaybackRegionId === id) color = "rgba(14, 165, 233, 0.36)";
    if (overlapping) color = "rgba(239, 68, 68, 0.5)";
    if (selectedIdSet.has(id)) {
      color = overlapping ? "rgba(239, 68, 68, 0.7)" : "rgba(234, 179, 8, 0.5)";
    }
    if (activeSegmentId === id) {
      color = overlapping ? "rgba(239, 68, 68, 0.78)" : "rgba(129, 140, 248, 0.58)";
    }
    geometry.set(id, { start: segment.start, end: segment.end, color });
  }
  return geometry;
}

export function syncWaveformRegions({
  plugin,
  regions,
  selectedIds,
  activeSegmentId,
  currentPlaybackRegionId,
  currentTempRegionId,
}: {
  plugin: RegionsPlugin;
  regions: SubtitleSegment[];
  selectedIds: string[];
  activeSegmentId: string | null;
  currentPlaybackRegionId: string | null;
  currentTempRegionId: string | null;
}) {
  const geometry = buildRegionGeometry({
    regions,
    selectedIds,
    activeSegmentId,
    currentPlaybackRegionId,
  });
  const existing = plugin.getRegions() as RegionLike[];

  for (const region of existing) {
    if (!geometry.has(region.id) && currentTempRegionId !== region.id) region.remove();
  }
  for (const [id, next] of geometry) {
    const region = existing.find((item) => item.id === id);
    if (!region) {
      plugin.addRegion({ id, ...next, drag: true, resize: true });
      continue;
    }
    if (
      Math.abs(region.start - next.start) > 0.001
      || Math.abs(region.end - next.end) > 0.001
      || region.color !== next.color
    ) {
      region.setOptions({ ...next, drag: true, resize: true });
    }
  }
}
