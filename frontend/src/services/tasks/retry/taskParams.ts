import type { Task, TaskRequestParams, TaskType } from "../../../types/task";
import type { PipelineStepName } from "../../../contracts/generatedTaskCatalog";
import { normalizeMediaReference } from "../../ui/mediaReference";

export function getRequestParams(task: Task) {
  return task.request_params && typeof task.request_params === "object"
    ? (task.request_params as Record<string, unknown>)
    : null;
}

export function getPipelineSteps(task: Task) {
  const params = getRequestParams(task);
  return Array.isArray(params?.steps) ? params.steps : [];
}

export function getPipelineStep(task: Task, stepName: PipelineStepName) {
  return getPipelineSteps(task).find(
    (step) =>
      step &&
      typeof step === "object" &&
      "step_name" in step &&
      (step as { step_name?: string }).step_name === stepName,
  ) as { params?: Record<string, unknown> } | undefined;
}

export function getStepParams(task: Task, stepName: PipelineStepName) {
  const step = getPipelineStep(task, stepName);
  return step?.params && typeof step.params === "object" ? step.params : null;
}

export function createRetryDescriptor(
  type: TaskType,
  request_params: TaskRequestParams,
  name?: string,
  created_at?: number,
) {
  return {
    type,
    request_params,
    name,
    created_at,
  };
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isRoiTuple(value: unknown): value is [number, number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((item) => isFiniteNumber(item))
  );
}

export function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function getTaskMediaReference(
  params: Record<string, unknown>,
  keys: string[],
  type?: string,
) {
  for (const key of keys) {
    const ref = normalizeMediaReference(params[key], { type });
    if (ref) {
      return ref;
    }
  }
  return null;
}
