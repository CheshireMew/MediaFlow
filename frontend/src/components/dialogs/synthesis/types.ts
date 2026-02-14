// ── Synthesis Dialog Types, Constants & Utilities ──

// Font presets available for subtitle rendering
export const FONT_PRESETS = [
  { value: "Arial", label: "Arial" },
  { value: "Microsoft YaHei", label: "微软雅黑" },
  { value: "SimHei", label: "黑体" },
  { value: "SimSun", label: "宋体" },
  { value: "KaiTi", label: "楷体" },
  { value: "Noto Sans SC", label: "Noto Sans SC" },
  { value: "LXGW WenKai", label: "霞鹜文楷" },
];

// Subtitle style presets
export interface SubtitlePreset {
  label: string;
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
    label: "经典白字",
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
    label: "黄色字幕",
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
    label: "电影风",
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
    label: "纯净阴影",
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
    label: "底板模式",
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

/** Load user custom presets from localStorage */
export function loadCustomPresets(): SubtitlePreset[] {
  try {
    const raw = localStorage.getItem("sub_customPresets");
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore parse errors */
  }
  return [];
}

/** Convert #RRGGBB to ASS &H00BBGGRR format */
export function hexToAss(hex: string, alpha: string = "00"): string {
  const r = hex.slice(1, 3);
  const g = hex.slice(3, 5);
  const b = hex.slice(5, 7);
  return `&H${alpha}${b}${g}${r}`;
}
