import type { SubtitleSegment } from "../types/task";

export interface ValidationIssue {
  type: "error" | "warning";
  message: string;
  code:
    | "cps_high"
    | "duration_short"
    | "duration_long"
    | "lines_too_many"
    | "overlap";
}

const CPS_LIMIT = 25; // Characters Per Second
const MIN_DURATION = 0.5; // Seconds
const MAX_DURATION = 7.0; // Seconds
const MAX_LINES = 2; // Standard subtitle limit

export function validateSegment(segment: SubtitleSegment): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const duration = segment.end - segment.start;
  const text = segment.text || "";
  const charCount = text.length;

  // 1. Duration Checks
  if (duration < MIN_DURATION) {
    issues.push({
      type: "warning",
      message: `Duration too short (${duration.toFixed(2)}s < ${MIN_DURATION}s)`,
      code: "duration_short",
    });
  } else if (duration > MAX_DURATION) {
    issues.push({
      type: "warning",
      message: `Duration too long (${duration.toFixed(2)}s > ${MAX_DURATION}s)`,
      code: "duration_long",
    });
  }

  // 2. CPS Check
  // If duration is effectively 0, avoid div by zero, though min duration check catches it.
  if (duration > 0.1) {
    const cps = charCount / duration;
    if (cps > CPS_LIMIT) {
      issues.push({
        type: "error",
        message: `Reading speed too high (${cps.toFixed(1)} CPS > ${CPS_LIMIT})`,
        code: "cps_high",
      });
    }
  }

  // 3. Line Count
  const lines = text.split("\n").length;
  if (lines > MAX_LINES) {
    issues.push({
      type: "warning",
      message: `Too many lines (${lines} > ${MAX_LINES})`,
      code: "lines_too_many",
    });
  }

  return issues;
}

export function fixOverlaps(segments: SubtitleSegment[]): SubtitleSegment[] {
  // Sort by start time just in case
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  let hasChanges = false;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const current = sorted[i];

    // Check overlap: current start is before previous end
    // Add small buffer (0.05s) to match validation logic
    if (current.start < prev.end - 0.05) {
      // Shift current start to occur after previous end + 0.05s
      const newStart = Number((prev.end + 0.05).toFixed(3));

      // Maintain duration
      const duration = current.end - current.start;
      const newEnd = Number((newStart + duration).toFixed(3));

      // Mutate the clone
      current.start = newStart;
      current.end = newEnd;
      hasChanges = true;
    }
  }

  if (hasChanges) {
    return sorted.map((s) => ({ ...s }));
  }
  return segments;
}
