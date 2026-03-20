import { useEffect } from "react";

import type { ElectronFile } from "../../types/electron";
import type { TranscribeResult } from "../../types/transcriber";

export function restoreStoredTranscriberFile(): ElectronFile | null {
  const saved = localStorage.getItem("transcriber_file");
  if (!saved) return null;

  try {
    const meta = JSON.parse(saved) as { name: string; path: string; size: number };
    return {
      name: meta.name,
      path: meta.path,
      size: meta.size,
      type: "video/mp4",
    } as ElectronFile;
  } catch {
    return null;
  }
}

export function restoreStoredTranscriberResult(): TranscribeResult | null {
  const saved = localStorage.getItem("transcriber_result");
  return saved ? (JSON.parse(saved) as TranscribeResult) : null;
}

export function useTranscriberPersistence(params: {
  model: string;
  device: string;
  activeTaskId: string | null;
  result: TranscribeResult | null;
  file: ElectronFile | null;
}) {
  const { model, device, activeTaskId, result, file } = params;

  useEffect(() => {
    localStorage.setItem("transcriber_model", model);
    localStorage.setItem("transcriber_device", device);

    if (activeTaskId) {
      localStorage.setItem("transcriber_activeTaskId", activeTaskId);
    } else {
      localStorage.removeItem("transcriber_activeTaskId");
    }

    if (result) {
      localStorage.setItem("transcriber_result", JSON.stringify(result));
    } else {
      localStorage.removeItem("transcriber_result");
    }

    if (file?.path) {
      localStorage.setItem(
        "transcriber_file",
        JSON.stringify({
          name: file.name,
          path: file.path,
          size: file.size,
        }),
      );
    } else {
      localStorage.removeItem("transcriber_file");
    }
  }, [activeTaskId, device, file, model, result]);
}
