/**
 * Shared API type definitions.
 *
 * Single source of truth for all request / response shapes used by the
 * API client and consumer components.  Import from here instead of
 * re‑declaring inline.
 */

import type { SubtitleSegment } from "./task";

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
  task_id: string;
  status: string;
  message?: string;
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
  language: string;
  translation_target_language: string;
  transcription_model: string;
  auto_execute_flow: boolean;
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

// ─── Audio ──────────────────────────────────────────────────────

export interface DetectSilenceResponse {
  silence_intervals: [number, number][];
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
  margin_v?: number;
  crf?: number;
  target_resolution?: string; // "original" | "720p" | "1080p"
  [key: string]: unknown;
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
    segments: SubtitleSegment[];
  };
  message?: string;
}

// ─── Translate ──────────────────────────────────────────────────

export interface TranslateRequest {
  segments: SubtitleSegment[];
  target_language: string;
  mode?: "standard" | "intelligent" | "proofread";
  context_path?: string | null;
}

export interface TranslateResponse {
  task_id: string;
  status: string;
  segments?: SubtitleSegment[];
}

// ─── OCR ────────────────────────────────────────────────────────

export interface OCRTextEvent {
  start: number;
  end: number;
  text: string;
  box: number[][];
}

export interface OCRExtractRequest {
  video_path: string;
  roi?: number[];
  engine: "rapid" | "paddle";
  sample_rate?: number;
}

export interface OCRExtractResponse {
  events: OCRTextEvent[];
}
