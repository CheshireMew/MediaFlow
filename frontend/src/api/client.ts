import { API_BASE_URL } from "../config/api";

// Backend API base URL (HTTP)
// Mutable to allow dynamic configuration
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
  // Naive replacement, can be improved if config has explicit ws_url
  return API_BASE.replace(/^http/, "ws") + "/ws/tasks";
};

// ─── Shared / Generic Response Types ─────────────────────────────

/** Common message-only response from mutation endpoints. */
export interface MessageResponse {
  message: string;
}

/** Endpoints that return a message + affected count (cancel-all, delete-all). */
export interface CountResponse extends MessageResponse {
  count: number;
}

/** Endpoints that return a message + status (resume, etc.). */
export interface StatusMessageResponse extends MessageResponse {
  status: string;
}

// ─── API Client Setup ─────────────────────────────────────────────
// (Assuming you have an axios instance somewhere, or code handling fetch using API_BASE)
// Since this file seems to define types and exports API_BASE,
// let's create a minimal axios wrapper or ensure existing code uses the exported API_BASE variable.
// But `API_BASE` is a const in original file. We changed it to let.

/** Task creation / pipeline submission response. */
export interface TaskResponse {
  task_id: string;
  status: string;
  message?: string;
}

// ─── Health ──────────────────────────────────────────────────────

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
}

// ─── Pipeline ────────────────────────────────────────────────────

export interface PipelineStep {
  step_name: string;
  params: Record<string, unknown>;
}

export interface PipelineRequest {
  pipeline_id: string;
  task_name?: string;
  steps: PipelineStep[];
}

// ─── Analyze ─────────────────────────────────────────────────────

export interface PlaylistItem {
  index: number;
  title: string;
  url: string;
  duration?: number;
}

export interface AnalyzeResult {
  type: "single" | "playlist";
  id?: string;
  title?: string;
  url?: string;
  direct_src?: string; // Direct video source (sniffed by backend)
  thumbnail?: string;
  duration?: number;
  count?: number;
  uploader?: string;
  items?: PlaylistItem[];
  extra_info?: Record<string, unknown>; // Flexible field for cookies etc
}

// ─── Cookies ─────────────────────────────────────────────────────

export interface ElectronCookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  expirationDate?: number;
  httpOnly?: boolean;
  secure?: boolean;
}

export interface CookieStatusResponse {
  domain: string;
  has_valid_cookies: boolean;
  cookie_path: string | null;
}

// ─── Settings ────────────────────────────────────────────────────

export interface LLMProvider {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
  model: string;
  is_active: boolean;
}

export interface UserSettings {
  llm_providers: LLMProvider[];
  default_download_path: string | null;
  language: string;
  auto_execute_flow: boolean;
}

export interface ActiveProviderResponse {
  status: string;
  active_provider_id: string;
}

// ─── Audio ───────────────────────────────────────────────────────

export interface DetectSilenceResponse {
  silence_intervals: [number, number][];
}

// ─── Editor ──────────────────────────────────────────────────────

export interface ImagePreviewResponse {
  png_path: string;
  data_url: string;
  width: number;
  height: number;
}

export interface SynthesizeOptions {
  // Subtitle style
  font_name?: string;
  font_size?: number;
  font_color?: string; // ASS &HAABBGGRR format
  bold?: boolean;
  italic?: boolean;
  outline?: number; // 0-4
  shadow?: number; // 0-4
  outline_color?: string; // ASS &HAABBGGRR format
  back_color?: string; // ASS &HAABBGGRR format
  border_style?: number; // 1=outline+shadow, 3=opaque box
  alignment?: number; // ASS numpad: 1=left, 2=center, 3=right (bottom row)
  margin_v?: number;
  // Encoding
  crf?: number;
  [key: string]: unknown; // extensible (wm_*, video_*, output_path, preset)
}

export interface SynthesizeRequest {
  video_path: string;
  srt_path: string;
  watermark_path: string | null;
  output_path?: string | null;
  options: SynthesizeOptions;
}

export interface TranscribeSegmentRequest extends SynthesizeRequest {
  audio_path: string;
  start: number;
  end: number;
  model?: string;
  device?: string;
  language?: string;
  initial_prompt?: string;
}

export interface TranscribeSegmentResponse {
  status: "completed" | "pending";
  task_id?: string;
  data?: {
    text: string;
    segments: any[];
  };
  message?: string;
}

// ─── Translate ─────────────────────────────────────────────────────

export interface TranslateRequest {
  segments: any[]; // SubtitleSegment[]
  target_language: string;
  mode?: "standard" | "intelligent";
  context_path?: string | null;
}

export interface TranslateResponse {
  task_id: string;
  status: string;
  segments?: any[]; // SubtitleSegment[]
}

// ─── OCR ───────────────────────────────────────────────────────────

export interface TextEvent {
  start: number;
  end: number;
  text: string;
  box: number[][]; // [[x1, y1], [x2, y2], [x3, y3], [x4, y4]]
}

export interface OCRExtractRequest {
  video_path: string;
  roi?: number[]; // [x, y, w, h]
  engine: "rapid" | "paddle";
  sample_rate?: number;
}

export interface OCRExtractResponse {
  events: TextEvent[];
}

// ─── Internal Generic Request Wrapper ────────────────────────────

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = endpoint.startsWith("http") ? endpoint : `${API_BASE}${endpoint}`;

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  // Only set JSON content-type if body is not FormData
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  try {
    const res = await fetch(url, { ...options, headers });

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
    // @ts-ignore
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

  cancelAllTasks: () => {
    return request<CountResponse>("/tasks/cancel-all", { method: "POST" });
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
};
