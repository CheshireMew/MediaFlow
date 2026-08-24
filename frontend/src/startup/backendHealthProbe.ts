import { getApiBase } from "../api/runtime";
import type { HealthResponse } from "../types/api";

type BackendHealthProbeResult =
  | { ok: true; health: HealthResponse }
  | {
      ok: false;
      state: "starting" | "failed" | "unreachable";
      error: unknown;
      health?: HealthResponse;
    };

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
    const health = (await response.json()) as HealthResponse;

    if (response.ok && health.status === "ready") {
      return { ok: true, health };
    }

    return {
      ok: false,
      state: health.status === "failed" ? "failed" : "starting",
      error: new Error(
        health.error ||
          `Backend health check reported ${health.status} (${response.status} ${response.statusText}).`,
      ),
      health,
    };
  } catch (error) {
    return { ok: false, state: "unreachable", error };
  } finally {
    window.clearTimeout(timeout);
  }
}
