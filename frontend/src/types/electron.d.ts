declare global {
  interface Window {
    electronAPI?: import("../contracts/desktopBridgeContract").ElectronAPI;
  }
}

export {};
