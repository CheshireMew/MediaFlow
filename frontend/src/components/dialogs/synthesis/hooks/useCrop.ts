import { useState } from "react";

export interface CropState {
  isEnabled: boolean;
  setIsEnabled: (v: boolean) => void;
  // Normalized coordinates (0.0 to 1.0)
  crop: { x: number; y: number; w: number; h: number };
  setCrop: (v: { x: number; y: number; w: number; h: number }) => void;
}

export function useCrop(isOpen: boolean): CropState {
  const [isEnabled, setIsEnabled] = useState(false);
  // Default to full screen (no crop) - though conceptually "no crop" means disable filter
  // Initial crop box: Center 50%
  const [crop, setCrop] = useState({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 });

  return {
    isEnabled,
    setIsEnabled,
    crop,
    setCrop,
  };
}
