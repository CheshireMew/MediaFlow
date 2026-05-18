import type { TranslateRequest } from "../../../types/api";
import type { Task } from "../../../types/task";
import {
  DEFAULT_TRANSLATION_TARGET_LANGUAGE,
  executionService,
  normalizeTranslationTargetLanguage,
} from "../../domain";
import { fileService } from "../../fileService";
import { parseSubtitleContent } from "../../../utils/subtitleParser";
import type { RetryHandler, RetrySubmission } from "./types";
import {
  createRetryDescriptor,
  getRequestParams,
  getTaskMediaReference,
} from "./taskParams";

type TranslateMode = NonNullable<TranslateRequest["mode"]>;

function isTranslateMode(value: unknown): value is TranslateMode {
  return value === "standard" || value === "intelligent" || value === "proofread";
}

async function submitTranslateRetry(task: Task): Promise<RetrySubmission | null> {
  const params = getRequestParams(task);
  if (!params) {
    return null;
  }

  const contextRef = getTaskMediaReference(
    params,
    ["context_ref", "subtitle_ref"],
    "application/x-subrip",
  );
  const contextPath = contextRef?.path;
  if (!contextPath) {
    return null;
  }

  const content = await fileService.readFile(contextPath);
  if (content === null) {
    throw new Error(`Retry failed: subtitle file could not be read: ${contextPath}`);
  }
  const segments = parseSubtitleContent(content, contextPath);
  if (segments.length === 0) {
    throw new Error(`Retry failed: no subtitle segments found in ${contextPath}`);
  }

  const targetLanguage =
    typeof params.target_language === "string"
      ? normalizeTranslationTargetLanguage(params.target_language)
      : DEFAULT_TRANSLATION_TARGET_LANGUAGE;
  const mode: TranslateMode = isTranslateMode(params.mode) ? params.mode : "standard";
  const translateReq = {
    segments,
    target_language: targetLanguage,
    mode,
    context_ref: contextRef,
  } satisfies Parameters<typeof executionService.translate>[0];
  const outcome = await executionService.translate(translateReq);

  return {
    outcome,
    descriptor: createRetryDescriptor(
      "translate",
      {
        context_ref: contextRef,
        target_language: targetLanguage,
        mode,
      },
      task.name,
      task.created_at,
    ),
  };
}

export const translateRetryHandler: RetryHandler = {
  accepts: (task) => task.type === "translate",
  submit: submitTranslateRetry,
};
