import { getApiUrl } from "./runtime";
import { ApiError } from "./errors";
import type { ApiErrorResponse } from "../types/generatedApi";

export { ApiError, isApiError } from "./errors";

// Re-export all API types for consumers
export type {
  TaskCountActionResponse,
  TaskDeleteActionResponse,
  TaskStatusActionResponse,
  TaskResponse,
  PipelineStep,
  PipelineRequest,
  PlaylistItem,
  AnalyzeResult,
  ElectronCookie,
  CookieStatusResponse,
  GlossaryTerm,
  GlossaryDeleteResponse,
  LLMProvider,
  UserSettings,
  UserPreferencesPatch,
  UiStatePatch,
  ActiveProviderResponse,
  ProviderConnectionRequest,
  ProviderConnectionResponse,
  ToolUpdateResponse,
  FasterWhisperCliInstallResponse,
  FasterWhisperCliPrewarmRequest,
  FasterWhisperCliPrewarmResponse,
  CudaReadinessResponse,
  EditorPreviewMediaRequest,
  EditorPreviewMediaResponse,
  EditorWaveformPeaksResponse,
  HighlightDetectionRequest,
  HighlightDetectionResponse,
  ClipExportRequest,
  ImagePreviewResponse,
  MediaExportTimelineRequest,
  MediaExportTimelineResponse,
  SynthesizeOptions,
  TranscribeSegmentRequest,
  TranscribeSegmentResponse,
  TranslationRequest,
  ImmediateTranslationResponse,
} from "../types/api";

// Internal imports (used within this file)
import type {
  TaskCountActionResponse,
  TaskDeleteActionResponse,
  TaskStatusActionResponse,
  TaskResponse,
  PipelineRequest,
  AnalyzeResult,
  ElectronCookie,
  CookieStatusResponse,
  GlossaryTerm,
  GlossaryDeleteResponse,
  UserSettings,
  UserPreferencesPatch,
  UiStatePatch,
  ActiveProviderResponse,
  ProviderConnectionRequest,
  ProviderConnectionResponse,
  ToolUpdateResponse,
  FasterWhisperCliInstallResponse,
  FasterWhisperCliPrewarmRequest,
  FasterWhisperCliPrewarmResponse,
  CudaReadinessResponse,
  EditorPreviewMediaRequest,
  EditorPreviewMediaResponse,
  EditorWaveformPeaksResponse,
  HighlightDetectionRequest,
  HighlightDetectionResponse,
  ImagePreviewResponse,
  MediaExportTimelineRequest,
  MediaExportTimelineResponse,
  TranscribeSegmentRequest,
  TranscribeSegmentResponse,
  TranslationRequest,
  ImmediateTranslationResponse,
} from "../types/api";
import type { Task } from "../types/task";

// ─── Internal Generic Request Wrapper ────────────────────────────

async function request<T>(
    endpoint: string,
    options: RequestInit = {},
    timeoutMs: number = 30_000,
    parseResponse?: (response: Response) => Promise<T>,
): Promise<T> {
  const url = getApiUrl(endpoint);

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  // Only set JSON content-type if body is not FormData
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const controller = new AbortController();
  let didTimeout = false;
  const handleCallerAbort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) {
    handleCallerAbort();
  } else {
    options.signal?.addEventListener("abort", handleCallerAbort, { once: true });
  }
  const timeout = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      let errorMessage = `API request failed: ${res.status} ${res.statusText}`;
      let errorCode: string | undefined;
      let errorDetails: Record<string, unknown> = {};
      try {
        const errorText = await res.text();
        try {
          const errorJson = JSON.parse(errorText) as Partial<ApiErrorResponse> & {
            detail?: string;
          };
          if (errorJson.message) errorMessage = errorJson.message;
          else if (errorJson.detail) errorMessage = errorJson.detail;
          else errorMessage = errorText;
          errorCode = typeof errorJson.code === "string" ? errorJson.code : undefined;
          errorDetails =
            errorJson.details && typeof errorJson.details === "object"
              ? errorJson.details as Record<string, unknown>
              : {};
        } catch {
          if (errorText) errorMessage = errorText;
        }
      } catch {
        // Ignore body parsing error
      }
      throw new ApiError(errorMessage, {
        endpoint,
        kind: "http",
        status: res.status,
        code: errorCode,
        details: errorDetails,
      });
    }

    if (parseResponse) {
      return await parseResponse(res);
    }

    // Check content type before parsing json
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") !== -1) {
      return (await res.json()) as T;
    }
    // For non-JSON responses (like void actions), return generic success if needed
    return {} as T;
  } catch (error: unknown) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) {
      if (didTimeout) {
        throw new ApiError(`Request to ${endpoint} timed out after ${timeoutMs}ms`, {
          endpoint,
          kind: "timeout",
          cause: error,
        });
      }
      throw new ApiError(`Request to ${endpoint} was aborted`, {
        endpoint,
        kind: "aborted",
        cause: error,
      });
    }
    throw new ApiError(
      error instanceof Error ? error.message : "An unexpected network error occurred",
      {
        endpoint,
        kind: "network",
        cause: error,
      },
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", handleCallerAbort);
  }
}

const WAVEFORM_HEADER_BYTES = 24;
const WAVEFORM_BINARY_VERSION = 1;

async function parseWaveformResponse(
  response: Response,
): Promise<EditorWaveformPeaksResponse> {
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength < WAVEFORM_HEADER_BYTES) {
    throw new Error("Waveform response is shorter than its binary header");
  }
  const view = new DataView(buffer);
  const magic = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  );
  const version = view.getUint16(4, true);
  const channels = view.getUint16(6, true);
  const duration = view.getFloat64(8, true);
  const pointCount = view.getUint32(16, true);
  const pointsPerSecond = view.getFloat32(20, true);
  if (
    magic !== "MFWF"
    || version !== WAVEFORM_BINARY_VERSION
    || channels !== 1
    || pointCount < 2
    || pointCount % 2 !== 0
    || !Number.isFinite(duration)
    || duration < 0
    || !Number.isFinite(pointsPerSecond)
    || pointsPerSecond < 0
    || buffer.byteLength !== WAVEFORM_HEADER_BYTES + pointCount * 4
  ) {
    throw new Error("Waveform response has an invalid binary contract");
  }
  return {
    duration,
    points_per_second: pointsPerSecond,
    peaks: [new Float32Array(buffer, WAVEFORM_HEADER_BYTES, pointCount)],
  };
}

// ─── API Client ──────────────────────────────────────────────────

export const apiClient = {
  // ─── ASR ─────────────────────────────────────────────────────────

  transcribeSegment: (payload: TranscribeSegmentRequest) => {
    return request<TranscribeSegmentResponse>("/transcribe/segment", {
      method: "POST",
      body: JSON.stringify(payload),
    }, 1_800_000);
  },

  translateSegments: (payload: TranslationRequest) => {
    return request<ImmediateTranslationResponse>("/translate/segment", {
      method: "POST",
      body: JSON.stringify(payload),
    }, 1_800_000);
  },

  analyzeUrl: (url: string) => {
    return request<AnalyzeResult>("/analyze/", {
      method: "POST",
      body: JSON.stringify({ url }),
    });
  },

  listGlossaryTerms: () => {
    return request<GlossaryTerm[]>("/glossary/");
  },

  addGlossaryTerm: (term: {
    source: string;
    target: string;
    note?: string;
    category?: string;
  }) => {
    return request<GlossaryTerm>("/glossary/", {
      method: "POST",
      body: JSON.stringify(term),
    });
  },

  deleteGlossaryTerm: (termId: string) => {
    return request<GlossaryDeleteResponse>(`/glossary/${termId}`, {
      method: "DELETE",
    });
  },

  getTaskStatus: (taskId: string) => {
    return request<Task>(`/tasks/${taskId}`);
  },

  listTasks: () => {
    return request<Task[]>("/tasks/");
  },

  runPipeline: (req: PipelineRequest) => {
    return request<TaskResponse>("/pipeline/run", {
      method: "POST",
      body: JSON.stringify(req),
    });
  },

  pauseAllTasks: () => {
    return request<TaskCountActionResponse>("/tasks/pause-all", { method: "POST" });
  },

  pauseTask: (taskId: string) => {
    return request<TaskStatusActionResponse>(`/tasks/${taskId}/pause`, {
      method: "POST",
    });
  },

  resumeTask: (taskId: string) => {
    return request<TaskStatusActionResponse>(`/tasks/${taskId}/resume`, {
      method: "POST",
    });
  },

  retryTask: (taskId: string) => {
    return request<TaskResponse>(`/tasks/${taskId}/retry`, {
      method: "POST",
    });
  },

  deleteTask: (taskId: string) => {
    return request<TaskDeleteActionResponse>(`/tasks/${taskId}`, {
      method: "DELETE",
    });
  },

  deleteAllTasks: () => {
    return request<TaskCountActionResponse>("/tasks/", { method: "DELETE" });
  },

  // Cookie management
  saveCookies: (domain: string, cookies: ElectronCookie[]) => {
    return request<CookieStatusResponse>("/cookies/save", {
      method: "POST",
      body: JSON.stringify({ domain, cookies }),
    });
  },

  // Settings API
  getSettings: () => {
    return request<UserSettings>("/settings/");
  },

  updatePreferences: (patch: UserPreferencesPatch) => {
    return request<UserSettings>("/settings/preferences", {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },

  patchUiState: (patch: UiStatePatch, options?: { keepalive?: boolean }) => {
    return request<UserSettings>("/settings/ui-state", {
      method: "PATCH",
      body: JSON.stringify(patch),
      keepalive: options?.keepalive,
    });
  },

  setActiveProvider: (providerId: string) => {
    return request<ActiveProviderResponse>("/settings/active-provider", {
      method: "POST",
      body: JSON.stringify({ provider_id: providerId }),
    });
  },

  testProviderConnection: (provider: ProviderConnectionRequest) => {
    return request<ProviderConnectionResponse>("/settings/test-provider", {
      method: "POST",
      body: JSON.stringify(provider),
    });
  },

  updateYtDlp: () => {
    return request<ToolUpdateResponse>("/settings/update-yt-dlp", {
      method: "POST",
    }, 300_000);
  },

  installFasterWhisperCli: () => {
    return request<FasterWhisperCliInstallResponse>("/settings/install-faster-whisper-cli", {
      method: "POST",
    }, 1_800_000);
  },

  prewarmFasterWhisperCli: (payload: FasterWhisperCliPrewarmRequest) => {
    return request<FasterWhisperCliPrewarmResponse>("/settings/prewarm-faster-whisper-cli", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  getCudaReadiness: () => {
    return request<CudaReadinessResponse>("/settings/cuda-readiness");
  },

  uploadWatermark: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return request<ImagePreviewResponse>("/editor/preview/upload-watermark", {
      method: "POST",
      body: formData,
    });
  },

  getLatestWatermark: () => {
    return request<ImagePreviewResponse | null>(
      "/editor/preview/watermark/latest",
    );
  },

  getMediaExportTimeline: (payload: MediaExportTimelineRequest) => {
    return request<MediaExportTimelineResponse>("/editor/preview/media/export-timeline", {
      method: "POST",
      body: JSON.stringify(payload),
    }, 300_000);
  },

  resolveEditorPreviewMediaSource: (payload: EditorPreviewMediaRequest) => {
    return request<EditorPreviewMediaResponse>("/editor/preview/media/source", {
      method: "POST",
      body: JSON.stringify(payload),
    }, 300_000);
  },

  getEditorWaveformPeaks: (payload: EditorPreviewMediaRequest, maxPoints: number) => {
    const query = new URLSearchParams({ max_points: String(maxPoints) });
    return request<EditorWaveformPeaksResponse>(`/editor/preview/media/waveform?${query}`, {
      method: "POST",
      body: JSON.stringify(payload),
    }, 300_000, parseWaveformResponse);
  },

  detectHighlightCandidates: (payload: HighlightDetectionRequest) => {
    return request<HighlightDetectionResponse>("/editor/highlights/detect", {
      method: "POST",
      body: JSON.stringify(payload),
    }, 300_000);
  },


};
