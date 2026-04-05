import rawFontCatalog from "../../../shared/fontCatalog.json";
import lxgwWenKaiRegularUrl from "../../../assets/fonts/LXGWWenKai-Regular.ttf";

export type FontCatalogSource = "system" | "bundled";

export interface FontCatalogEntry {
  family: string;
  label: string;
  source: FontCatalogSource;
  assetFiles?: string[];
}

const fontCatalog = rawFontCatalog as FontCatalogEntry[];
const bundledFontBrowserUrls: Record<string, string> = {
  "LXGW WenKai": lxgwWenKaiRegularUrl,
};

export const FONT_PRESETS = fontCatalog.map((font) => ({
  value: font.family,
  label: font.label,
}));

export function getFontCatalogEntry(fontFamily: string): FontCatalogEntry | null {
  return fontCatalog.find((font) => font.family === fontFamily) ?? null;
}

export function isBundledFont(fontFamily: string): boolean {
  return getFontCatalogEntry(fontFamily)?.source === "bundled";
}

export function getBundledFontBrowserUrl(fontFamily: string): string | null {
  return bundledFontBrowserUrls[fontFamily] ?? null;
}
