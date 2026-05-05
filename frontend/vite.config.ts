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
        '**/build-desktop-worker/**',
        '**/dist-desktop-worker/**',
        '**/dist/**',
        '**/node_modules/**',
      ],
    },
  },
  optimizeDeps: {
    include: ["react-window", "react-virtualized-auto-sizer"],
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
