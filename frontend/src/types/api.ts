/**
 * Shared API type definitions.
 *
 * Single source of truth for all request / response shapes used by the
 * API client and consumer components.  Import from here instead of
 * re‑declaring inline.
 */

import type { SubtitleSegment } from "./task";
import type { MediaReference } from "../services/ui/mediaReference";
import type {
  DesktopSynthesizeDirectResult,
  DesktopTranslateDirectResult,
  TaskResultShape,
} from "../contracts/taskContract";

// ─── Generic Response Shapes ────────────────────────────────────

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

/** Task creation / pipeline submission response. */
export interface TaskResponse {
  task_id?: string;
  status: string;
  message?: string;
}

/** Explicit task submission receipt returned when a runtime task has been accepted. */
export interface TaskSubmissionReceipt extends TaskResponse {
  task_id: string;
  task_source?: "desktop" | "backend";
  task_contract_version?: number;
  persistence_scope?: "runtime" | "history";
  lifecycle?: import("../contracts/runtimeContracts").TaskLifecycle;
  queue_state?:
    | "queued"
    | "running"
    | "paused"
    | "cancelled"
    | "completed"
    | "failed"
    | "idle";
  queue_position?: number | null;
}

// ─── Health ─────────────────────────────────────────────────────

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
}

// ─── Pipeline ───────────────────────────────────────────────────

export interface PipelineStep {
  step_name: string;
  params: Record<string, unknown>;
}

export interface PipelineRequest {
  pipeline_id: string;
  task_name?: string;
  steps: PipelineStep[];
}

// ─── Analyze ────────────────────────────────────────────────────

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
  direct_src?: string;
  thumbnail?: string;
  duration?: number;
  count?: number;
  uploader?: string;
  items?: PlaylistItem[];
  extra_info?: Record<string, unknown>;
}

// ─── Cookies ────────────────────────────────────────────────────

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

export interface GlossaryTerm {
  id: string;
  source: string;
  target: string;
  note?: string;
  category?: string;
}

// ─── Settings ───────────────────────────────────────────────────

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
  faster_whisper_cli_path: string | null;
  language: string;
  auto_execute_flow: boolean;
  smart_split_text_limit: number;
}

export interface ActiveProviderResponse {
  status: string;
  active_provider_id: string;
}

export interface ProviderConnectionRequest {
  name?: string;
  base_url: string;
  api_key: string;
  model: string;
}

export interface ProviderConnectionResponse {
  status: string;
  message: string;
}

export interface ToolUpdateResponse {
  status: string;
  message: string;
  previous_version?: string | null;
  current_version?: string | null;
}

export interface FasterWhisperCliInstallResponse {
  status: string;
  message: string;
  cli_path: string;
  version?: string | null;
}

// ─── Editor ─────────────────────────────────────────────────────

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
  target_resolution?: string; // "original" | "720p" | "1080p"
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

export interface SynthesizeRequest {
  video_path?: string | null;
  video_ref?: MediaReference | null;
  srt_path?: string | null;
  srt_ref?: MediaReference | null;
  watermark_path: string | null;
  output_path?: string | null;
  output_ref?: MediaReference | null;
  options: SynthesizeOptions;
}

export type SynthesizeResponse = DesktopSynthesizeDirectResult;

export interface TranscribeSegmentRequest {
  audio_path?: string | null;
  audio_ref?: MediaReference | null;
  start: number;
  end: number;
  engine?: "builtin" | "cli";
  model?: string;
  device?: string;
  language?: string;
  initial_prompt?: string;
  video_path?: string | null;
  srt_path?: string | null;
  watermark_path?: string | null;
  options?: SynthesizeOptions;
}

export interface TranscribeSegmentResponse {
  status: "completed" | "pending";
  task_id?: string;
  data?: {
    text: string;
    segments: SubtitleSegment[];
  };
  message?: string;
}

export type TranscriptionEngine = "builtin" | "cli";

// ─── Translate ──────────────────────────────────────────────────

export interface TranslateRequest {
  segments: SubtitleSegment[];
  target_language: string;
  mode?: "standard" | "intelligent" | "proofread";
  context_path?: string | null;
  context_ref?: MediaReference | null;
}

export interface TranslateResponse extends Partial<DesktopTranslateDirectResult> {
  task_id?: string;
  status?: string;
  srt_path?: string | null;
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

// ─── OCR ────────────────────────────────────────────────────────

export interface OCRTextEvent {
  start: number;
  end: number;
  text: string;
  box: number[][];
}

export interface OCRExtractRequest {
  video_path?: string | null;
  video_ref?: MediaReference | null;
  roi?: number[];
  engine: "rapid" | "paddle";
  sample_rate?: number;
  task_id?: string;
}

export interface EnhanceVideoRequest {
  video_path?: string | null;
  video_ref?: MediaReference | null;
  model?: string;
  scale?: string;
  method?: string;
  task_id?: string;
}

export interface CleanVideoRequest {
  video_path?: string | null;
  video_ref?: MediaReference | null;
  roi: [number, number, number, number];
  method?: string;
  task_id?: string;
}

export interface OCRExtractResponse {
  events: OCRTextEvent[];
}
