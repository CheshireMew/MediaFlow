type MediaReferenceLike = {
  path?: string | null;
};

type DesktopExecutionMediaFieldSpec = {
  pathKey: string;
  refKey: string;
  label: string;
  required?: boolean;
};

function normalizeExecutionPath(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveExecutionRefPath(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as MediaReferenceLike;
  return normalizeExecutionPath(candidate.path);
}

function normalizeDesktopExecutionPayload(
  payload: Record<string, unknown>,
  specs: DesktopExecutionMediaFieldSpec[],
) {
  const normalizedPayload: Record<string, unknown> = { ...payload };

  for (const spec of specs) {
    const resolvedPath =
      resolveExecutionRefPath(normalizedPayload[spec.refKey]) ??
      normalizeExecutionPath(normalizedPayload[spec.pathKey]);

    if (spec.required && !resolvedPath) {
      throw new Error(`${spec.label} path is required`);
    }

    normalizedPayload[spec.pathKey] = resolvedPath;
  }

  return normalizedPayload;
}

export function normalizeDesktopWorkerCommandPayload(
  command: string,
  payload: Record<string, unknown>,
) {
  switch (command) {
    case "transcribe":
    case "transcribe_segment":
      return normalizeDesktopExecutionPayload(payload, [
        {
          pathKey: "audio_path",
          refKey: "audio_ref",
          label: "Transcription audio",
          required: true,
        },
      ]);
    case "translate":
    case "translate_segment":
      return normalizeDesktopExecutionPayload(payload, [
        {
          pathKey: "context_path",
          refKey: "context_ref",
          label: "Translation context",
        },
      ]);
    case "synthesize":
      return normalizeDesktopExecutionPayload(payload, [
        {
          pathKey: "video_path",
          refKey: "video_ref",
          label: "Synthesis video",
          required: true,
        },
        {
          pathKey: "srt_path",
          refKey: "srt_ref",
          label: "Synthesis subtitle",
          required: true,
        },
      ]);
    case "extract":
    case "enhance":
    case "clean":
      return normalizeDesktopExecutionPayload(payload, [
        {
          pathKey: "video_path",
          refKey: "video_ref",
          label: "Preprocessing video",
          required: true,
        },
      ]);
    default:
      return payload;
  }
}
