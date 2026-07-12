import type { TFunction } from "i18next";

import type { TaskMessageCode } from "../../contracts/runtimeContracts";


export type TaskMessageDescriptor = {
  message_code: TaskMessageCode;
  message_params: Record<string, string | number | boolean | null>;
};

function formatBytes(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = value;
  let unit = units[0];
  for (let index = 1; index < units.length && amount >= 1024; index += 1) {
    amount /= 1024;
    unit = units[index];
  }
  const digits = unit === "B" ? 0 : 1;
  return `${amount.toFixed(digits)} ${unit}`;
}

export function translateTaskMessage(
  t: TFunction,
  descriptor: TaskMessageDescriptor,
): string {
  const params = { ...descriptor.message_params };
  if (descriptor.message_code === "asr_model_downloading") {
    params.downloaded = formatBytes(params.downloaded_bytes);
    params.total = formatBytes(params.total_bytes);
  }
  return t(`taskmonitor:taskMessages.${descriptor.message_code}`, params);
}
