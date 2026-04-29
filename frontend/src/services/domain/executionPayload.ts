import { getBasenameFromPath, normalizeMediaReference, type MediaReference } from "../ui/mediaReference";

export function requireExecutionMediaReference(
  value: MediaReference | null | undefined,
  label: string,
): MediaReference {
  const reference = normalizeMediaReference(value);
  if (!reference) {
    throw new Error(`${label} reference is required`);
  }
  return reference;
}

export function getExecutionMediaDisplayName(args: {
  reference?: MediaReference | null;
  defaultName: string;
}) {
  const { reference, defaultName } = args;
  if (reference?.name?.trim()) {
    return reference.name;
  }
  if (reference?.path) {
    return getBasenameFromPath(reference.path, defaultName);
  }
  return defaultName;
}
