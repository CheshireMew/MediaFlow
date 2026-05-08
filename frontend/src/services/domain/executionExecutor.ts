import {
  createTaskExecutionOutcome,
  type ExecutionOutcome,
} from "./taskSubmission";
import type { TaskResponse } from "../../types/api";

export async function executeTaskSubmission<TInput, TPayload = TInput>(args: {
  payload: TInput;
  normalizePayload?: (payload: TInput) => TPayload;
  backendSubmit: (payload: TPayload) => Promise<TaskResponse>;
}): Promise<ExecutionOutcome> {
  const normalizedPayload = args.normalizePayload
    ? args.normalizePayload(args.payload)
    : (args.payload as unknown as TPayload);

  return createTaskExecutionOutcome(
    await args.backendSubmit(normalizedPayload),
  );
}

export async function executeBackendDirectCall<TInput, TResult, TPayload = TInput>(args: {
  payload: TInput;
  normalizePayload?: (payload: TInput) => TPayload;
  backendCall: (payload: TPayload) => Promise<TResult>;
  normalizeResult?: (result: TResult, payload: TPayload) => TResult;
}): Promise<TResult> {
  const normalizedPayload = args.normalizePayload
    ? args.normalizePayload(args.payload)
    : (args.payload as unknown as TPayload);

  const result = await args.backendCall(normalizedPayload);

  return args.normalizeResult ? args.normalizeResult(result, normalizedPayload) : result;
}
