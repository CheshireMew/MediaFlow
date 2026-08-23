import { getFontCatalogEntry } from "../../../services/domain";

const FALLBACK_STACK = "monospace";
const SAMPLE_TEXT = "MediaFlow \u5b57\u5e55\u9884\u89c8 0123456789 ABCDEFG abcdefg";
const bundledFontPromises = new Map<string, Promise<void>>();

function assetBasename(assetFile: string): string {
  return assetFile.split(/[\\/]/).pop() ?? assetFile;
}

function resolveBundledFontAssetUrl(assetFile: string) {
  const basename = encodeURIComponent(assetBasename(assetFile));
  if (import.meta.env.DEV) {
    return new URL(`/src/assets/fonts/${basename}`, window.location.origin).href;
  }
  if (window.location.protocol === "file:") {
    return new URL(`../../fonts/${basename}`, window.location.href).href;
  }
  return null;
}

function getCanvasContext(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  return canvas.getContext("2d");
}

function measureWidth(fontFamily: string): number {
  const ctx = getCanvasContext();
  if (!ctx) return 0;
  ctx.font = `32px "${fontFamily}", ${FALLBACK_STACK}`;
  return ctx.measureText(SAMPLE_TEXT).width;
}

async function loadBundledFont(fontFamily: string): Promise<void> {
  const entry = getFontCatalogEntry(fontFamily);
  if (entry?.source !== "bundled" || !entry.assetFiles?.length) {
    return;
  }

  await Promise.all(
    entry.assetFiles.map(async (assetFile) => {
      const url = resolveBundledFontAssetUrl(assetFile);
      if (!url) {
        return;
      }

      const fontFace = new FontFace(fontFamily, `url(${url})`);
      await fontFace.load();
      document.fonts.add(fontFace);
    }),
  );
}

function ensureBundledFontLoaded(fontFamily: string): Promise<void> {
  const entry = getFontCatalogEntry(fontFamily);
  if (entry?.source !== "bundled") {
    return Promise.resolve();
  }

  const existing = bundledFontPromises.get(fontFamily);
  if (existing) {
    return existing;
  }

  const promise = loadBundledFont(fontFamily).catch((error: unknown) => {
    bundledFontPromises.delete(fontFamily);
    throw error;
  });
  bundledFontPromises.set(fontFamily, promise);
  return promise;
}

export function isFontAvailable(fontFamily: string): boolean {
  if (typeof document === "undefined") return true;

  const normalized = fontFamily.trim();
  if (!normalized) return false;

  if (document.fonts?.check?.(`16px "${fontFamily}"`)) {
    return true;
  }

  const fallbackWidth = measureWidth(FALLBACK_STACK);
  const fontWidth = measureWidth(fontFamily);
  return Math.abs(fontWidth - fallbackWidth) > 0.5;
}

export async function detectFontAvailability(fontFamily: string): Promise<boolean> {
  if (typeof document === "undefined") return true;

  const normalized = fontFamily.trim();
  if (!normalized) return false;

  try {
    await ensureBundledFontLoaded(normalized);
  } catch {
    return false;
  }

  if (isFontAvailable(normalized)) {
    return true;
  }

  if (!document.fonts?.ready) {
    return false;
  }

  try {
    await document.fonts.ready;
  } catch {
    return false;
  }

  return isFontAvailable(normalized);
}
