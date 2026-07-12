import { normalizeMediaReference, type MediaReference } from "../ui/mediaReference";

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
