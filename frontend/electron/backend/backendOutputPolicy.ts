export const BACKEND_OUTPUT_DIAGNOSTICS_ENV =
  "MEDIAFLOW_BACKEND_LOG_OUTPUT";

const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

export function shouldForwardBackendOutput(
  isDevelopment: boolean,
  diagnosticFlag: string | null | undefined,
): boolean {
  return (
    isDevelopment ||
    ENABLED_VALUES.has(diagnosticFlag?.trim().toLowerCase() ?? "")
  );
}
