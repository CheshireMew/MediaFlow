import type {
  SaveFileDialogRequest,
  SaveFileDialogResult,
  SelectDirectoryRequest,
} from "../contracts/desktopFileSystemContract";

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

type MediaReference = import("../services/ui/mediaReference").MediaReference;

export interface ElectronAPI {
  openFile: (
    request: import("../contracts/openFileContract").OpenFileDialogRequest,
  ) => Promise<{ path: string; name: string; size: number } | null>;
  openSubtitleFile: () => Promise<{ path: string; name: string } | null>;
  readFile: (filePath: string) => Promise<string | null>;
  showSaveDialog: (
    options: SaveFileDialogRequest,
  ) => Promise<SaveFileDialogResult>;
  selectDirectory: (request?: SelectDirectoryRequest) => Promise<string | null>;
  showInExplorer: (filePath: string) => Promise<void>;
  fetchCookies: (targetUrl: string) => Promise<unknown>;
  getPathForFile: (file: File) => string;
  writeFile: (filePath: string, content: string) => Promise<void>;
  getFileSize: (filePath: string) => Promise<number>;
  getDesktopRuntimeInfo?: () => Promise<DesktopRuntimeInfo>;
  desktopPing?: () => Promise<{ status: string }>;
  listDesktopTasks?: () => Promise<import("./task").Task[]>;
  desktopTranscribe?: (payload: {
    audio_ref: MediaReference;
    engine?: import("./api").TranscriptionEngine;
    model: string;
    device: string;
    language?: string | null;
    initial_prompt?: string | null;
  }) => Promise<import("./api").TaskResponse>;
  desktopTranslate?: (payload: {
    segments: Array<{ id: string | number; start: number; end: number; text: string }>;
    target_language: string;
    mode: "standard" | "intelligent" | "proofread";
    context_ref?: MediaReference | null;
  }) => Promise<import("./api").TaskResponse>;
  desktopSynthesize?: (payload: {
    task_id?: string;
    video_ref: MediaReference;
    srt_ref: MediaReference;
    watermark_path?: string | null;
    output_ref?: MediaReference | null;
    options: Record<string, unknown>;
  }) => Promise<import("./api").TaskResponse>;
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
  installDesktopFasterWhisperCli?: () => Promise<import("./api").FasterWhisperCliInstallResponse>;
  analyzeDesktopUrl?: (url: string) => Promise<import("./api").AnalyzeResult>;
  saveDesktopCookies?: (
    domain: string,
    cookies: import("./api").ElectronCookie[],
  ) => Promise<{
    domain: string;
    has_valid_cookies: boolean;
    cookie_path: string;
  }>;
  desktopDownload?: (payload: Record<string, unknown>) => Promise<import("./api").TaskResponse>;
  desktopExtract?: (payload: {
    task_id?: string;
    video_ref: MediaReference;
    roi?: number[];
    engine: "rapid" | "paddle";
    sample_rate?: number;
  }) => Promise<import("./api").TaskResponse>;
  getDesktopOcrResults?: (
    videoRef: MediaReference,
  ) => Promise<{ events: import("./api").OCRTextEvent[] }>;
  desktopTranscribeSegment?: (
    payload: import("./api").TranscribeSegmentRequest,
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
    video_ref: MediaReference;
    model?: string;
    scale?: string;
    method?: string;
  }) => Promise<import("./api").TaskResponse>;
  desktopClean?: (payload: {
    task_id?: string;
    video_ref: MediaReference;
    roi: [number, number, number, number];
    method?: string;
  }) => Promise<import("./api").TaskResponse>;
  pauseDesktopTask?: (taskId: string) => Promise<{ status: string }>;
  resumeDesktopTask?: (taskId: string) => Promise<{ status: string }>;
  cancelDesktopTask?: (taskId: string) => Promise<{ status: string }>;
  onDesktopTaskEvent?: (callback: (payload: unknown) => void) => () => void;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  notifyRendererReady?: () => void;
}
