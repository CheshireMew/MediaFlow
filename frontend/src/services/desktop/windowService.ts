import { getDesktopApi } from "./bridge";

export const windowService = {
  minimize() {
    const api = getDesktopApi();
    if (api) api.minimize();
  },

  maximize() {
    const api = getDesktopApi();
    if (api) api.maximize();
  },

  close() {
    const api = getDesktopApi();
    if (api) api.close();
  },

  notifyRendererReady() {
    const api = getDesktopApi();
    if (api) api.notifyRendererReady();
  },

  onPrepareToClose(listener: () => boolean | Promise<boolean>) {
    const api = getDesktopApi();
    return api?.onPrepareToClose(listener) ?? (() => undefined);
  },
};
