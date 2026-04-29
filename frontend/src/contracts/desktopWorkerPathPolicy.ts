export type DesktopWorkerPayloadPathIntent = "read" | "write";

export type DesktopWorkerPayloadPath = {
  key: string;
  path: string;
  intent: DesktopWorkerPayloadPathIntent;
};

const WRITE_DIRECTORY_PATH_KEYS = new Set(["output_dir", "default_download_path"]);
const READ_FILE_PATH_KEYS = new Set(["file_path", "faster_whisper_cli_path"]);

function isMediaReferencePayload(value: unknown): value is {
  path: string;
  role?: string | null;
} {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { path?: unknown }).path === "string",
  );
}

export function resolveDesktopWorkerPayloadPathIntent(
  key: string,
): DesktopWorkerPayloadPathIntent | null {
  const normalized = key.toLowerCase();
  if (WRITE_DIRECTORY_PATH_KEYS.has(normalized)) {
    return "write";
  }
  if (READ_FILE_PATH_KEYS.has(normalized)) {
    return "read";
  }
  return null;
}

export function visitDesktopWorkerPayloadPaths(
  value: unknown,
  onPath: (entry: DesktopWorkerPayloadPath) => void,
) {
  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => visitDesktopWorkerPayloadPaths(item, onPath));
    return;
  }

  if (isMediaReferencePayload(value)) {
    onPath({
      key: "media_ref.path",
      path: value.path,
      intent: value.role === "output" ? "write" : "read",
    });
    return;
  }

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const intent = resolveDesktopWorkerPayloadPathIntent(key);
    if (intent && typeof entry === "string") {
      onPath({ key, path: entry, intent });
      continue;
    }
    visitDesktopWorkerPayloadPaths(entry, onPath);
  }
}
