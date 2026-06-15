// ── Watermark State + Upload + Load + Position Presets ──
import { useRef, useState, useEffect } from "react";
import {
  editorService,
  resolveDefaultWatermarkLayout,
  resolveWatermarkPosition,
  type WatermarkPositionPreset,
} from "../../../../services/domain";
import {
  DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES,
  updateStoredSynthesisExecutionPreferences,
  type SynthesisExecutionPreferences,
} from "../../../../services/persistence/synthesisExecutionPreferences";

export interface WatermarkState {
  watermarkPath: string | null;
  watermarkPreviewUrl: string | null;
  wmScale: number;
  wmOpacity: number;
  wmPos: { x: number; y: number };
  watermarkSize: { w: number; h: number };
  setWmScale: (v: number) => void;
  setWmOpacity: (v: number) => void;
  setWmPos: (v: { x: number; y: number }) => void;
  handleWatermarkSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  applyWmPositionPreset: (pos: WatermarkPositionPreset) => void;
}

export function useWatermark(
  isOpen: boolean,
  outputSize: { w: number; h: number },
  persistedPreferences: SynthesisExecutionPreferences,
): WatermarkState {
  const [watermarkPath, setWatermarkPath] = useState<string | null>(null);
  const [watermarkPreviewUrl, setWatermarkPreviewUrl] = useState<string | null>(
    null,
  );
  const [wmScale, setWmScale] = useState(() => persistedPreferences.watermark.wmScale);
  const [wmOpacity, setWmOpacity] = useState(() => persistedPreferences.watermark.wmOpacity);
  const [wmPos, setWmPos] = useState(() => persistedPreferences.watermark.wmPos);
  const [watermarkSize, setWatermarkSize] = useState({ w: 0, h: 0 });
  const layoutInitializedKey = useRef<string | null>(null);
  const hasManualLayout = useRef(false);

  // --- Restore from shared settings ---
  useEffect(() => {
    if (!isOpen) {
      layoutInitializedKey.current = null;
      hasManualLayout.current = false;
      return;
    }

    const timer = setTimeout(() => {
      const nextWatermark = persistedPreferences.watermark;
      layoutInitializedKey.current = null;
      hasManualLayout.current = nextWatermark.hasCustomLayout;
      setWmOpacity(nextWatermark.wmOpacity);
      if (nextWatermark.hasCustomLayout) {
        setWmScale(nextWatermark.wmScale);
        setWmPos(nextWatermark.wmPos);
      } else {
        setWmScale(DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.watermark.wmScale);
        setWmPos(DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.watermark.wmPos);
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [isOpen, persistedPreferences.watermark]);

  // --- Load persisted watermark image ---
  useEffect(() => {
    if (!isOpen) return;
    if (watermarkPreviewUrl) return; // Already loaded

    editorService
      .getLatestWatermark()
      .then((res) => {
        if (res && res.data_url) {
          setWatermarkPreviewUrl(res.data_url);
          setWatermarkPath(res.png_path);
          setWatermarkSize({ w: res.width, h: res.height });
        }
      })
      .catch(() => {
        /* ignore */
      });
  }, [isOpen, watermarkPreviewUrl]);

  useEffect(() => {
    if (!isOpen || hasManualLayout.current) {
      return;
    }
    if (
      outputSize.w <= 0 ||
      outputSize.h <= 0 ||
      watermarkSize.w <= 0 ||
      watermarkSize.h <= 0
    ) {
      return;
    }

    const nextKey = [
      outputSize.w,
      outputSize.h,
      watermarkSize.w,
      watermarkSize.h,
      watermarkPath ?? "__watermark__",
    ].join(":");
    if (layoutInitializedKey.current === nextKey) {
      return;
    }

    const layout = resolveDefaultWatermarkLayout({
      outputWidth: outputSize.w,
      outputHeight: outputSize.h,
      watermarkWidth: watermarkSize.w,
      watermarkHeight: watermarkSize.h,
    });
    setWmScale(layout.wmScale);
    setWmPos(layout.wmPos);
    layoutInitializedKey.current = nextKey;
  }, [
    isOpen,
    outputSize.h,
    outputSize.w,
    watermarkPath,
    watermarkSize.h,
    watermarkSize.w,
  ]);

  // --- Handle watermark upload ---
  const handleWatermarkSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];

      try {
        // Upload to backend for processing (Trimming transparency & Conversion)
        const res = await editorService.uploadWatermark(file);

        // Set Preview & Path
        setWatermarkPreviewUrl(res.data_url);
        setWatermarkPath(res.png_path);

        // Set Dimensions from Backend (Trimmed)
        const w = res.width;
        const h = res.height;
        setWatermarkSize({ w, h });

        hasManualLayout.current = false;
        layoutInitializedKey.current = null;
      } catch (err) {
        console.error("[Synthesis] Watermark Upload Failed", err);
        alert("Failed to process watermark. Check console.");
      }
    }
  };

  // --- Position presets (9-grid) ---
  // Dimension-aware: accounts for watermark size relative to video
  // so that edge-aligned presets don't clip outside the frame.
  const applyWmPositionPreset = (pos: WatermarkPositionPreset) => {
    hasManualLayout.current = true;
    const nextPos = resolveWatermarkPosition({
      preset: pos,
      outputWidth: outputSize.w,
      outputHeight: outputSize.h,
      watermarkWidth: watermarkSize.w,
      watermarkHeight: watermarkSize.h,
      wmScale,
    });
    setWmPos(nextPos);
    updateStoredSynthesisExecutionPreferences({
      watermark: {
        wmPos: nextPos,
        hasCustomLayout: true,
      },
    });
  };

  const updateWmScale = (value: number) => {
    hasManualLayout.current = true;
    setWmScale(value);
    updateStoredSynthesisExecutionPreferences({
      watermark: {
        wmScale: value,
        hasCustomLayout: true,
      },
    });
  };

  const updateWmOpacity = (value: number) => {
    setWmOpacity(value);
    updateStoredSynthesisExecutionPreferences({
      watermark: { wmOpacity: value },
    });
  };

  const updateWmPos = (value: { x: number; y: number }) => {
    hasManualLayout.current = true;
    setWmPos(value);
    updateStoredSynthesisExecutionPreferences({
      watermark: {
        wmPos: value,
        hasCustomLayout: true,
      },
    });
  };

  return {
    watermarkPath,
    watermarkPreviewUrl,
    wmScale,
    wmOpacity,
    wmPos,
    watermarkSize,
    setWmScale: updateWmScale,
    setWmOpacity: updateWmOpacity,
    setWmPos: updateWmPos,
    handleWatermarkSelect,
    applyWmPositionPreset,
  };
}
