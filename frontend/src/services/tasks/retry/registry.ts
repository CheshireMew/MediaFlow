import type { Task } from "../../../types/task";
import { downloadRetryHandler } from "./downloadRetry";
import { synthesisRetryHandler } from "./synthesisRetry";
import { transcribeRetryHandler } from "./transcribeRetry";
import { translateRetryHandler } from "./translateRetry";
import type { RetryHandler } from "./types";

const retryHandlers: RetryHandler[] = [
  downloadRetryHandler,
  transcribeRetryHandler,
  translateRetryHandler,
  synthesisRetryHandler,
];

export function getRetryHandler(task: Task) {
  return retryHandlers.find((handler) => handler.accepts(task)) ?? null;
}
