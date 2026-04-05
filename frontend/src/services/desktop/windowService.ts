import { getDesktopApi } from "./bridge";

export const windowService = {
  minimize() {
    getDesktopApi()?.minimize?.();
  },

  maximize() {
    getDesktopApi()?.maximize?.();
  },

  close() {
    getDesktopApi()?.close?.();
  },

  notifyRendererReady() {
    getDesktopApi()?.notifyRendererReady?.();
  },
};
