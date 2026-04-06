const FALLBACK_STACK = "monospace";
const SAMPLE_TEXT = "MediaFlow 字幕预览 0123456789 ABCDEFG abcdefg ，。！？（）【】";

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
