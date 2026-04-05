import { isBundledFont, loadBundledFontStyles } from "./fontCatalog";

const FALLBACK_STACK = "monospace";
const SAMPLE_TEXT = "MediaFlow 字幕预览 0123456789 ABCDEFG abcdefg ，。！？（）【】";
const bundledFontLoads = new Map<string, Promise<boolean>>();

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

export function isFontAvailable(fontFamily: string): boolean {
  if (typeof document === "undefined") return true;

  const normalized = fontFamily.trim().toLowerCase();
  if (!normalized) return false;

  if (document.fonts?.check?.(`16px "${fontFamily}"`)) {
    return true;
  }

  const fallbackWidth = measureWidth(FALLBACK_STACK);
  const fontWidth = measureWidth(fontFamily);
  return Math.abs(fontWidth - fallbackWidth) > 0.5;
}

async function ensureBundledFont(fontFamily: string): Promise<boolean> {
  const normalized = fontFamily.trim();
  if (typeof document === "undefined") {
    return false;
  }

  if (document.fonts?.check?.(`16px "${normalized}"`)) {
    return true;
  }

  const cached = bundledFontLoads.get(normalized);
  if (cached) {
    return cached;
  }

  const loader = (async () => {
    try {
      const loaded = await loadBundledFontStyles(normalized);
      if (!loaded) {
        return false;
      }
      await document.fonts.load(`16px "${normalized}"`, SAMPLE_TEXT);
      await document.fonts.ready;
      return isFontAvailable(normalized);
    } catch {
      return false;
    }
  })();

  bundledFontLoads.set(normalized, loader);
  return loader;
}

export async function detectFontAvailability(fontFamily: string): Promise<boolean> {
  if (typeof document === "undefined") return true;

  const normalized = fontFamily.trim();
  if (!normalized) return false;

  if (isFontAvailable(normalized)) {
    return true;
  }

  if (!isBundledFont(normalized) || !document.fonts?.load) {
    return false;
  }
  return ensureBundledFont(normalized);
}
