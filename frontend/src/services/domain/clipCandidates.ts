import type { ClipCandidate } from "../../types/task";

const DUPLICATE_OVERLAP_RATIO = 0.65;

function overlapRatio(left: ClipCandidate, right: ClipCandidate): number {
  const intersection = Math.max(
    0,
    Math.min(left.end, right.end) - Math.max(left.start, right.start),
  );
  const union = Math.max(left.end, right.end) - Math.min(left.start, right.start);
  return union > 0 ? intersection / union : 0;
}

function nextUniqueCandidateId(candidateId: string, usedIds: Set<string>): string {
  if (!usedIds.has(candidateId)) return candidateId;

  let suffix = 2;
  while (usedIds.has(`${candidateId}-${suffix}`)) suffix += 1;
  return `${candidateId}-${suffix}`;
}

/**
 * Keeps the user's current list as the source of truth and only appends genuinely
 * new AI suggestions. Substantially overlapping suggestions are treated as the
 * same clip so edited titles, ranges and selection state are never overwritten.
 */
export function mergeDetectedClipCandidates(
  current: ClipCandidate[],
  detected: ClipCandidate[],
): ClipCandidate[] {
  if (current.length === 0) return detected;

  const merged = [...current];
  const usedIds = new Set(current.map((candidate) => candidate.id));

  for (const candidate of detected) {
    const duplicatesExisting = merged.some(
      (existing) => overlapRatio(existing, candidate) >= DUPLICATE_OVERLAP_RATIO,
    );
    if (duplicatesExisting) continue;

    const id = nextUniqueCandidateId(candidate.id, usedIds);
    usedIds.add(id);
    merged.push(id === candidate.id ? candidate : { ...candidate, id });
  }

  return merged;
}
