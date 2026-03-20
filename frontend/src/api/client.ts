import { API_BASE_URL } from "../config/api";

// Re-export all API types for consumers
export type {
  MessageResponse,
  CountResponse,
  StatusMessageResponse,
  TaskResponse,
  HealthResponse,
  PipelineStep,
  PipelineRequest,
  PlaylistItem,
  AnalyzeResult,
  ElectronCookie,
  CookieStatusResponse,
  LLMProvider,
  UserSettings,
  ActiveProviderResponse,
  ProviderConnectionRequest,
  ProviderConnectionResponse,
  ToolUpdateResponse,
  DetectSilenceResponse,
  ImagePreviewResponse,
  SynthesizeOptions,
  SynthesizeRequest,
  TranscribeSegmentRequest,
  TranscribeSegmentResponse,
  TranslateRequest,
  TranslateResponse,
  OCRTextEvent,
  OCRExtractRequest,
  OCRExtractResponse,
} from "../types/api";

// Internal imports (used within this file)
import type {
  MessageResponse,
  CountResponse,
  StatusMessageResponse,
  TaskResponse,
  HealthResponse,
  PipelineRequest,
  AnalyzeResult,
  ElectronCookie,
  CookieStatusResponse,
  UserSettings,
  ActiveProviderResponse,
  ProviderConnectionRequest,
  ProviderConnectionResponse,
  DetectSilenceResponse,
  ImagePreviewResponse,
  SynthesizeRequest,
  TranscribeSegmentRequest,
  TranscribeSegmentResponse,
  TranslateRequest,
  TranslateResponse,
  OCRExtractRequest,
  OCRTextEvent,
} from "../types/api";

// Backend API base URL (HTTP) — mutable for dynamic configuration
export let API_BASE = API_BASE_URL;

export const initializeApi = (config: {
  base_url: string;
  ws_url?: string;
}) => {
  if (config?.base_url) {
    API_BASE = config.base_url;
  }
  console.log(`[API] Initialized with Base URL: ${API_BASE}`);
};

export const getWsUrl = () => {
  return API_BASE.replace(/^http/, "ws") + "/ws/tasks";
};

// ─── Internal Generic Request Wrapper ────────────────────────────

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  timeoutMs: number = 30_000,
): Promise<T> {
  const url = endpoint.startsWith("http") ? endpoint : `${API_BASE}${endpoint}`;

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  // Only set JSON content-type if body is not FormData
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      signal: options.signal ?? controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      let errorMessage = `API request failed: ${res.status} ${res.statusText}`;
      try {
        const errorText = await res.text();
        // Try parsing JSON error detail if available
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.detail) errorMessage = errorJson.detail;
          else if (errorJson.message) errorMessage = errorJson.message;
          else errorMessage = errorText;
        } catch {
          if (errorText) errorMessage = errorText;
        }
      } catch {
        // Ignore body parsing error
      }
      throw new Error(errorMessage);
    }

    // Check content type before parsing json
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") !== -1) {
      return (await res.json()) as T;
    }
    // For non-JSON responses (like void actions), return generic success if needed
    return {} as T;
  } catch (error: unknown) {
    clearTimeout(timeout);
    if (error instanceof DOMException && error.name === "AbortError") {
      const msg = `Request to ${endpoint} timed out after ${timeoutMs}ms`;
      console.error(msg);
      import("../utils/toast").then(({ toast }) => {
        toast.error(msg);
      });
      throw new Error(msg);
    }
    const errorMsg =
      error instanceof Error ? error.message : "An unexpected error occurred";
    console.error(`Status: Error requesting ${endpoint}`, error);
    // Generic Error Toast via Event
    import("../utils/toast").then(({ toast }) => {
      toast.error(errorMsg);
    });
    throw error;
  }
}

// ─── API Client ──────────────────────────────────────────────────

export const apiClient = {
  // ─── ASR ─────────────────────────────────────────────────────────

  transcribeSegment: (payload: TranscribeSegmentRequest) => {
    return request<TranscribeSegmentResponse>("/transcribe/segment", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  translateSegments: (payload: TranslateRequest) => {
    return request<TranslateResponse>("/translate/segment", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  extractText: (payload: OCRExtractRequest) => {
    return request<TaskResponse>("/ocr/extract", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  getOcrResults: (videoPath: string) => {
    return request<{ events: OCRTextEvent[] }>(
      `/ocr/results?video_path=${encodeURIComponent(videoPath)}`,
    );
  },

  checkHealth: () => {
    // Health check might be on root URL, not /api/v1
    const baseUrl = API_BASE.replace("/api/v1", "");
    return request<HealthResponse>(`${baseUrl}/health`);
  },

  analyzeUrl: (url: string) => {
    return request<AnalyzeResult>("/analyze/", {
      method: "POST",
      body: JSON.stringify({ url }),
    });
  },

  runPipeline: (req: PipelineRequest) => {
    return request<TaskResponse>("/pipeline/run", {
      method: "POST",
      body: JSON.stringify(req),
    });
  },

  pauseAllTasks: () => {
    return request<CountResponse>("/tasks/pause-all", { method: "POST" });
  },

  cancelAllTasks: () => {
    return request<CountResponse>("/tasks/cancel-all", { method: "POST" });
  },

  pauseTask: (taskId: string) => {
    return request<StatusMessageResponse>(`/tasks/${taskId}/pause`, {
      method: "POST",
    });
  },

  cancelTask: (taskId: string) => {
    return request<StatusMessageResponse>(`/tasks/${taskId}/cancel`, {
      method: "POST",
    });
  },

  resumeTask: (taskId: string) => {
    return request<StatusMessageResponse>(`/tasks/${taskId}/resume`, {
      method: "POST",
    });
  },

  deleteTask: (taskId: string) => {
    return request<MessageResponse & { task_id: string }>(`/tasks/${taskId}`, {
      method: "DELETE",
    });
  },

  deleteAllTasks: () => {
    return request<CountResponse>("/tasks/", { method: "DELETE" });
  },

  // Cookie management
  saveCookies: (domain: string, cookies: ElectronCookie[]) => {
    return request<CookieStatusResponse>("/cookies/save", {
      method: "POST",
      body: JSON.stringify({ domain, cookies }),
    });
  },

  checkCookieStatus: (domain: string) => {
    return request<CookieStatusResponse>(`/cookies/status/${domain}`);
  },

  // Settings API
  getSettings: () => {
    return request<UserSettings>("/settings/");
  },

  updateSettings: (settings: UserSettings) => {
    return request<UserSettings>("/settings/", {
      method: "POST",
      body: JSON.stringify(settings),
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

  detectSilence: (payload: {
    file_path: string;
    threshold: string;
    min_duration: number;
  }) => {
    return request<DetectSilenceResponse>("/audio/detect-silence", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  previewPsd: (payload: { file_path: string }) => {
    return request<ImagePreviewResponse>("/editor/preview/psd-to-png", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  uploadPsd: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return request<ImagePreviewResponse>("/editor/preview/upload-psd", {
      method: "POST",
      body: formData,
    });
  },

  synthesizeVideo: (payload: SynthesizeRequest) => {
    return request<TaskResponse>("/editor/synthesize", {
      method: "POST",
      body: JSON.stringify(payload),
    });
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

  getPeaks: (videoPath: string) => {
    // Return raw ArrayBuffer
    return fetch(
      `${API_BASE}/editor/peaks?video_path=${encodeURIComponent(videoPath)}`,
    ).then((res) => {
      if (!res.ok) throw new Error("Failed to load peaks");
      return res.arrayBuffer();
    });
  },

  // ─── Preprocessing ───────────────────────────────────────────────
  enhanceVideo: (payload: {
    video_path: string;
    model?: string;
    scale?: string;
    method?: string;
  }) => {
    return request<TaskResponse>("/preprocessing/enhance", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  cleanVideo: (payload: {
    video_path: string;
    roi: [number, number, number, number];
    method?: string;
  }) => {
    return request<TaskResponse>("/preprocessing/clean", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};
