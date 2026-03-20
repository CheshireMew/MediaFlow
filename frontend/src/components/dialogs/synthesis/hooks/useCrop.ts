import { useState } from "react";

export interface CropState {
  isEnabled: boolean;
  setIsEnabled: (v: boolean) => void;
  // Normalized coordinates (0.0 to 1.0)
  crop: { x: number; y: number; w: number; h: number };
  setCrop: (v: { x: number; y: number; w: number; h: number }) => void;
}

export function useCrop(): CropState {
  const [isEnabled, setIsEnabled] = useState(false);
  // Start from full frame so enabling crop does not unexpectedly cut the video.
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 1, h: 1 });

  return {
    isEnabled,
    setIsEnabled,
    crop,
    setCrop,
  };
}
