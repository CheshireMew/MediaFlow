// ── Subtitle Style State + Persistence + Presets ──
import { useState, useEffect, useRef } from "react";
import type { SubtitleSegment } from "../../../../types/task";
import { DEFAULT_PRESETS, loadCustomPresets } from "../types";
import type { SubtitlePreset } from "../types";

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
  // Computed
  currentSubtitle: string;
  // Init guard (shared with other hooks)
  isInitialized: React.MutableRefObject<boolean>;
}

export function useSubtitleStyle(
  isOpen: boolean,
  regions: SubtitleSegment[],
  currentTime: number,
): SubtitleStyleState {
  // --- State ---
  const [fontSize, setFontSize] = useState(24);
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
  const [customPresets, setCustomPresets] = useState<SubtitlePreset[]>([]);
  const [presetNameInput, setPresetNameInput] = useState<string | null>(null);
  const [subPos, setSubPos] = useState({ x: 0.5, y: 0.9 });
  const [currentSubtitle, setCurrentSubtitle] = useState("");

  const isInitialized = useRef(false);

  // --- Subtitle text sync ---
  useEffect(() => {
    const seg = regions.find(
      (r) => currentTime >= r.start && currentTime < r.end,
    );
    setCurrentSubtitle(seg ? seg.text : "");
  }, [currentTime, regions]);

  // --- Restore from localStorage ---
  useEffect(() => {
    if (!isOpen) return;

    // Load custom presets
    setCustomPresets(loadCustomPresets());

    // Restore subtitle style settings
    try {
      const savedFontName = localStorage.getItem("sub_fontName");
      const savedBold = localStorage.getItem("sub_bold");
      const savedItalic = localStorage.getItem("sub_italic");
      const savedOutline = localStorage.getItem("sub_outline");
      const savedShadow = localStorage.getItem("sub_shadow");
      const savedOutlineColor = localStorage.getItem("sub_outlineColor");
      const savedBgEnabled = localStorage.getItem("sub_bgEnabled");
      const savedBgColor = localStorage.getItem("sub_bgColor");
      const savedBgOpacity = localStorage.getItem("sub_bgOpacity");
      const savedBgPadding = localStorage.getItem("sub_bgPadding");
      const savedAlignment = localStorage.getItem("sub_alignment");
      const savedFontSize = localStorage.getItem("sub_fontSize");
      const savedFontColor = localStorage.getItem("sub_fontColor");
      const savedSubPos = localStorage.getItem("sub_pos");

      console.log("Restoring Subtitle Styles from LS:", {
        savedBgEnabled,
        savedBgOpacity,
        savedBgColor,
      });

      if (savedFontName) setFontName(savedFontName);
      if (savedBold) setIsBold(savedBold === "true");
      if (savedItalic) setIsItalic(savedItalic === "true");
      if (savedOutline) {
        const v = parseInt(savedOutline);
        if (!isNaN(v)) setOutlineSize(v);
      }
      if (savedShadow) {
        const v = parseInt(savedShadow);
        if (!isNaN(v)) setShadowSize(v);
      }
      if (savedOutlineColor) setOutlineColor(savedOutlineColor);
      if (savedBgEnabled) setBgEnabled(savedBgEnabled === "true");
      if (savedBgColor) setBgColor(savedBgColor);
      if (savedBgOpacity) {
        const val = parseFloat(savedBgOpacity);
        if (!isNaN(val)) setBgOpacity(val);
      }
      if (savedBgPadding) {
        const v = parseInt(savedBgPadding);
        if (!isNaN(v)) setBgPadding(v);
      }
      if (savedAlignment) setAlignment(parseInt(savedAlignment) || 2);
      if (savedFontSize) setFontSize(parseInt(savedFontSize) || 24);
      if (savedFontColor) setFontColor(savedFontColor);

      // Load saved position
      if (savedSubPos) {
        try {
          const pos = JSON.parse(savedSubPos);
          if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
            setSubPos(pos);
          }
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      console.error("Failed to restore subtitle styles", e);
    }

    // Mark as initialized AFTER loading settings
    isInitialized.current = true;
    // Reset preset name input on dialog open
    setPresetNameInput(null);
  }, [isOpen]);

  // --- Save position ---
  useEffect(() => {
    if (!isInitialized.current) return;
    localStorage.setItem("sub_pos", JSON.stringify(subPos));
  }, [subPos]);

  // --- Save style settings ---
  useEffect(() => {
    if (!isInitialized.current) return;
    localStorage.setItem("sub_fontName", fontName);
    localStorage.setItem("sub_bold", String(isBold));
    localStorage.setItem("sub_italic", String(isItalic));
    localStorage.setItem("sub_outline", String(outlineSize));
    localStorage.setItem("sub_shadow", String(shadowSize));
    localStorage.setItem("sub_outlineColor", outlineColor);
    localStorage.setItem("sub_bgEnabled", String(bgEnabled));
    localStorage.setItem("sub_bgColor", bgColor);
    localStorage.setItem("sub_bgOpacity", String(bgOpacity));
    localStorage.setItem("sub_bgPadding", String(bgPadding));
    localStorage.setItem("sub_alignment", String(alignment));
    localStorage.setItem("sub_fontSize", String(fontSize));
    localStorage.setItem("sub_fontColor", fontColor);
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
    localStorage.setItem("sub_customPresets", JSON.stringify(updated));
    setPresetNameInput(null);
  };

  const deletePreset = (label: string) => {
    const updated = customPresets.filter((p) => p.label !== label);
    setCustomPresets(updated);
    localStorage.setItem("sub_customPresets", JSON.stringify(updated));
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
    customPresets,
    presetNameInput,
    setPresetNameInput,
    confirmSavePreset,
    applyPreset,
    deletePreset,
    subPos,
    setSubPos,
    currentSubtitle,
    isInitialized,
  };
}
