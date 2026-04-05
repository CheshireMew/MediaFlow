export type FontCatalogSource = "system" | "bundled";

export interface FontCatalogEntry {
  family: string;
  label: string;
  source: FontCatalogSource;
  load?: () => Promise<void>;
}

const fontCatalog: FontCatalogEntry[] = [
  { family: "Arial", label: "Arial", source: "system" },
  { family: "Microsoft YaHei", label: "微软雅黑", source: "system" },
  { family: "SimHei", label: "黑体", source: "system" },
  { family: "SimSun", label: "宋体", source: "system" },
  { family: "KaiTi", label: "楷体", source: "system" },
  {
    family: "Noto Sans SC",
    label: "Noto Sans SC",
    source: "bundled",
    load: async () => {
      await Promise.all([
        import("@fontsource/noto-sans-sc/chinese-simplified-400.css"),
        import("@fontsource/noto-sans-sc/chinese-simplified-700.css"),
      ]);
    },
  },
  {
    family: "LXGW WenKai",
    label: "霞鹜文楷",
    source: "bundled",
    load: async () => {
      await Promise.all([
        import("lxgw-wenkai-webfont/lxgwwenkai-regular.css"),
        import("lxgw-wenkai-webfont/lxgwwenkai-bold.css"),
      ]);
    },
  },
];
const bundledFontLoads = new Map<string, Promise<boolean>>();

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

export async function loadBundledFontStyles(fontFamily: string): Promise<boolean> {
  const entry = getFontCatalogEntry(fontFamily);
  if (!entry?.load) {
    return false;
  }

  const cached = bundledFontLoads.get(fontFamily);
  if (cached) {
    return cached;
  }

  const loader = entry.load()
    .then(() => true)
    .catch(() => false);

  bundledFontLoads.set(fontFamily, loader);
  return loader;
}
