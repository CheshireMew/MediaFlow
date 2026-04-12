import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
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
