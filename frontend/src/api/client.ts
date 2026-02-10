import { API_BASE_URL } from "../config/api";

export const API_BASE = API_BASE_URL;

export interface PipelineStep {
  step_name: string;
  params: Record<string, any>;
}

export interface PipelineRequest {
  pipeline_id: string;
  task_name?: string;
  steps: PipelineStep[];
}

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
  extra_info?: Record<string, any>; // Flexible field for cookies etc
}

// Internal Generic Request Wrapper
async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = endpoint.startsWith("http") ? endpoint : `${API_BASE}${endpoint}`;

  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

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
      } catch (e) {
        // Ignore body parsing error
      }
      throw new Error(errorMessage);
    }

    // Check content type before parsing json
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") !== -1) {
      return (await res.json()) as T;
    }
    // For non-JSON responses (like void actions), return generic success if needed or null
    // If the caller expects T, this might be an issue if T isn't void-compatible.
    // Assuming mostly JSON APIs here.
    return {} as T;
    return {} as T;
  } catch (error: any) {
    console.error(`Status: Error requesting ${endpoint}`, error);
    // Generic Error Toast via Event
    import("../utils/toast").then(({ toast }) => {
      toast.error(error.message || "An unexpected error occurred");
    });
    throw error;
  }
}

export const apiClient = {
  checkHealth: () => {
    // Health check might be on root URL, not /api/v1
    const baseUrl = API_BASE.replace("/api/v1", "");
    return request<any>(`${baseUrl}/health`);
  },

  analyzeUrl: (url: string) => {
    return request<AnalyzeResult>("/analyze/", {
      method: "POST",
      body: JSON.stringify({ url }),
    });
  },

  runPipeline: (req: PipelineRequest) => {
    return request<any>("/pipeline/run", {
      method: "POST",
      body: JSON.stringify(req),
    });
  },

  cancelAllTasks: () => {
    return request<any>("/tasks/cancel-all", { method: "POST" });
  },

  resumeTask: (taskId: string) => {
    return request<any>(`/tasks/${taskId}/resume`, { method: "POST" });
  },

  deleteTask: (taskId: string) => {
    return request<any>(`/tasks/${taskId}`, { method: "DELETE" });
  },

  deleteAllTasks: () => {
    return request<any>("/tasks/", { method: "DELETE" });
  },

  // Cookie management
  saveCookies: (domain: string, cookies: any[]) => {
    return request<any>("/cookies/save", {
      method: "POST",
      body: JSON.stringify({ domain, cookies }),
    });
  },

  checkCookieStatus: (domain: string) => {
    return request<any>(`/cookies/status/${domain}`);
  },

  // Settings API
  getSettings: () => {
    return request<any>("/settings/");
  },

  updateSettings: (settings: any) => {
    return request<any>("/settings/", {
      method: "POST",
      body: JSON.stringify(settings),
    });
  },

  setActiveProvider: (providerId: string) => {
    return request<any>("/settings/active-provider", {
      method: "POST",
      body: JSON.stringify({ provider_id: providerId }),
    });
  },

  detectSilence: (payload: {
    file_path: string;
    threshold: string;
    min_duration: number;
  }) => {
    return request<any>("/audio/detect-silence", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  previewPsd: (payload: { file_path: string }) => {
    return request<any>("/editor/preview/psd-to-png", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  uploadPsd: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    // We can't use the generic request wrapper easily for FormData because it forces Content-Type: application/json
    // So we assume the generic request wrapper handles it or we manually fetch.
    // The generic `request` function in this file sets Content-Type: application/json if options.headers doesn't have it?
    // Actually line 45 forces "Content-Type": "application/json". This is bad for FormData.
    // We need to bypass the default header.

    const url = `${API_BASE}/editor/preview/upload-psd`;
    return fetch(url, {
      method: "POST",
      body: formData,
    }).then(async (res) => {
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || res.statusText);
      }
      return res.json();
    });
  },

  synthesizeVideo: (payload: {
    video_path: string;
    srt_path: string;
    watermark_path: string | null;
    output_path?: string | null;
    options: any;
  }) => {
    return request<any>("/editor/synthesize", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  uploadWatermark: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const url = `${API_BASE}/editor/preview/upload-watermark`;
    return fetch(url, { method: "POST", body: formData }).then(async (res) => {
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || res.statusText);
      }
      return res.json(); // Returns { png_path, data_url, width, height }
    });
  },

  getLatestWatermark: () => {
    return request<any>("/editor/preview/watermark/latest");
  },
};
