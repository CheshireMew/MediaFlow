// ── Subtitle Style State + Persistence + Presets ──
import { useState, useEffect, useMemo, useRef } from "react";
import type { SubtitleSegment } from "../../../../types/task";
import {
  DEFAULT_PRESETS,
  DEFAULT_SUBTITLE_POSITION,
} from "../types";
import type { SubtitlePreset } from "../types";
import { detectFontAvailability } from "../fontUtils";
import { computeDefaultSubtitleFontSize } from "../textShaper";
import {
  updateStoredSynthesisExecutionPreferences,
  type SynthesisExecutionPreferences,
} from "../../../../services/persistence/synthesisExecutionPreferences";

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
  persistedPreferences: SynthesisExecutionPreferences,
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
  const lastManualFontSizeVideoKey = useRef<string | null>(null);

  const resolveVideoKey = (path: string | null) => path ?? "__unknown_video__";
  const setFontSize = (value: number) => {
    setFontSizeState(value);
    lastManualFontSizeVideoKey.current = resolveVideoKey(videoPath);
  };

  const currentSubtitle = useMemo(() => {
    const seg = regions.find(
      (r) => currentTime >= r.start && currentTime < r.end,
    );
    return seg ? seg.text : "";
  }, [currentTime, regions]);

  useEffect(() => {
    let cancelled = false;

    const availabilityCheck = detectFontAvailability(fontName);

    void availabilityCheck.then((available) => {
      if (!cancelled) {
        setFontAvailable(available);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [fontName]);

  const fontAvailabilityMessage = fontAvailable
    ? null
    : `字体 "${fontName}" 当前不可用，预览可能回退到替代字体。`;

  // --- Restore from localStorage ---
  useEffect(() => {
    if (!isOpen) {
      isInitialized.current = false;
      lastRecommendedVideoKey.current = null;
      lastManualFontSizeVideoKey.current = null;
      return;
    }

    isInitialized.current = false;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      try {
        const subtitleStyle = persistedPreferences.subtitleStyle;

        setCustomPresets(subtitleStyle.customPresets);
        lastRecommendedVideoKey.current = null;
        lastManualFontSizeVideoKey.current = null;
        setFontName(subtitleStyle.fontName);
        setIsBold(subtitleStyle.isBold);
        setIsItalic(subtitleStyle.isItalic);
        setOutlineSize(subtitleStyle.outlineSize);
        setShadowSize(subtitleStyle.shadowSize);
        setOutlineColor(subtitleStyle.outlineColor);
        setBgEnabled(subtitleStyle.bgEnabled);
        setBgColor(subtitleStyle.bgColor);
        setBgOpacity(subtitleStyle.bgOpacity);
        setBgPadding(subtitleStyle.bgPadding);
        setAlignment(subtitleStyle.alignment);
        setMultilineAlign(subtitleStyle.multilineAlign);
        setFontSizeState(subtitleStyle.fontSize);
        setFontColor(subtitleStyle.fontColor);
        setSubPos(subtitleStyle.subPos);
      } catch (e) {
        console.error("Failed to restore subtitle styles", e);
      }

      isInitialized.current = true;
      setPresetNameInput(null);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, persistedPreferences]);

  useEffect(() => {
    if (!isOpen) {
      lastRecommendedVideoKey.current = null;
      lastManualFontSizeVideoKey.current = null;
      return;
    }

    if (videoHeight <= 0) {
      return;
    }

    const currentVideoKey = resolveVideoKey(videoPath);
    const shouldRecommend =
      lastRecommendedVideoKey.current !== currentVideoKey ||
      lastRecommendedVideoKey.current === null;

    if (!shouldRecommend) {
      return;
    }

    if (lastManualFontSizeVideoKey.current === currentVideoKey) {
      lastRecommendedVideoKey.current = currentVideoKey;
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) {
        return;
      }
      setFontSizeState(computeDefaultSubtitleFontSize(videoHeight));
      lastRecommendedVideoKey.current = currentVideoKey;
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, videoHeight, videoPath]);

  // --- Save position ---
  useEffect(() => {
    if (!isInitialized.current) return;
    updateStoredSynthesisExecutionPreferences({
      subtitleStyle: { subPos },
    });
  }, [subPos]);

  // --- Save style settings ---
  useEffect(() => {
    if (!isInitialized.current) return;
    updateStoredSynthesisExecutionPreferences({
      subtitleStyle: {
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
      },
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
    setFontSize(preset.fontSize);
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
    updateStoredSynthesisExecutionPreferences({
      subtitleStyle: { customPresets: updated },
    });
    setPresetNameInput(null);
  };

  const deletePreset = (label: string) => {
    const updated = customPresets.filter((p) => p.label !== label);
    setCustomPresets(updated);
    updateStoredSynthesisExecutionPreferences({
      subtitleStyle: { customPresets: updated },
    });
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
