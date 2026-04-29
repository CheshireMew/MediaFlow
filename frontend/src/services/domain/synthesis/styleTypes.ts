import type { SubtitlePreset } from "./types";

export type SubtitleMultilineAlign = "bottom" | "center" | "top";

export type SubtitleStyleValues = {
  fontSize: number;
  fontColor: string;
  fontName: string;
  isBold: boolean;
  isItalic: boolean;
  outlineSize: number;
  shadowSize: number;
  outlineColor: string;
  bgEnabled: boolean;
  bgColor: string;
  bgOpacity: number;
  bgPadding: number;
  alignment: number;
  multilineAlign: SubtitleMultilineAlign;
};

export type PersistedSubtitleStyleValues = SubtitleStyleValues & {
  subPos: { x: number; y: number };
  customPresets: SubtitlePreset[];
};
