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

export type RegionTimelineIndex = {
  regions: SubtitleSegment[];
  prefixMaxEnd: number[];
  maxEndTree: number[];
  treeLeafCount: number;
};

const DEFAULT_REGION_COLOR = "rgba(79, 70, 229, 0.22)";
const PLAYBACK_REGION_COLOR = "rgba(14, 165, 233, 0.36)";

export function buildRegionTimelineIndex(regions: SubtitleSegment[]): RegionTimelineIndex {
  const sorted = [...regions].sort((left, right) =>
    left.start - right.start || left.end - right.end || String(left.id).localeCompare(String(right.id)),
  );
  const prefixMaxEnd: number[] = [];
  let maxEnd = Number.NEGATIVE_INFINITY;
  sorted.forEach((region, index) => {
    maxEnd = Math.max(maxEnd, region.end);
    prefixMaxEnd[index] = maxEnd;
  });
  let treeLeafCount = 1;
  while (treeLeafCount < sorted.length) treeLeafCount *= 2;
  const maxEndTree = new Array(treeLeafCount * 2).fill(Number.NEGATIVE_INFINITY);
  sorted.forEach((region, index) => {
    maxEndTree[treeLeafCount + index] = region.end;
  });
  for (let index = treeLeafCount - 1; index > 0; index -= 1) {
    maxEndTree[index] = Math.max(maxEndTree[index * 2], maxEndTree[index * 2 + 1]);
  }
  return { regions: sorted, prefixMaxEnd, maxEndTree, treeLeafCount };
}

function upperBoundStart(regions: SubtitleSegment[], time: number) {
  let low = 0;
  let high = regions.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (regions[middle].start <= time) low = middle + 1;
    else high = middle;
  }
  return low;
}

function firstPrefixEndAfter(prefixMaxEnd: number[], time: number) {
  let low = 0;
  let high = prefixMaxEnd.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (prefixMaxEnd[middle] <= time) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function findPlaybackRegionId(index: RegionTimelineIndex, time: number): string | null {
  const lastCandidate = upperBoundStart(index.regions, time) - 1;
  if (lastCandidate < 0) return null;

  const findRightmostContaining = (
    node: number,
    left: number,
    right: number,
  ): number => {
    if (left > lastCandidate || index.maxEndTree[node] <= time) return -1;
    if (left === right) return left;
    const middle = (left + right) >>> 1;
    const rightMatch = findRightmostContaining(node * 2 + 1, middle + 1, right);
    return rightMatch >= 0
      ? rightMatch
      : findRightmostContaining(node * 2, left, middle);
  };
  const candidate = findRightmostContaining(1, 0, index.treeLeafCount - 1);
  if (candidate >= 0 && candidate < index.regions.length) {
    return String(index.regions[candidate].id);
  }
  return null;
}

export function selectVisibleRegions(
  index: RegionTimelineIndex,
  start: number,
  end: number,
): SubtitleSegment[] {
  if (index.regions.length === 0 || end <= start) return [];
  const first = firstPrefixEndAfter(index.prefixMaxEnd, start);
  const lastExclusive = upperBoundStart(index.regions, end);
  return index.regions
    .slice(first, lastExclusive)
    .filter((region) => region.end > start);
}

function buildRegionGeometry({
  regions,
  selectedIds,
  activeSegmentId,
}: {
  regions: SubtitleSegment[];
  selectedIds: string[];
  activeSegmentId: string | null;
}) {
  const geometry = new Map<string, { start: number; end: number; color: string }>();
  const overlappingIds = new Set<string>();
  const tolerance = 0.01;
  let furthestEnd = Number.NEGATIVE_INFINITY;
  let furthestEndRegionId: string | null = null;

  for (const region of regions) {
    const regionId = String(region.id);
    if (region.start < furthestEnd - tolerance && furthestEndRegionId !== null) {
      overlappingIds.add(furthestEndRegionId);
      overlappingIds.add(regionId);
    }
    if (region.end > furthestEnd) {
      furthestEnd = region.end;
      furthestEndRegionId = regionId;
    }
  }

  const selectedIdSet = new Set(selectedIds);
  for (const segment of regions) {
    const id = String(segment.id);
    const overlapping = overlappingIds.has(id);
    let color = DEFAULT_REGION_COLOR;
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
  currentTempRegionId,
}: {
  plugin: RegionsPlugin;
  regions: SubtitleSegment[];
  selectedIds: string[];
  activeSegmentId: string | null;
  currentTempRegionId: string | null;
}) {
  const geometry = buildRegionGeometry({ regions, selectedIds, activeSegmentId });
  const existing = plugin.getRegions() as RegionLike[];
  const existingById = new Map(existing.map((region) => [region.id, region]));

  for (const region of existing) {
    if (!geometry.has(region.id) && currentTempRegionId !== region.id) region.remove();
  }
  for (const [id, next] of geometry) {
    const region = existingById.get(id);
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
  return new Map([...geometry].map(([id, value]) => [id, value.color]));
}

export function applyPlaybackRegionHighlight({
  plugin,
  baseColors,
  previousId,
  currentId,
}: {
  plugin: RegionsPlugin;
  baseColors: ReadonlyMap<string, string>;
  previousId: string | null;
  currentId: string | null;
}) {
  const regionsById = new Map(
    (plugin.getRegions() as RegionLike[]).map((region) => [region.id, region]),
  );
  if (previousId && previousId !== currentId) {
    const previous = regionsById.get(previousId);
    const baseColor = baseColors.get(previousId);
    if (previous && baseColor && previous.color !== baseColor) {
      previous.setOptions({ color: baseColor });
    }
  }
  if (currentId) {
    const current = regionsById.get(currentId);
    const baseColor = baseColors.get(currentId);
    const color = baseColor === DEFAULT_REGION_COLOR ? PLAYBACK_REGION_COLOR : baseColor;
    if (current && color && current.color !== color) current.setOptions({ color });
  }
}
