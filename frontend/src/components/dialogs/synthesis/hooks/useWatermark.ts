// ── Watermark State + Upload + Load + Position Presets ──
import { useRef, useState, useEffect } from "react";
import {
  editorService,
  resolveDefaultWatermarkLayout,
  resolveWatermarkPosition,
  type WatermarkPositionPreset,
} from "../../../../services/domain";
import {
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
  isInitialized: React.MutableRefObject<boolean>,
  outputSize: { w: number; h: number },
  persistedPreferences: SynthesisExecutionPreferences,
): WatermarkState {
  const [watermarkPath, setWatermarkPath] = useState<string | null>(null);
  const [watermarkPreviewUrl, setWatermarkPreviewUrl] = useState<string | null>(
    null,
  );
  const [wmScale, setWmScale] = useState(0.2);
  const [wmOpacity, setWmOpacity] = useState(0.8);
  const [wmPos, setWmPos] = useState({ x: 0.5, y: 0.5 });
  const [watermarkSize, setWatermarkSize] = useState({ w: 0, h: 0 });
  const layoutInitializedKey = useRef<string | null>(null);
  const hasManualLayout = useRef(false);

  // --- Restore from shared settings ---
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      setWmOpacity(persistedPreferences.watermark.wmOpacity);
    }, 0);

    return () => clearTimeout(timer);
  }, [isOpen, persistedPreferences.watermark]);

  useEffect(() => {
    if (!isOpen) {
      layoutInitializedKey.current = null;
      hasManualLayout.current = false;
    }
  }, [isOpen]);

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

  // --- Persist scale/opacity/pos ---
  useEffect(() => {
    if (!isInitialized.current) return;
    updateStoredSynthesisExecutionPreferences({
      watermark: { wmScale },
    });
  }, [wmScale, isInitialized]);

  useEffect(() => {
    if (!isInitialized.current) return;
    updateStoredSynthesisExecutionPreferences({
      watermark: { wmOpacity },
    });
  }, [wmOpacity, isInitialized]);

  useEffect(() => {
    if (!isInitialized.current) return;
    updateStoredSynthesisExecutionPreferences({
      watermark: { wmPos },
    });
  }, [wmPos, isInitialized]);

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
    setWmPos(
      resolveWatermarkPosition({
        preset: pos,
        outputWidth: outputSize.w,
        outputHeight: outputSize.h,
        watermarkWidth: watermarkSize.w,
        watermarkHeight: watermarkSize.h,
        wmScale,
      }),
    );
  };

  const updateWmScale = (value: number) => {
    hasManualLayout.current = true;
    setWmScale(value);
  };

  const updateWmPos = (value: { x: number; y: number }) => {
    hasManualLayout.current = true;
    setWmPos(value);
  };

  return {
    watermarkPath,
    watermarkPreviewUrl,
    wmScale,
    wmOpacity,
    wmPos,
    watermarkSize,
    setWmScale: updateWmScale,
    setWmOpacity,
    setWmPos: updateWmPos,
    handleWatermarkSelect,
    applyWmPositionPreset,
  };
}
