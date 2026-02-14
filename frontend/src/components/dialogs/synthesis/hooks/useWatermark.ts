// ── Watermark State + Upload + Load + Position Presets ──
import { useState, useEffect } from "react";
import { apiClient } from "../../../../api/client";

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
  applyWmPositionPreset: (
    pos: "TL" | "TC" | "TR" | "BL" | "BC" | "BR" | "C" | "LC" | "RC",
  ) => void;
}

export function useWatermark(
  isOpen: boolean,
  isInitialized: React.MutableRefObject<boolean>,
  videoSize: { w: number; h: number },
): WatermarkState {
  const [watermarkPath, setWatermarkPath] = useState<string | null>(null);
  const [watermarkPreviewUrl, setWatermarkPreviewUrl] = useState<string | null>(
    null,
  );
  const [wmScale, setWmScale] = useState(0.2);
  const [wmOpacity, setWmOpacity] = useState(0.8);
  const [wmPos, setWmPos] = useState({ x: 0.5, y: 0.5 });
  const [watermarkSize, setWatermarkSize] = useState({ w: 0, h: 0 });

  // --- Restore from localStorage ---
  useEffect(() => {
    if (!isOpen) return;

    const savedScale = localStorage.getItem("wm_scale");
    const savedOpacity = localStorage.getItem("wm_opacity");
    const savedPos = localStorage.getItem("wm_pos");

    if (savedScale) setWmScale(parseFloat(savedScale));
    if (savedOpacity) setWmOpacity(parseFloat(savedOpacity));
    if (savedPos) {
      try {
        setWmPos(JSON.parse(savedPos));
      } catch {
        /* ignore */
      }
    }
  }, [isOpen]);

  // --- Load persisted watermark image ---
  useEffect(() => {
    if (!isOpen) return;
    if (watermarkPreviewUrl) return; // Already loaded

    apiClient
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

  // --- Persist scale/opacity/pos ---
  useEffect(() => {
    if (!isInitialized.current) return;
    localStorage.setItem("wm_scale", wmScale.toString());
  }, [wmScale]);

  useEffect(() => {
    if (!isInitialized.current) return;
    localStorage.setItem("wm_opacity", wmOpacity.toString());
  }, [wmOpacity]);

  useEffect(() => {
    if (!isInitialized.current) return;
    localStorage.setItem("wm_pos", JSON.stringify(wmPos));
  }, [wmPos]);

  // --- Handle watermark upload ---
  const handleWatermarkSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];

      try {
        // Upload to backend for processing (Trimming transparency & Conversion)
        const res = await apiClient.uploadWatermark(file);

        // Set Preview & Path
        setWatermarkPreviewUrl(res.data_url);
        setWatermarkPath(res.png_path);

        // Set Dimensions from Backend (Trimmed)
        const w = res.width;
        const h = res.height;
        setWatermarkSize({ w, h });

        // --- Smart Default Position (Top-Right) ---
        const vidW = videoSize.w || 1920;
        const vidH = videoSize.h || 1080;

        // Target Scale: 20% width
        const scale = 0.2;
        setWmScale(scale);

        // Calculate Target Dimensions in Pixels
        const targetW = vidW * scale;
        const targetH = targetW * (h / w);

        // Normalized Dimensions (0-1)
        const normW = targetW / vidW;
        const normH = targetH / vidH;

        const margin = 0.05;

        // Top Right Position (Center coordinates)
        const x = 1 - margin - normW / 2;
        const y = margin + normH / 2;

        setWmPos({ x, y });
      } catch (err) {
        console.error("[Synthesis] Watermark Upload Failed", err);
        alert("Failed to process watermark. Check console.");
      }
    }
  };

  // --- Position presets (9-grid) ---
  // Dimension-aware: accounts for watermark size relative to video
  // so that edge-aligned presets don't clip outside the frame.
  const applyWmPositionPreset = (
    pos: "TL" | "TC" | "TR" | "BL" | "BC" | "BR" | "C" | "LC" | "RC",
  ) => {
    if (!videoSize.w || !watermarkSize.w) {
      // Fallback for missing metadata
      const map: Record<string, { x: number; y: number }> = {
        TL: { x: 0.1, y: 0.1 },
        TC: { x: 0.5, y: 0.1 },
        TR: { x: 0.9, y: 0.1 },
        LC: { x: 0.1, y: 0.5 },
        C: { x: 0.5, y: 0.5 },
        RC: { x: 0.9, y: 0.5 },
        BL: { x: 0.1, y: 0.9 },
        BC: { x: 0.5, y: 0.9 },
        BR: { x: 0.9, y: 0.9 },
      };
      if (map[pos]) setWmPos(map[pos]);
      return;
    }

    // 1. Calculate Watermark Target Dimensions (in pixels)
    // wmScale is "Target Width as % of Video Width"
    const targetW = videoSize.w * wmScale;
    const targetH = targetW * (watermarkSize.h / watermarkSize.w);

    // 2. Normalized Dimensions
    const normW = targetW / videoSize.w;
    const normH = targetH / videoSize.h;

    // 3. Margin
    const marginX = 0.03;
    const marginY = 0.05;

    let x = 0.5;
    let y = 0.5;

    // Note: wmPos is the CENTER of the watermark

    // Horizontal
    if (pos.includes("L")) x = marginX + normW / 2;
    else if (pos.includes("R")) x = 1 - marginX - normW / 2;
    else x = 0.5;

    // Vertical
    if (pos.includes("T")) y = marginY + normH / 2;
    else if (pos.includes("B")) y = 1 - marginY - normH / 2;
    else y = 0.5;

    setWmPos({ x, y });
  };

  return {
    watermarkPath,
    watermarkPreviewUrl,
    wmScale,
    wmOpacity,
    wmPos,
    watermarkSize,
    setWmScale,
    setWmOpacity,
    setWmPos,
    handleWatermarkSelect,
    applyWmPositionPreset,
  };
}
