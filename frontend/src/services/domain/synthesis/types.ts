// ── Synthesis Dialog Types, Constants & Utilities ──

import { FONT_PRESETS } from "./fontCatalog";

export { FONT_PRESETS };

export const DEFAULT_SUBTITLE_POSITION: { x: number; y: number } = {
  x: 0.5,
  y: 0.9,
};

// Subtitle style presets
export interface SubtitlePreset {
  label: string;
  translationKey?: string;
  fontName: string;
  fontSize: number;
  fontColor: string;
  bold: boolean;
  italic: boolean;
  outline: number;
  shadow: number;
  outlineColor: string;
  bgEnabled: boolean;
  bgColor: string;
  bgOpacity: number;
  bgPadding: number;
  isDefault?: boolean; // Built-in presets cannot be deleted
}

export const DEFAULT_PRESETS: SubtitlePreset[] = [
  {
    label: "classic-white",
    translationKey: "style.presets.classicWhite",
    fontName: "Arial",
    fontSize: 24,
    fontColor: "#FFFFFF",
    bold: false,
    italic: false,
    outline: 2,
    shadow: 0,
    outlineColor: "#000000",
    bgEnabled: false,
    bgColor: "#000000",
    bgOpacity: 0.5,
    bgPadding: 5,
    isDefault: true,
  },
  {
    label: "yellow-bold",
    translationKey: "style.presets.yellowBold",
    fontName: "Arial",
    fontSize: 24,
    fontColor: "#FFFF00",
    bold: true,
    italic: false,
    outline: 2,
    shadow: 1,
    outlineColor: "#000000",
    bgEnabled: false,
    bgColor: "#000000",
    bgOpacity: 0.5,
    bgPadding: 5,
    isDefault: true,
  },
  {
    label: "cinematic",
    translationKey: "style.presets.cinematic",
    fontName: "Microsoft YaHei",
    fontSize: 22,
    fontColor: "#FFFFFF",
    bold: false,
    italic: false,
    outline: 1,
    shadow: 2,
    outlineColor: "#1a1a2e",
    bgEnabled: false,
    bgColor: "#000000",
    bgOpacity: 0.5,
    bgPadding: 5,
    isDefault: true,
  },
  {
    label: "clean-shadow",
    translationKey: "style.presets.cleanShadow",
    fontName: "Microsoft YaHei",
    fontSize: 24,
    fontColor: "#FFFFFF",
    bold: false,
    italic: false,
    outline: 0,
    shadow: 3,
    outlineColor: "#000000",
    bgEnabled: false,
    bgColor: "#000000",
    bgOpacity: 0.5,
    bgPadding: 5,
    isDefault: true,
  },
  {
    label: "background-panel",
    translationKey: "style.presets.backgroundPanel",
    fontName: "Microsoft YaHei",
    fontSize: 22,
    fontColor: "#FFFFFF",
    bold: false,
    italic: false,
    outline: 0,
    shadow: 0,
    outlineColor: "#000000",
    bgEnabled: true,
    bgColor: "#000000",
    bgOpacity: 0.6,
    bgPadding: 5,
    isDefault: true,
  },
];

/** Convert #RRGGBB to ASS &H00BBGGRR format */
export function hexToAss(hex: string, alpha: string = "00"): string {
  const r = hex.slice(1, 3);
  const g = hex.slice(3, 5);
  const b = hex.slice(5, 7);
  return `&H${alpha}${b}${g}${r}`;
}
