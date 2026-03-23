import type { TaskResponse } from "../../types/api";
import { isDesktopRuntime, requireDesktopApiMethod } from "../desktop/bridge";
import {
  createDesktopTaskExecutionOutcome,
  createDirectExecutionOutcome,
  createTaskExecutionOutcome,
  type ExecutionOutcome,
} from "./taskSubmission";

type ElectronApi = import("../../types/electron-api").ElectronAPI;
type DesktopMethodKey = keyof ElectronApi;

type DesktopMethodArgs<K extends DesktopMethodKey> =
  Parameters<NonNullable<ElectronApi[K]>>;

type DesktopMethodResult<K extends DesktopMethodKey> =
  Awaited<ReturnType<NonNullable<ElectronApi[K]>>>;

function resolveDesktopTaskId<TPayload extends { task_id?: string | null }>(
  payload: TPayload | unknown,
  prefix: string,
) {
  if (
    payload &&
    typeof payload === "object" &&
    "task_id" in payload &&
    typeof (payload as { task_id?: unknown }).task_id === "string" &&
    (payload as { task_id: string }).task_id.length > 0
  ) {
    return (payload as { task_id: string }).task_id;
  }

  return `${prefix}-${Date.now()}`;
}

function withDesktopTaskId<TPayload>(payload: TPayload, taskId: string) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Desktop task submission payload must be an object");
  }

  return {
    ...(payload as Record<string, unknown>),
    task_id: taskId,
  };
}

export async function executeDesktopDirectResult<
  TInput,
  TResult,
  K extends DesktopMethodKey,
  TPayload = TInput,
>(args: {
  payload: TInput;
  normalizePayload?: (payload: TInput) => TPayload;
  desktopMethod: K;
  desktopUnavailableMessage: string;
  mapDesktopArgs?: (payload: TPayload) => DesktopMethodArgs<K>;
  backendSubmit: (payload: TPayload) => Promise<TaskResponse>;
  normalizeDirectResult?: (
    result: DesktopMethodResult<K>,
    payload: TPayload,
  ) => TResult;
}): Promise<ExecutionOutcome<TResult>> {
  const normalizedPayload = args.normalizePayload
    ? args.normalizePayload(args.payload)
    : (args.payload as unknown as TPayload);

  if (isDesktopRuntime()) {
    const desktopMethod = requireDesktopApiMethod(
      args.desktopMethod,
      args.desktopUnavailableMessage,
    ) as (...desktopArgs: DesktopMethodArgs<K>) => Promise<DesktopMethodResult<K>>;
    const result = await desktopMethod(
      ...(args.mapDesktopArgs ? args.mapDesktopArgs(normalizedPayload) : ([normalizedPayload] as unknown as DesktopMethodArgs<K>)),
    );
    return createDirectExecutionOutcome(
      args.normalizeDirectResult
        ? args.normalizeDirectResult(result, normalizedPayload)
        : (result as TResult),
    );
  }

  return createTaskExecutionOutcome(
    await args.backendSubmit(normalizedPayload),
    "backend",
  );
}

export async function executeDesktopTaskSubmission<
  TInput,
  K extends DesktopMethodKey,
  TPayload = TInput,
>(args: {
  payload: TInput;
  normalizePayload?: (payload: TInput) => TPayload;
  desktopMethod: K;
  desktopUnavailableMessage: string;
  desktopTaskIdPrefix: string;
  desktopSubmissionMessage: string;
  desktopFailureLogLabel: string;
  mapDesktopArgs?: (payload: TPayload, taskId: string) => DesktopMethodArgs<K>;
  backendSubmit: (payload: TPayload) => Promise<TaskResponse>;
}): Promise<ExecutionOutcome<never>> {
  const normalizedPayload = args.normalizePayload
    ? args.normalizePayload(args.payload)
    : (args.payload as unknown as TPayload);

  if (isDesktopRuntime()) {
    const taskId = resolveDesktopTaskId(normalizedPayload, args.desktopTaskIdPrefix);
    const desktopMethod = requireDesktopApiMethod(
      args.desktopMethod,
      args.desktopUnavailableMessage,
    ) as (...desktopArgs: DesktopMethodArgs<K>) => Promise<unknown>;

    void desktopMethod(
      ...(args.mapDesktopArgs
        ? args.mapDesktopArgs(normalizedPayload, taskId)
        : ([withDesktopTaskId(normalizedPayload, taskId)] as unknown as DesktopMethodArgs<K>)),
    ).catch((error: unknown) => {
      console.error(args.desktopFailureLogLabel, error);
    });

    return createDesktopTaskExecutionOutcome(taskId, args.desktopSubmissionMessage);
  }

  return createTaskExecutionOutcome(
    await args.backendSubmit(normalizedPayload),
    "backend",
  );
}

export async function executeBackendTaskSubmission<TInput, TPayload = TInput>(args: {
  payload: TInput;
  normalizePayload?: (payload: TInput) => TPayload;
  submit: (payload: TPayload) => Promise<TaskResponse>;
}): Promise<ExecutionOutcome<never>> {
  const normalizedPayload = args.normalizePayload
    ? args.normalizePayload(args.payload)
    : (args.payload as unknown as TPayload);

  return createTaskExecutionOutcome(await args.submit(normalizedPayload), "backend");
}

export async function executeBackendDirectCall<
  TInput,
  TResult,
  K extends DesktopMethodKey,
  TPayload = TInput,
>(args: {
  payload: TInput;
  normalizePayload?: (payload: TInput) => TPayload;
  desktopMethod: K;
  desktopUnavailableMessage: string;
  mapDesktopArgs?: (payload: TPayload) => DesktopMethodArgs<K>;
  backendCall: (payload: TPayload) => Promise<TResult>;
  normalizeResult?: (result: TResult, payload: TPayload) => TResult;
}): Promise<TResult> {
  const normalizedPayload = args.normalizePayload
    ? args.normalizePayload(args.payload)
    : (args.payload as unknown as TPayload);

  let result: TResult;
  if (isDesktopRuntime()) {
    const desktopMethod = requireDesktopApiMethod(
      args.desktopMethod,
      args.desktopUnavailableMessage,
    ) as (...desktopArgs: DesktopMethodArgs<K>) => Promise<TResult>;
    result = await desktopMethod(
      ...(args.mapDesktopArgs ? args.mapDesktopArgs(normalizedPayload) : ([normalizedPayload] as unknown as DesktopMethodArgs<K>)),
    );
  } else {
    result = await args.backendCall(normalizedPayload);
  }

  return args.normalizeResult ? args.normalizeResult(result, normalizedPayload) : result;
}
