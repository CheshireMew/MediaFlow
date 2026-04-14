import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";

import { context } from "esbuild";

const watchMode = process.argv.includes("--watch");
const projectRoot = process.cwd();
const readyFile = path.join(projectRoot, "dist-electron", ".dev-build-ready");

async function markBuildReady() {
  await mkdir(path.dirname(readyFile), { recursive: true });
  await writeFile(readyFile, `${Date.now()}\n`, "utf-8");
}

async function clearBuildReady() {
  await rm(readyFile, { force: true });
}

const buildContext = await context({
  entryPoints: ["electron/main.ts", "electron/preload.ts"],
  outdir: "dist-electron/frontend/electron",
  outbase: ".",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: true,
  external: ["electron"],
  absWorkingDir: projectRoot,
  logLevel: "silent",
  plugins: [
    {
      name: "mediaflow-dev-ready",
      setup(build) {
        build.onStart(async () => {
          await clearBuildReady();
        });
        build.onEnd(async (result) => {
          if (result.errors.length > 0) {
            for (const error of result.errors) {
              console.error("[electron-dev-build]", error.text);
            }
            return;
          }

          await markBuildReady();
        });
      },
    },
  ],
});

async function runBuild() {
  const startedAt = performance.now();
  const result = await buildContext.rebuild();
  const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;

  if (result.errors.length > 0) {
    process.exitCode = 1;
    return;
  }

  console.log(`[electron-dev-build] ready in ${durationMs} ms`);
}

await runBuild();

if (watchMode) {
  await buildContext.watch();
  console.log("[electron-dev-build] watching for changes...");
} else {
  await buildContext.dispose();
}
