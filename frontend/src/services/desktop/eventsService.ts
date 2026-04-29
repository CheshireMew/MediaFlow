import { getDesktopApi } from "./bridge";

type DesktopProgressPayload = {
  event: string;
  task_id?: string | null;
  progress: number;
  message: string;
};

function onWorkerProgress(
  acceptedEvents: string[],
  callback: (payload: DesktopProgressPayload) => void,
) {
  return getDesktopApi()?.onDesktopProgress?.((payload) => {
    if (acceptedEvents.includes(payload.event)) {
      callback(payload);
    }
  }) ?? (() => undefined);
}

export const desktopEventsService = {
  onTaskEvent(callback: (payload: unknown) => void) {
    return getDesktopApi()?.onDesktopTaskEvent?.(callback) ?? (() => undefined);
  },

  onProgress(callback: (payload: DesktopProgressPayload) => void) {
    return getDesktopApi()?.onDesktopProgress?.(callback) ?? (() => undefined);
  },

  onTranscribeProgress(
    callback: (payload: { progress: number; message: string }) => void,
  ) {
    return onWorkerProgress(["progress"], callback);
  },

  onTranslateProgress(
    callback: (payload: { progress: number; message: string }) => void,
  ) {
    return onWorkerProgress(["translate_progress"], callback);
  },

  onSynthesizeProgress(
    callback: (payload: { progress: number; message: string }) => void,
  ) {
    return onWorkerProgress(["synthesize_progress"], callback);
  },

  onSettingsProgress(
    callback: (payload: { progress: number; message: string }) => void,
  ) {
    return onWorkerProgress(["settings_progress"], callback);
  },
};
