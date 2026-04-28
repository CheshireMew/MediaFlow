import { getBasenameFromPath, normalizeMediaReference, type MediaReference } from "../ui/mediaReference";

export type ExecutionMediaFieldSpec = {
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

export function normalizeExecutionPayload<T extends Record<string, unknown>>(
  payload: T,
  specs: ExecutionMediaFieldSpec[],
): T {
  const normalizedPayload: Record<string, unknown> = { ...payload };

  for (const spec of specs) {
    const path = normalizeExecutionPath(normalizedPayload[spec.pathKey]);
    const ref = normalizeMediaReference(normalizedPayload[spec.refKey]);

    if (spec.required && !path && !ref) {
      throw new Error(`${spec.label} path is required`);
    }

    if (ref) {
      delete normalizedPayload[spec.pathKey];
      normalizedPayload[spec.refKey] = ref;
      continue;
    }

    normalizedPayload[spec.pathKey] = path;
    normalizedPayload[spec.refKey] = null;
  }

  return normalizedPayload as T;
}

export function prepareExecutionPayload<TInput extends Record<string, unknown>, TOutput = TInput>(args: {
  payload: TInput;
  specs?: ExecutionMediaFieldSpec[];
  map?: (payload: TInput) => TOutput;
}): TOutput {
  const normalizedPayload =
    args.specs && args.specs.length > 0
      ? normalizeExecutionPayload(args.payload, args.specs)
      : args.payload;

  return args.map ? args.map(normalizedPayload) : (normalizedPayload as unknown as TOutput);
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
