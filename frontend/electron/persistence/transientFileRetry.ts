const DEFAULT_RETRY_DELAYS_MS = [50, 150, 350] as const;
const TRANSIENT_FILE_ERROR_CODES = new Set([
  "EACCES",
  "EAGAIN",
  "EBUSY",
  "EMFILE",
  "ENFILE",
  "EPERM",
  "UNKNOWN",
]);

function isTransientFileError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = (error as NodeJS.ErrnoException).code;
  return typeof code === "string" && TRANSIENT_FILE_ERROR_CODES.has(code);
}

function wait(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

export async function withTransientFileRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: { retryDelaysMs?: readonly number[] } = {},
): Promise<T> {
  const retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (!isTransientFileError(error) || attempt >= retryDelaysMs.length) {
        throw error;
      }
      await wait(retryDelaysMs[attempt]);
    }
  }
}
