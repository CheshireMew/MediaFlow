export type SaveDialogOptions = {
  title?: string;
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
};

export type SaveDialogResult = {
  canceled: boolean;
  filePath?: string;
};

export type ExtractedDouyinData = {
  title?: string;
  video_url?: string;
  audio_url?: string;
  cover_url?: string;
  [key: string]: unknown;
};

export interface DesktopRuntimeInfo {
  status: "pong";
  contract_version: number;
  bridge_version: string;
  task_owner_mode: import("../contracts/runtimeContracts").TaskOwnerMode;
  capabilities: Array<keyof ElectronAPI>;
  worker: {
    protocol_version: number;
    app_version?: string | null;
  };
}

export interface ElectronAPI {
  sendMessage: (message: string) => void;
  openFile: (
    defaultPath?: string,
  ) => Promise<{ path: string; name: string; size: number } | null>;
  openSubtitleFile: () => Promise<{ path: string; name: string } | null>;
  readFile: (filePath: string) => Promise<string>;
  showSaveDialog: (options: SaveDialogOptions) => Promise<SaveDialogResult>;
  selectDirectory: () => Promise<string | null>;
  showInExplorer: (filePath: string) => Promise<void>;
  fetchCookies: (targetUrl: string) => Promise<unknown>;
  extractDouyinData: (url: string) => Promise<ExtractedDouyinData>;
  getPathForFile: (file: File) => string;
  writeFile: (filePath: string, content: string) => Promise<void>;
  readBinaryFile: (filePath: string) => Promise<ArrayBuffer | null>;
  writeBinaryFile: (filePath: string, data: ArrayBuffer) => Promise<void>;
  getFileSize: (filePath: string) => Promise<number>;
  resolveExistingPath?: (
    filePath: string,
    fallbackName?: string,
    expectedSize?: number,
  ) => Promise<string | null>;
  saveFile: (filePath: string, content: string) => Promise<void>;
  getDesktopRuntimeInfo?: () => Promise<DesktopRuntimeInfo>;
  desktopPing?: () => Promise<{ status: string }>;
  listDesktopTasks?: () => Promise<import("./task").Task[]>;
  desktopTranscribe?: (payload: {
    audio_path?: string | null;
    audio_ref?: import("../services/ui/mediaReference").MediaReference | null;
    engine?: import("./api").TranscriptionEngine;
    model: string;
    device: string;
    language?: string | null;
    initial_prompt?: string | null;
  }) => Promise<import("../contracts/taskContract").DesktopTranscribeDirectResult>;
  desktopTranslate?: (payload: {
    segments: Array<{ id: string | number; start: number; end: number; text: string }>;
    target_language: string;
    mode: "standard" | "intelligent" | "proofread";
    context_path?: string | null;
    context_ref?: import("../services/ui/mediaReference").MediaReference | null;
  }) => Promise<import("./api").TranslateResponse>;
  desktopSynthesize?: (payload: {
    task_id?: string;
    video_path?: string | null;
    video_ref?: import("../services/ui/mediaReference").MediaReference | null;
    srt_path?: string | null;
    srt_ref?: import("../services/ui/mediaReference").MediaReference | null;
    watermark_path?: string | null;
    output_path?: string | null;
    options: Record<string, unknown>;
  }) => Promise<import("./api").SynthesizeResponse>;
  getDesktopSettings?: () => Promise<import("./api").UserSettings>;
  updateDesktopSettings?: (
    settings: import("./api").UserSettings,
  ) => Promise<import("./api").UserSettings>;
  setDesktopActiveProvider?: (providerId: string) => Promise<{
    status: string;
    active_provider_id: string;
  }>;
  testDesktopProvider?: (payload: {
    name?: string;
    base_url: string;
    api_key: string;
    model: string;
  }) => Promise<{
    status: string;
    message: string;
  }>;
  listDesktopGlossary?: () => Promise<import("./api").GlossaryTerm[]>;
  addDesktopGlossaryTerm?: (payload: {
    source: string;
    target: string;
    note?: string;
    category?: string;
  }) => Promise<import("./api").GlossaryTerm>;
  deleteDesktopGlossaryTerm?: (termId: string) => Promise<{ status: string }>;
  updateDesktopYtDlp?: () => Promise<import("./api").ToolUpdateResponse>;
  analyzeDesktopUrl?: (url: string) => Promise<import("./api").AnalyzeResult>;
  saveDesktopCookies?: (
    domain: string,
    cookies: import("./api").ElectronCookie[],
  ) => Promise<{
    domain: string;
    has_valid_cookies: boolean;
    cookie_path: string;
  }>;
  desktopDownload?: (payload: Record<string, unknown>) => Promise<import("./task").TaskResult>;
  desktopExtract?: (payload: {
    task_id?: string;
    video_path?: string | null;
    video_ref?: import("../services/ui/mediaReference").MediaReference | null;
    roi?: number[];
    engine: "rapid" | "paddle";
    sample_rate?: number;
  }) => Promise<{
    events: import("./api").OCRTextEvent[];
    files: Array<{ type: string; path: string; label?: string }>;
  }>;
  getDesktopOcrResults?: (
    videoPath: string,
  ) => Promise<{ events: import("./api").OCRTextEvent[] }>;
  detectDesktopSilence?: (payload: {
    file_path: string;
    threshold: string;
    min_duration: number;
  }) => Promise<import("./api").DetectSilenceResponse>;
  getDesktopPeaks?: (videoPath: string) => Promise<ArrayBuffer | null>;
  desktopTranscribeSegment?: (
    payload: Omit<import("./api").TranscribeSegmentRequest, "video_path" | "srt_path" | "watermark_path" | "options">,
  ) => Promise<{
    status: "completed";
    data: {
      text: string;
      segments: import("./task").SubtitleSegment[];
    };
  }>;
  desktopTranslateSegment?: (
    payload: import("./api").TranslateRequest,
  ) => Promise<import("./api").TranslateResponse>;
  uploadDesktopWatermark?: (
    filePath: string,
  ) => Promise<import("./api").ImagePreviewResponse>;
  getDesktopLatestWatermark?: () => Promise<import("./api").ImagePreviewResponse | null>;
  desktopEnhance?: (payload: {
    task_id?: string;
    video_path?: string | null;
    video_ref?: import("../services/ui/mediaReference").MediaReference | null;
    model?: string;
    scale?: string;
    method?: string;
  }) => Promise<import("./task").TaskResult>;
  desktopClean?: (payload: {
    task_id?: string;
    video_path?: string | null;
    video_ref?: import("../services/ui/mediaReference").MediaReference | null;
    roi: [number, number, number, number];
    method?: string;
  }) => Promise<import("./task").TaskResult>;
  pauseDesktopTask?: (taskId: string) => Promise<{ status: string }>;
  resumeDesktopTask?: (taskId: string) => Promise<{ status: string }>;
  cancelDesktopTask?: (taskId: string) => Promise<{ status: string }>;
  onDesktopTaskEvent?: (callback: (payload: unknown) => void) => () => void;
  onDesktopTranscribeProgress?: (
    callback: (payload: { progress: number; message: string }) => void,
  ) => () => void;
  onDesktopTranslateProgress?: (
    callback: (payload: { progress: number; message: string }) => void,
  ) => () => void;
  onDesktopSynthesizeProgress?: (
    callback: (payload: { progress: number; message: string }) => void,
  ) => () => void;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
}
