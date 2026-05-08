import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

function parseOptionalPort(value: string | undefined) {
  if (!value?.trim()) {
    return undefined;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid MEDIAFLOW_RENDERER_DEV_PORT: ${value}`);
  }

  return port;
}

const devServerHost = process.env.MEDIAFLOW_RENDERER_DEV_HOST?.trim() || "127.0.0.1";
const devServerPort = parseOptionalPort(process.env.MEDIAFLOW_RENDERER_DEV_PORT);

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    host: devServerHost,
    port: devServerPort,
    strictPort: devServerPort !== undefined,
    watch: {
      ignored: [
        '**/build-desktop-backend/**',
        '**/dist-desktop-backend/**',
        '**/dist/**',
        '**/node_modules/**',
      ],
    },
  },
  optimizeDeps: {
    include: [
      "lucide-react",
      "react-i18next",
      "react-router-dom",
      "react-virtualized-auto-sizer",
      "react-window",
      "wavesurfer.js",
      "wavesurfer.js/dist/plugins/hover.esm.js",
      "wavesurfer.js/dist/plugins/regions.esm.js",
      "wavesurfer.js/dist/plugins/timeline.esm.js",
      "zustand",
    ],
  },
  test: {
    globals: true,
    environmentOptions: {
      jsdom: {
        url: "http://localhost/",
      },
    },
    pool: "forks",
    setupFiles: "./src/__tests__/setup.ts",
    projects: [
      {
        extends: true,
        test: {
          name: "ui",
          include: ["src/**/*.{test,spec}.{ts,tsx}"],
          environment: "jsdom",
        },
      },
    ],
  },
  esbuild: {
    drop: process.env.NODE_ENV === "production" ? ["console", "debugger"] : [],
  },
});
