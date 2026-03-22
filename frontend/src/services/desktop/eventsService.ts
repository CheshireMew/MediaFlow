import { getDesktopApi } from "./bridge";

export const desktopEventsService = {
  onTaskEvent(callback: (payload: unknown) => void) {
    return getDesktopApi()?.onDesktopTaskEvent?.(callback) ?? (() => undefined);
  },

  onTranscribeProgress(
    callback: (payload: { progress: number; message: string }) => void,
  ) {
    return getDesktopApi()?.onDesktopTranscribeProgress?.(callback) ?? (() => undefined);
  },

  onTranslateProgress(
    callback: (payload: { progress: number; message: string }) => void,
  ) {
    return getDesktopApi()?.onDesktopTranslateProgress?.(callback) ?? (() => undefined);
  },

  onSynthesizeProgress(
    callback: (payload: { progress: number; message: string }) => void,
  ) {
    return getDesktopApi()?.onDesktopSynthesizeProgress?.(callback) ?? (() => undefined);
  },
};
