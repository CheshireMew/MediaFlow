import { useEffect, useState } from "react";

const DEFAULT_CROP = { x: 0, y: 0, w: 1, h: 1 };

export interface CropState {
  isEnabled: boolean;
  setIsEnabled: (v: boolean) => void;
  // Normalized coordinates (0.0 to 1.0)
  crop: { x: number; y: number; w: number; h: number };
  setCrop: (v: { x: number; y: number; w: number; h: number }) => void;
}

export function useCrop(
  isOpen: boolean,
  videoPath?: string | null,
): CropState {
  const [isEnabled, setIsEnabled] = useState(false);
  const [crop, setCrop] = useState(DEFAULT_CROP);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const timer = setTimeout(() => {
      setIsEnabled(false);
      setCrop(DEFAULT_CROP);
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, videoPath]);

  return {
    isEnabled,
    setIsEnabled,
    crop,
    setCrop,
  };
}
