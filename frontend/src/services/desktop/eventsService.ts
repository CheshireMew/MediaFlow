import { getDesktopApi } from "./bridge";

export const desktopEventsService = {
  onTaskEvent(callback: (payload: unknown) => void) {
    return getDesktopApi()?.onDesktopTaskEvent?.(callback) ?? (() => undefined);
  },
};
