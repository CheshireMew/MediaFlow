import { ipcMain } from "electron";
import path from "path";
import fs from "fs";

export const registerConfigHandlers = () => {
  ipcMain.handle("config:get", async () => {
    try {
      let configPath = "";

      if (process.env.IS_DEV === "true") {
        // Dev: frontend/ -> root -> user_data
        configPath = path.resolve(
          process.cwd(),
          "..",
          "user_data",
          "server.json",
        );
      } else {
        // Prod: resources/../user_data
        configPath = path.join(
          process.resourcesPath,
          "..",
          "user_data",
          "server.json",
        );
      }

      console.log(`[Config] Looking for config at: ${configPath}`);

      if (fs.existsSync(configPath)) {
        const data = fs.readFileSync(configPath, "utf-8");
        return JSON.parse(data);
      } else {
        console.warn(`[Config] server.json not found at ${configPath}`);
      }
    } catch (e) {
      console.error("[Config] Failed to read server.json", e);
    }
    return null;
  });
};
