import { getBasenameFromPath, type MediaReference } from "../ui/mediaReference";

type ExecutionMediaFieldSpec = {
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

function normalizeExecutionRef(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<MediaReference>;
  return typeof candidate.path === "string" && candidate.path.trim().length > 0
    ? (candidate as MediaReference)
    : null;
}

export function normalizeExecutionPayload<T extends Record<string, unknown>>(
  payload: T,
  specs: ExecutionMediaFieldSpec[],
): T {
  const normalizedPayload: Record<string, unknown> = { ...payload };

  for (const spec of specs) {
    const path = normalizeExecutionPath(normalizedPayload[spec.pathKey]);
    const ref = normalizeExecutionRef(normalizedPayload[spec.refKey]);

    if (spec.required && !path && !ref) {
      throw new Error(`${spec.label} path is required`);
    }

    normalizedPayload[spec.pathKey] = path;
    normalizedPayload[spec.refKey] = ref;
  }

  return normalizedPayload as T;
}

export function getExecutionMediaDisplayName(args: {
  reference?: MediaReference | null;
  path?: string | null;
  fallbackName: string;
}) {
  const { reference, path, fallbackName } = args;
  if (reference?.name?.trim()) {
    return reference.name;
  }
  if (path) {
    return getBasenameFromPath(path, fallbackName);
  }
  return fallbackName;
}
