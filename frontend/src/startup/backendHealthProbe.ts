import { getApiBase } from "../api/runtime";
import type { HealthResponse } from "../types/api";

type BackendHealthProbeResult =
  | { ok: true; health: HealthResponse }
  | { ok: false; error: unknown };

const STARTUP_HEALTH_TIMEOUT_MS = 500;

function resolveHealthUrl() {
  return `${getApiBase().replace("/api/v1", "")}/health`;
}

export async function probeBackendHealth(
  timeoutMs: number = STARTUP_HEALTH_TIMEOUT_MS,
): Promise<BackendHealthProbeResult> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(resolveHealthUrl(), {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Backend health check failed: ${response.status} ${response.statusText}`);
    }

    return {
      ok: true,
      health: (await response.json()) as HealthResponse,
    };
  } catch (error) {
    return { ok: false, error };
  } finally {
    window.clearTimeout(timeout);
  }
}
