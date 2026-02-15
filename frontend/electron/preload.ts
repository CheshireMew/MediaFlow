// @ts-ignore
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  sendMessage: (message: any) => ipcRenderer.send("message-from-ui", message),
  openFile: () => ipcRenderer.invoke("dialog:openFile"),
  openSubtitleFile: () => ipcRenderer.invoke("dialog:openSubtitleFile"),
  readFile: (filePath: string) => ipcRenderer.invoke("fs:readFile", filePath),
  showSaveDialog: (options: any) =>
    ipcRenderer.invoke("dialog:saveFile", options),
  selectDirectory: () => ipcRenderer.invoke("dialog:selectDirectory"),
  showInExplorer: (filePath: string) =>
    ipcRenderer.invoke("shell:showInExplorer", filePath),
  // Window Controls
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  // Cookie management
  fetchCookies: (targetUrl: string) =>
    ipcRenderer.invoke("cookies:fetch", targetUrl),
  // Data extraction
  // Data extraction
  extractDouyinData: (url: string) => ipcRenderer.invoke("douyin:extract", url),
  // File Utils
  getPathForFile: (file: File) =>
    // @ts-ignore
    require("electron").webUtils.getPathForFile(file),
  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke("fs:writeFile", filePath, content),
  readBinaryFile: (filePath: string) =>
    ipcRenderer.invoke("fs:readBinaryFile", filePath),
  writeBinaryFile: (filePath: string, data: ArrayBuffer) =>
    ipcRenderer.invoke("fs:writeBinaryFile", filePath, data),
  getFileSize: (filePath: string) =>
    ipcRenderer.invoke("fs:getFileSize", filePath),
  saveFile: (filePath: string, content: string) =>
    ipcRenderer.invoke("fs:writeFile", filePath, content),
  // Config
  getConfig: () => ipcRenderer.invoke("config:get"),
});
