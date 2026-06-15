import { useEffect, useRef, useState } from "react";
import {
  updateStoredSynthesisExecutionPreferences,
  type SynthesisExecutionPreferences,
} from "../../../../services/persistence/synthesisExecutionPreferences";

export interface CropState {
  isEnabled: boolean;
  setIsEnabled: (v: boolean) => void;
  // Normalized coordinates (0.0 to 1.0)
  crop: { x: number; y: number; w: number; h: number };
  setCrop: (v: { x: number; y: number; w: number; h: number }) => void;
}

export function useCrop(
  isOpen: boolean,
  persistedPreferences: SynthesisExecutionPreferences,
): CropState {
  const [isEnabled, setIsEnabled] = useState(() => persistedPreferences.crop.isEnabled);
  const [crop, setCrop] = useState(() => persistedPreferences.crop.crop);
  const isInitialized = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      isInitialized.current = false;
      return;
    }

    isInitialized.current = false;
    const timer = setTimeout(() => {
      setIsEnabled(persistedPreferences.crop.isEnabled);
      setCrop(persistedPreferences.crop.crop);
      isInitialized.current = true;
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, persistedPreferences]);

  useEffect(() => {
    if (!isInitialized.current) return;
    updateStoredSynthesisExecutionPreferences({
      crop: {
        isEnabled,
        crop,
      },
    });
  }, [crop, isEnabled, isInitialized]);

  return {
    isEnabled,
    setIsEnabled,
    crop,
    setCrop,
  };
}
