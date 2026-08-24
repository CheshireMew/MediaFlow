/**
 * API type surface.
 *
 * Backend-owned request and response models are generated in
 * `generatedApi.ts`; this file only adds local transport helpers and
 * frontend-only transport helpers.
 */

import type {
  PipelineRequest,
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
  JsonValue,
  LLMProvider,
  ActiveProviderResponse,
  ProviderConnectionResponse,
  MediaReference,
  MediaExportTimelineRequest,
  MediaExportTimelineResponse,
  PipelineStepRequest,
  PipelineRequest,
  PlaylistItem,
  TaskResponse,
  TaskCountActionResponse,
  TaskDeleteActionResponse,
  TaskStatusActionResponse,
  TaskArtifact,
  ToolUpdateResponse,
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
  SynthesisOptions,
  UiStatePatch,
  UserPreferencesPatch,
  UserSettings,
} from "./generatedApi";

export type { SynthesisOptions as SynthesizeOptions } from "./generatedApi";

export interface EditorWaveformPeaksResponse {
  duration: number;
  points_per_second: number;
  peaks: Float32Array[];
}

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

export type TranscribeSegmentRequest = GeneratedTranscribeSegmentRequest;

export type TranscriptionEngine = NonNullable<GeneratedTranscribeSegmentRequest["engine"]>;

export type PipelineStep = PipelineRequest["steps"][number];
