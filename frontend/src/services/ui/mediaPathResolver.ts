import { isDesktopRuntime } from "../domain";
import { fileService } from "../fileService";

function toPathCandidates(values: Array<unknown>): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];

  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const candidate = value.trim();
    if (!candidate || seen.has(candidate)) {
      continue;
    }

    seen.add(candidate);
    paths.push(candidate);
  }

  return paths;
}

async function pathExists(candidate: string): Promise<boolean> {
  if (!isDesktopRuntime()) {
    return true;
  }

  try {
    await fileService.getFileSize(candidate);
    return true;
  } catch {
    return false;
  }
}

export async function resolvePreferredMediaPath(
  candidates: Array<unknown>,
): Promise<string | null> {
  const paths = toPathCandidates(candidates);
  if (paths.length === 0) {
    return null;
  }

  for (const candidate of paths) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  return paths[0];
}

export async function resolvePreferredMediaPaths(candidates: {
  video?: Array<unknown>;
  subtitle?: Array<unknown>;
  context?: Array<unknown>;
}) {
  const videoPath = await resolvePreferredMediaPath(candidates.video ?? []);
  const subtitlePath = await resolvePreferredMediaPath(candidates.subtitle ?? []);
  const contextPath = await resolvePreferredMediaPath([
    ...(candidates.context ?? []),
    videoPath,
    subtitlePath,
  ]);

  return {
    videoPath,
    subtitlePath,
    contextPath,
  };
}
