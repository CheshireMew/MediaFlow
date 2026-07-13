/**
 * API type surface.
 *
 * Backend-owned request and response models are generated in
 * `generatedApi.ts`; this file only adds local transport helpers and
 * frontend-only option bags that do not exist as backend Pydantic models.
 */

import type {
  PipelineRequest,
  SynthesisRequest as GeneratedSynthesisRequest,
  TaskResponse,
  TranscribeSegmentRequest as GeneratedTranscribeSegmentRequest,
} from "./generatedApi";

export type {
  AnalyzeResult,
  ClipCandidate,
  ClipExportRequest,
  ClipExportSegment,
  CookieSaveRequest,
  CookieStatusResponse,
  CreateGlossaryTermRequest,
  DetectSilenceRequest,
  DetectSilenceResponse,
  DownloadParams,
  EditorPreviewMediaRequest,
  EditorPreviewMediaResponse,
  GlossaryTerm,
  GlossaryDeleteResponse,
  HighlightDetectionRequest,
  HighlightDetectionResponse,
  HealthResponse,
  ImagePreviewResponse,
  LLMProvider,
  ActiveProviderResponse,
  ProviderConnectionResponse,
  MediaReference,
  MediaVisibleStartRequest,
  MediaVisibleStartResponse,
  PipelineStepRequest,
  PipelineRequest,
  PlaylistItem,
  SynthesisRequest as GeneratedSynthesisRequest,
  TaskResponse,
  TaskActionResponse,
  TaskCountActionResponse,
  TaskDeleteActionResponse,
  TaskStatusActionResponse,
  TaskArtifact,
  ToolUpdateResponse,
  TranscribeRequest,
  TranscribeSegmentRequest as GeneratedTranscribeSegmentRequest,
  TranslationRequest,
  TranslationTargetLanguage,
  TranslateParams,
  ImmediateTranslationResponse,
  TranscribeSegmentResponse,
  FasterWhisperCliInstallResponse,
  FasterWhisperCliPrewarmRequest,
  FasterWhisperCliPrewarmResponse,
  ProviderConnectionRequest,
  CudaReadinessResponse,
  RuntimeDependencyCheck,
  UiStatePatch,
  UserPreferencesPatch,
  UserSettings,
} from "./generatedApi";

export interface TaskSubmissionReceipt extends TaskResponse {
  task_source: import("../contracts/runtimeContracts").TaskSource;
  task_contract_version: number;
  persistence_scope: import("../contracts/runtimeContracts").TaskPersistenceScope;
  lifecycle: import("../contracts/runtimeContracts").TaskLifecycle;
  queue_state: import("../contracts/runtimeContracts").TaskQueueState;
  queue_position: number | null;
  message_code: import("../contracts/runtimeContracts").TaskMessageCode;
  message_params: Record<string, string | number | boolean | null>;
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

export type TranscriptionEngine = NonNullable<GeneratedTranscribeSegmentRequest["engine"]>;

export type PipelineStep = PipelineRequest["steps"][number];
