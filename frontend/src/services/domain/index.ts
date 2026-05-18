export { executionService, isDesktopRuntime } from "./executionService";
export { settingsService } from "./settingsService";
export { glossaryService } from "./glossaryService";
export type { GlossaryTerm } from "../../types/api";
export { translationService } from "./translationService";
export {
  DEFAULT_TRANSLATION_TARGET_LANGUAGE,
  TRANSLATION_TARGET_LANGUAGES,
  getTranslationTargetLanguageBySuffix,
  getTranslationTargetLanguageSuffix,
  isTranslationTargetLanguage,
  normalizeTranslationTargetLanguage,
} from "./translationTargetLanguages";
export type { TranslationTargetLanguage } from "./translationTargetLanguages";
export {
  buildSynthesisOptionsFromPreferences,
  resolveSynthesisWatermarkPath,
} from "./synthesisExecution";
export {
  DEFAULT_PRESETS,
  DEFAULT_SUBTITLE_POSITION,
  FONT_PRESETS,
  hexToAss,
} from "./synthesis/types";
export type { SubtitlePreset } from "./synthesis/types";
export {
  resolveContainedViewportFrame,
  resolvePreviewViewportMetrics,
} from "./synthesis/previewViewport";
export type {
  ContainedViewportFrame,
  PreviewViewportMetrics,
} from "./synthesis/previewViewport";
export {
  buildEmptySubtitlePreviewRenderSpec,
  buildSubtitleSynthesisOptions,
  buildPreviewTextShadow,
  computeDefaultSubtitleFontSize,
  computeSubtitleExportFontSize,
  hexWithOpacity,
  resolveSubtitlePreviewRenderSpec,
  resolveSubtitleRenderSourceSpec,
} from "./synthesis/subtitleRender";
export type {
  SubtitleRenderPreviewSpec,
  SubtitleRenderSourceInput,
  SubtitleRenderSourceSpec,
  SubtitleRenderStyleInput,
  SubtitleSynthesisStyleOptions,
} from "./synthesis/subtitleRender";
export {
  clampNormalizedPosition,
} from "./synthesis/subtitlePlacement";
export type { SubtitleCropRegion } from "./synthesis/subtitlePlacement";
export {
  resolveDefaultWatermarkLayout,
  resolveDefaultWatermarkScale,
  resolveWatermarkPosition,
} from "./synthesis/watermarkLayout";
export type {
  WatermarkLayout,
  WatermarkPositionPreset,
} from "./synthesis/watermarkLayout";
export type {
  PersistedSubtitleStyleValues,
  SubtitleMultilineAlign,
  SubtitleStyleValues,
} from "./synthesis/styleTypes";
export {
  getFontCatalogEntry,
  isBundledFont,
} from "./synthesis/fontCatalog";
export type {
  FontCatalogEntry,
  FontCatalogSource,
} from "./synthesis/fontCatalog";
export {
  isAiTranslationSetupRequiredError,
  isCliTranscriptionSetupRequiredError,
} from "./executionAccess";
export type {
  TranslateRequest,
  TranslateResponse,
  TranslationTaskStatus,
} from "../../types/api";
export { downloaderService } from "./downloaderService";
export {
  queueDownloadItems,
} from "./downloadSubmission";
export type {
  DownloadExtraInfo,
  DownloadQueueItem,
} from "./downloadSubmission";
export { preprocessingService } from "./preprocessingService";
export { editorService } from "./editorService";
export type {
  ExecutionMode,
  ExecutionOutcome,
  NullableExecutionMode,
  TaskExecutionSubmission,
} from "./taskSubmission";
export {
  createExecutionOutcomeFromSubmission,
  createTaskExecutionOutcome,
  createTaskExecutionSubmissionReceipt,
  createTaskFromExecutionOutcome,
  createTaskFromSubmissionReceipt,
  getExecutionSubmission,
  getRequiredExecutionSubmission,
} from "./taskSubmission";
export { applyExecutionOutcome, enqueueExecutionTask } from "./executionFlow";
