/**
 * API type surface.
 *
 * Backend-owned request and response models are generated in
 * `generatedApi.ts`; this file only adds local transport helpers and
 * frontend-only option bags that do not exist as backend Pydantic models.
 */

import type { SubtitleSegment } from "./task";
import type { TaskResultShape } from "../contracts/taskContract";
import type {
  CleanRequest,
  EnhanceRequest,
  LLMProvider as GeneratedLLMProvider,
  MediaReference,
  OCRExtractRequest as GeneratedOCRExtractRequest,
  PipelineRequest,
  ProviderConnectionRequest as GeneratedProviderConnectionRequest,
  SynthesisRequest as GeneratedSynthesisRequest,
  TaskResponse,
  TextEvent,
  TranscribeSegmentRequest as GeneratedTranscribeSegmentRequest,
  UserSettings as GeneratedUserSettings,
} from "./generatedApi";

export type {
  AnalyzeResult,
  CleanRequest,
  CreateGlossaryTermRequest,
  DownloadParams,
  EnhanceRequest,
  FileRef,
  GlossaryTerm,
  MediaReference,
  PipelineStepRequest,
  PipelineRequest,
  PlaylistItem,
  PreprocessingResponse,
  SynthesisRequest as GeneratedSynthesisRequest,
  TaskResponse,
  TaskArtifact,
  TextEvent,
  ToolUpdateResponse,
  TranscribeRequest,
  TranscribeSegmentRequest as GeneratedTranscribeSegmentRequest,
  TranslateParams,
  TranslateResponse,
  FasterWhisperCliInstallResponse,
  CudaReadinessResponse,
  RuntimeDependencyCheck,
} from "./generatedApi";

export type LLMProvider = Omit<GeneratedLLMProvider, "is_active"> & {
  is_active: boolean;
};

export type UserSettings = Omit<GeneratedUserSettings, "llm_providers"> & {
  llm_providers: LLMProvider[];
  default_download_path: string | null;
  faster_whisper_cli_path: string | null;
  language: string;
  auto_execute_flow: boolean;
  smart_split_text_limit: number;
};

export type ProviderConnectionRequest = Omit<GeneratedProviderConnectionRequest, "name"> & {
  name?: string;
};

export interface MessageResponse {
  message: string;
}

export interface CountResponse extends MessageResponse {
  count: number;
}

export interface StatusMessageResponse extends MessageResponse {
  status: string;
}

export interface TaskSubmissionReceipt extends TaskResponse {
  task_source: import("../contracts/runtimeContracts").TaskSource;
  task_contract_version: number;
  persistence_scope: "runtime" | "history";
  lifecycle: import("../contracts/runtimeContracts").TaskLifecycle;
  queue_state:
    | "queued"
    | "running"
    | "paused"
    | "cancelled"
    | "completed"
    | "failed"
    | "idle";
  queue_position: number | null;
}

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
}

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

export interface ActiveProviderResponse {
  status: string;
  active_provider_id: string;
}

export interface ProviderConnectionResponse {
  status: string;
  message: string;
}

export interface ImagePreviewResponse {
  png_path: string;
  data_url: string;
  width: number;
  height: number;
}

export interface SynthesizeOptions {
  font_name?: string;
  font_size?: number;
  font_color?: string;
  bold?: boolean;
  italic?: boolean;
  outline?: number;
  shadow?: number;
  outline_color?: string;
  back_color?: string;
  border_style?: number;
  alignment?: number;
  multiline_align?: "bottom" | "center" | "top";
  margin_v?: number;
  margin_l?: number;
  margin_r?: number;
  line_step?: number;
  subtitle_position_y?: number;
  crf?: number;
  preset?: string;
  use_gpu?: boolean;
  target_resolution?: string;
  trim_start?: number;
  trim_end?: number;
  crop_x?: number;
  crop_y?: number;
  crop_w?: number;
  crop_h?: number;
  video_width?: number;
  video_height?: number;
  skip_subtitles?: boolean;
  wm_scale?: number;
  wm_opacity?: number;
  wm_x?: string;
  wm_y?: string;
  wm_relative_width?: number;
  wm_pos_x?: number;
  wm_pos_y?: number;
  [key: string]: unknown;
}

export type SynthesizeRequest = Omit<GeneratedSynthesisRequest, "options"> & {
  options: SynthesizeOptions;
};

export type TranscribeSegmentRequest = GeneratedTranscribeSegmentRequest;

export interface TranscribeSegmentResponse {
  status: "completed" | "pending";
  task_id?: string;
  data?: {
    text: string;
    segments: SubtitleSegment[];
  };
  message?: string;
}

export type TranscriptionEngine = NonNullable<GeneratedTranscribeSegmentRequest["engine"]>;

export interface TranslateRequest {
  segments: SubtitleSegment[];
  target_language: string;
  mode?: "standard" | "intelligent" | "proofread";
  context_ref?: MediaReference | null;
}

export interface TranslationTaskStatus {
  task_id?: string;
  status: string;
  progress?: number;
  error?: string;
  result?: Pick<TaskResultShape, "segments" | "meta">;
}

export interface TaskQueueSummaryResponse {
  max_concurrent: number;
  running: number;
  queued: number;
}

export type OCRTextEvent = TextEvent;

export type OCRExtractRequest = GeneratedOCRExtractRequest & {
  engine: "rapid" | "paddle";
  task_id?: string;
};

export type EnhanceVideoRequest = EnhanceRequest & {
  task_id?: string;
};

export type CleanVideoRequest = Omit<CleanRequest, "roi"> & {
  roi: [number, number, number, number];
  task_id?: string;
};

export interface OCRExtractResponse {
  events: OCRTextEvent[];
}

export type PipelineStep = PipelineRequest["steps"][number];
