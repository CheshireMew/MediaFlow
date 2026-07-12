import type { Task, TaskRequestParams } from "../../../types/task";
import { executionService } from "../../domain/executionService";
import type { RetryHandler, RetrySubmission } from "./types";
import {
  createRetryDescriptor,
  getPipelineStep,
  getRequestParams,
  getStepParams,
  getTaskMediaReference,
  readOptionalString,
} from "./taskParams";

async function submitTranscribeRetry(task: Task): Promise<RetrySubmission | null> {
  const stepParams = getStepParams(task, "transcribe");
  const params = stepParams ?? getRequestParams(task);
  if (!params) {
    return null;
  }

  const audioRef = getTaskMediaReference(params, ["audio_ref", "video_ref"], "video/mp4");
  if (!audioRef?.path) {
    return null;
  }

  const engine = params.engine === "cli" ? "cli" : "builtin";
  const model = typeof params.model === "string" ? params.model : "base";
  const device = typeof params.device === "string" ? params.device : "cpu";
  const language = readOptionalString(params.language);
  const initialPrompt = readOptionalString(params.initial_prompt);

  const outcome = await executionService.transcribe({
    audio_ref: audioRef,
    task_name: task.name || audioRef.name || audioRef.path,
    engine,
    model,
    device,
    language: language ?? null,
    initial_prompt: initialPrompt ?? null,
  });

  const request_params: TaskRequestParams =
    task.type === "pipeline"
      ? {
          pipeline_id: "transcriber_tool",
          steps: [
            {
              step_name: "transcribe",
              params: {
                audio_ref: audioRef,
                engine,
                model,
                device,
                language,
                initial_prompt: initialPrompt,
              },
            },
          ],
          video_ref: audioRef,
        }
      : {
          audio_ref: audioRef,
          engine: (params.engine as "builtin" | "cli" | undefined) ?? "builtin",
          model: typeof params.model === "string" ? params.model : "base",
          device: typeof params.device === "string" ? params.device : "cpu",
          language: typeof params.language === "string" ? params.language : undefined,
          initial_prompt: typeof params.initial_prompt === "string" ? params.initial_prompt : undefined,
        };

  return {
    outcome,
    descriptor: createRetryDescriptor(task.type, request_params, task.name, task.created_at),
  };
}

export const transcribeRetryHandler: RetryHandler = {
  accepts: (task) => task.type === "transcribe" || Boolean(getPipelineStep(task, "transcribe")),
  submit: submitTranscribeRetry,
};
