export interface VersionedSnapshot<T> {
  schema_version: number;
  lifecycle?: Record<string, import("../../contracts/runtimeContracts").TaskLifecycle>;
  payload: T;
}

export function serializeVersionedSnapshot<T>(
  schemaVersion: number,
  payload: T,
  lifecycle?: VersionedSnapshot<T>["lifecycle"],
) {
  return JSON.stringify({
    schema_version: schemaVersion,
    lifecycle,
    payload,
  } satisfies VersionedSnapshot<T>);
}

export function parseVersionedSnapshotEnvelope<T>(
  raw: string | null,
  schemaVersion: number,
): VersionedSnapshot<T> | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<VersionedSnapshot<T>>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.schema_version !== schemaVersion ||
      !("payload" in parsed)
    ) {
      return null;
    }

    return parsed as VersionedSnapshot<T>;
  } catch {
    return null;
  }
}

export function parseVersionedSnapshot<T>(
  raw: string | null,
  schemaVersion: number,
): T | null {
  const envelope = parseVersionedSnapshotEnvelope<T>(raw, schemaVersion);
  return envelope ? (envelope.payload as T) : null;
}
