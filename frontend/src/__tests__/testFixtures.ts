import { useEditorStore } from "../stores/editorStore";
import { usePreprocessingStore } from "../stores/preprocessingStore";
import { TASK_CONTRACT_VERSION, TASK_LIFECYCLE } from "../contracts/runtimeContracts";
import { writeUiStateValue } from "../services/persistence/uiStateSettings";
import type { Task, TaskRequestParams } from "../types/task";
import type { TranscribeResult } from "../types/transcriber";

export const BACKEND_TASK_CONTRACT_FIELDS = {
  task_source: "backend",
  task_contract_version: TASK_CONTRACT_VERSION,
  persistence_scope: "runtime",
  lifecycle: TASK_LIFECYCLE.resumable,
  queue_state: "idle",
  primary_operation: "pipeline",
  artifacts: [],
} as const satisfies Pick<
  Task,
  | "task_source"
  | "task_contract_version"
  | "persistence_scope"
  | "lifecycle"
  | "queue_state"
  | "primary_operation"
  | "artifacts"
>;

export function createSampleTranscriptionResult(
  overrides: Partial<TranscribeResult> = {},
): TranscribeResult {
  return {
    text: "hello world",
    language: "en",
    video_ref: {
      path: "E:/sample.mp4",
      name: "sample.mp4",
    },
    subtitle_ref: {
      path: "E:/sample.srt",
      name: "sample.srt",
    },
    segments: [{ id: "1", start: 0, end: 1, text: "hello" }],
    ...overrides,
  };
}

export function seedJapaneseCudaExecutionPreferences(
  asrOverrides: Partial<{
    engine: string;
    model: string;
    device: string;
  }> = {},
) {
  writeUiStateValue(
    "asr_execution_preferences",
    JSON.stringify({
      schema_version: 1,
      payload: {
        engine: "builtin",
        model: "base",
        device: "cuda",
        ...asrOverrides,
      },
    }),
  );
  writeUiStateValue(
    "translation_preferences",
    JSON.stringify({
      schema_version: 2,
      payload: {
        targetLanguage: "Japanese",
        mode: "intelligent",
      },
    }),
  );
}

export function resetEditorStoreForTests() {
  useEditorStore.setState({
    regions: [],
    mediaUrl: null,
    currentFilePath: null,
    currentSubtitlePath: null,
    currentFileRef: null,
    currentSubtitleRef: null,
    activeSegmentId: null,
    selectedIds: [],
    past: [],
    future: [],
  });
}

export function resetPreprocessingStoreForTests(
  overrides: Partial<ReturnType<typeof usePreprocessingStore.getState>> = {},
) {
  usePreprocessingStore.setState({
    preprocessingActiveTool: "extract",
    enhanceModel: "RealESRGAN-x4plus",
    enhanceScale: "4x",
    enhanceMethod: "realesrgan",
    cleanMethod: "telea",
    ocrEngine: "rapid",
    ocrResults: [],
    preprocessingIsProcessing: false,
    currentPreprocessingTaskId: null,
    currentPreprocessingTaskTool: null,
    currentPreprocessingTaskVideoPath: null,
    currentPreprocessingTaskVideoRef: null,
    preprocessingFiles: [],
    preprocessingVideoPath: null,
    preprocessingVideoRef: null,
    ...overrides,
  });
}

export function createTranscribeStepRequestParams(): TaskRequestParams {
  return {
    steps: [
      {
        step_name: "transcribe",
        params: {
          audio_ref: {
            path: "E:/sample.mp4",
            name: "sample.mp4",
          },
        },
      },
    ],
  };
}
