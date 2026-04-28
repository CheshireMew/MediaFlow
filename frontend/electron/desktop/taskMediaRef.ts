import path from "path";
import type { MediaKind, MediaOriginKind, MediaRole } from "../../src/contracts/mediaContracts";
import { normalizeMediaReference } from "../../src/services/ui/mediaReference";

export function normalizeDesktopTaskMediaReference(
  value: unknown,
  defaults: {
    type?: string;
    media_kind?: MediaKind;
    role?: MediaRole;
    origin?: MediaOriginKind;
  } = {},
) {
  return normalizeMediaReference(value, {
    origin: "task",
    ...defaults,
  });
}

export function resolveTaskMediaPath(candidate: unknown) {
  return normalizeDesktopTaskMediaReference(candidate)?.path ?? null;
}

export function getTaskMediaLabel(candidate: unknown, fallback: string) {
  return normalizeDesktopTaskMediaReference(candidate)?.name ?? fallback;
}

export function getDesktopTaskBasename(value: unknown, fallback: string) {
  const mediaRef = normalizeDesktopTaskMediaReference(value);
  if (mediaRef?.name) {
    return mediaRef.name;
  }
  return typeof value === "string" && value.trim() ? path.basename(value) : fallback;
}
