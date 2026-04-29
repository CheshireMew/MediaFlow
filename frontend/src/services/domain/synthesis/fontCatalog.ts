import fontCatalogJson from "../../../shared/fontCatalog.json";

export type FontCatalogSource = "system" | "bundled";

export interface FontCatalogEntry {
  family: string;
  label: string;
  source: FontCatalogSource;
  assetFiles?: string[];
}

const fontCatalog: FontCatalogEntry[] = fontCatalogJson.map((entry) => ({
  family: entry.family,
  label: entry.label,
  source: entry.source as FontCatalogSource,
  assetFiles: entry.assetFiles,
}));

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
