declare global {
  interface Window {
    electronAPI?: import("./electron-api").ElectronAPI;
  }
}

export {};
