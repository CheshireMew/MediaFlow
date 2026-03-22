// ── Subtitle Style State + Persistence + Presets ──
import { useState, useEffect, useMemo, useRef } from "react";
import type { SubtitleSegment } from "../../../../types/task";
import {
  DEFAULT_PRESETS,
  DEFAULT_SUBTITLE_POSITION,
} from "../types";
import type { SubtitlePreset } from "../types";
import { isFontAvailable } from "../fontUtils";
import { computeDefaultSubtitleFontSize } from "../textShaper";
import {
  restoreSubtitleStyleSnapshot,
  updateSubtitleStyleSnapshot,
} from "../subtitleStylePersistence";

export interface SubtitleStyleState {
  // Style values
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
  multilineAlign: "bottom" | "center" | "top";
  effectiveFontName: string;
  isFontAvailable: boolean;
  // Setters
  setFontSize: (v: number) => void;
  setFontColor: (v: string) => void;
  setFontName: (v: string) => void;
  setIsBold: (v: boolean) => void;
  setIsItalic: (v: boolean) => void;
  setOutlineSize: (v: number) => void;
  setShadowSize: (v: number) => void;
  setOutlineColor: (v: string) => void;
  setBgEnabled: (v: boolean) => void;
  setBgColor: (v: string) => void;
  setBgOpacity: (v: number) => void;
  setBgPadding: (v: number) => void;
  setAlignment: (v: number) => void;
  setMultilineAlign: (v: "bottom" | "center" | "top") => void;
  // Presets
  customPresets: SubtitlePreset[];
  presetNameInput: string | null;
  setPresetNameInput: (v: string | null) => void;
  confirmSavePreset: () => void;
  applyPreset: (preset: SubtitlePreset) => void;
  deletePreset: (label: string) => void;
  // Position
  subPos: { x: number; y: number };
  setSubPos: (v: { x: number; y: number }) => void;
  resetSubPos: () => void;
  // Computed
  currentSubtitle: string;
  fontAvailabilityMessage: string | null;
  // Init guard (shared with other hooks)
  isInitialized: React.MutableRefObject<boolean>;
}

export function useSubtitleStyle(
  isOpen: boolean,
  regions: SubtitleSegment[],
  currentTime: number,
  videoHeight: number,
  videoPath: string | null,
): SubtitleStyleState {
  // --- State ---
  const [fontSize, setFontSizeState] = useState(24);
  const [fontColor, setFontColor] = useState("#FFFFFF");
  const [fontName, setFontName] = useState("Arial");
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [outlineSize, setOutlineSize] = useState(2);
  const [shadowSize, setShadowSize] = useState(0);
  const [outlineColor, setOutlineColor] = useState("#000000");
  const [bgEnabled, setBgEnabled] = useState(false);
  const [bgColor, setBgColor] = useState("#000000");
  const [bgOpacity, setBgOpacity] = useState(0.5);
  const [bgPadding, setBgPadding] = useState(5);
  const [alignment, setAlignment] = useState(2);
  const [multilineAlign, setMultilineAlign] = useState<
    "bottom" | "center" | "top"
  >("center");
  const [fontAvailable, setFontAvailable] = useState(true);
  const [customPresets, setCustomPresets] = useState<SubtitlePreset[]>([]);
  const [presetNameInput, setPresetNameInput] = useState<string | null>(null);
  const [subPos, setSubPos] = useState({ ...DEFAULT_SUBTITLE_POSITION });

  const isInitialized = useRef(false);
  const lastRecommendedVideoKey = useRef<string | null>(null);

  const setFontSize = (value: number) => {
    setFontSizeState(value);
  };

  const currentSubtitle = useMemo(() => {
    const seg = regions.find(
      (r) => currentTime >= r.start && currentTime < r.end,
    );
    return seg ? seg.text : "";
  }, [currentTime, regions]);

  useEffect(() => {
    setFontAvailable(isFontAvailable(fontName));
  }, [fontName]);

  const effectiveFontName = fontAvailable ? fontName : "Arial";
  const fontAvailabilityMessage = fontAvailable
    ? null
    : `字体 "${fontName}" 当前不可用，预览和导出将回退到 Arial。`;

  // --- Restore from localStorage ---
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      try {
        const snapshot = restoreSubtitleStyleSnapshot();

        setCustomPresets(snapshot.customPresets);
        lastRecommendedVideoKey.current = null;
        setFontName(snapshot.fontName);
        setIsBold(snapshot.isBold);
        setIsItalic(snapshot.isItalic);
        setOutlineSize(snapshot.outlineSize);
        setShadowSize(snapshot.shadowSize);
        setOutlineColor(snapshot.outlineColor);
        setBgEnabled(snapshot.bgEnabled);
        setBgColor(snapshot.bgColor);
        setBgOpacity(snapshot.bgOpacity);
        setBgPadding(snapshot.bgPadding);
        setAlignment(snapshot.alignment);
        setMultilineAlign(snapshot.multilineAlign);
        setFontSizeState(snapshot.fontSize);
        setFontColor(snapshot.fontColor);
        setSubPos(snapshot.subPos);
      } catch (e) {
        console.error("Failed to restore subtitle styles", e);
      }

      isInitialized.current = true;
      setPresetNameInput(null);
    }, 0);

    return () => clearTimeout(timer);
  }, [isOpen, videoHeight]);

  useEffect(() => {
    if (!isOpen) {
      lastRecommendedVideoKey.current = null;
      return;
    }

    if (videoHeight <= 0) {
      return;
    }

    const currentVideoKey = videoPath ?? "__unknown_video__";
    const shouldRecommend =
      lastRecommendedVideoKey.current !== currentVideoKey ||
      lastRecommendedVideoKey.current === null;

    if (!shouldRecommend) {
      return;
    }

    setFontSizeState(computeDefaultSubtitleFontSize(videoHeight));
    lastRecommendedVideoKey.current = currentVideoKey;
  }, [isOpen, videoHeight, videoPath]);

  // --- Save position ---
  useEffect(() => {
    if (!isInitialized.current) return;
    updateSubtitleStyleSnapshot({ subPos });
  }, [subPos]);

  // --- Save style settings ---
  useEffect(() => {
    if (!isInitialized.current) return;
    updateSubtitleStyleSnapshot({
      fontName,
      isBold,
      isItalic,
      outlineSize,
      shadowSize,
      outlineColor,
      bgEnabled,
      bgColor,
      bgOpacity,
      bgPadding,
      alignment,
      multilineAlign,
      fontSize,
      fontColor,
    });
  }, [
    fontName,
    isBold,
    isItalic,
    outlineSize,
    shadowSize,
    outlineColor,
    bgEnabled,
    bgColor,
    bgOpacity,
    bgPadding,
    alignment,
    multilineAlign,
    fontSize,
    fontColor,
  ]);

  // --- Preset actions ---
  const applyPreset = (preset: SubtitlePreset) => {
    setFontName(preset.fontName);
    setFontSizeState(preset.fontSize);
    setFontColor(preset.fontColor);
    setIsBold(preset.bold);
    setIsItalic(preset.italic);
    setOutlineSize(preset.outline);
    setShadowSize(preset.shadow);
    setOutlineColor(preset.outlineColor);
    setBgEnabled(preset.bgEnabled);
    setBgColor(preset.bgColor);
    setBgOpacity(preset.bgOpacity);
    setBgPadding(preset.bgPadding ?? 5);
  };

  const confirmSavePreset = () => {
    if (!presetNameInput) return;
    const trimmed = presetNameInput.trim();
    if (!trimmed) return;
    const allLabels = [...DEFAULT_PRESETS, ...customPresets].map(
      (p) => p.label,
    );
    if (allLabels.includes(trimmed)) return;
    const newPreset: SubtitlePreset = {
      label: trimmed,
      fontName,
      fontSize,
      fontColor,
      bold: isBold,
      italic: isItalic,
      outline: outlineSize,
      shadow: shadowSize,
      outlineColor,
      bgEnabled,
      bgColor,
      bgOpacity,
      bgPadding,
    };
    const updated = [...customPresets, newPreset];
    setCustomPresets(updated);
    updateSubtitleStyleSnapshot({ customPresets: updated });
    setPresetNameInput(null);
  };

  const deletePreset = (label: string) => {
    const updated = customPresets.filter((p) => p.label !== label);
    setCustomPresets(updated);
    updateSubtitleStyleSnapshot({ customPresets: updated });
  };

  return {
    fontSize,
    fontColor,
    fontName,
    isBold,
    isItalic,
    outlineSize,
    shadowSize,
    outlineColor,
    bgEnabled,
    bgColor,
    bgOpacity,
    bgPadding,
    alignment,
    multilineAlign,
    effectiveFontName,
    isFontAvailable: fontAvailable,
    setFontSize,
    setFontColor,
    setFontName,
    setIsBold,
    setIsItalic,
    setOutlineSize,
    setShadowSize,
    setOutlineColor,
    setBgEnabled,
    setBgColor,
    setBgOpacity,
    setBgPadding,
    setAlignment,
    setMultilineAlign,
    customPresets,
    presetNameInput,
    setPresetNameInput,
    confirmSavePreset,
    applyPreset,
    deletePreset,
    subPos,
    setSubPos,
    resetSubPos: () => setSubPos({ ...DEFAULT_SUBTITLE_POSITION }),
    currentSubtitle,
    fontAvailabilityMessage,
    isInitialized,
  };
}
