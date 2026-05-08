import { app, ipcMain } from "electron";
import { DESKTOP_BRIDGE_CAPABILITIES } from "../desktop/bridgeContract";
import { DESKTOP_BRIDGE_CONTRACT_VERSION } from "../../src/contracts/runtimeContracts";
import { getDesktopBackendRuntimeInfo } from "../backend/backendProcess";

export function registerDesktopHandlers() {
  ipcMain.handle("desktop:get-runtime-info", async () => {
    const backend = await getDesktopBackendRuntimeInfo();
    return {
      status: "pong" as const,
      contract_version: DESKTOP_BRIDGE_CONTRACT_VERSION,
      bridge_version: app.getVersion(),
      capabilities: [...DESKTOP_BRIDGE_CAPABILITIES],
      backend,
    };
  });
}
