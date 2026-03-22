import type { MediaReference } from "../ui/mediaReference";
import { resolveMediaReferencePath } from "../ui/mediaReference";

export type MediaInput = {
  path?: string | null;
  ref?: MediaReference | null;
};

export function resolveOptionalMediaInputPath(
  input?: MediaInput | null,
): string | null {
  if (!input) {
    return null;
  }
  return resolveMediaReferencePath(input.ref, input.path) ?? null;
}

export function resolveMediaInputPath(input: MediaInput, label: string): string {
  const resolvedPath = resolveOptionalMediaInputPath(input);
  if (!resolvedPath) {
    throw new Error(`${label} path is required`);
  }
  return resolvedPath;
}

export function withResolvedMediaInputPath<
  T extends Record<string, unknown>,
  P extends keyof T,
>(
  payload: T,
  pathKey: P,
  input: MediaInput,
  label: string,
): T & Record<P, string> {
  return {
    ...payload,
    [pathKey]: resolveMediaInputPath(input, label),
  } as T & Record<P, string>;
}

export function withResolvedOptionalMediaInputPath<
  T extends Record<string, unknown>,
  P extends keyof T,
>(
  payload: T,
  pathKey: P,
  input?: MediaInput | null,
): T & Record<P, string | null> {
  return {
    ...payload,
    [pathKey]: resolveOptionalMediaInputPath(input),
  } as T & Record<P, string | null>;
}
