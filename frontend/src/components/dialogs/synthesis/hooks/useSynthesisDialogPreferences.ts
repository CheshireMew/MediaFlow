import { useEffect, useRef, useState } from "react";

import type { SubtitleSegment } from "../../../../types/task";
import {
  restoreStoredSynthesisExecutionPreferences,
  updateStoredSynthesisExecutionPreferences,
} from "../../../../services/persistence/synthesisExecutionPreferences";

export function useSynthesisDialogPreferences(isOpen: boolean, regions: SubtitleSegment[]) {
  const [persistedPreferences, setPersistedPreferences] = useState(
    restoreStoredSynthesisExecutionPreferences,
  );
  const [subtitleEnabled, setSubtitleEnabled] = useState(
    () => persistedPreferences.subtitleEnabled,
  );
  const [watermarkEnabled, setWatermarkEnabled] = useState(
    () => persistedPreferences.watermarkEnabled,
  );
  const togglesInitialized = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      setPersistedPreferences(restoreStoredSynthesisExecutionPreferences());
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      togglesInitialized.current = false;
      return;
    }
    togglesInitialized.current = false;
    const timer = setTimeout(() => {
      setSubtitleEnabled(persistedPreferences.subtitleEnabled);
      setWatermarkEnabled(persistedPreferences.watermarkEnabled);
      togglesInitialized.current = true;
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, persistedPreferences]);

  useEffect(() => {
    if (togglesInitialized.current) {
      updateStoredSynthesisExecutionPreferences({ subtitleEnabled, watermarkEnabled });
    }
  }, [subtitleEnabled, watermarkEnabled]);

  return {
    persistedPreferences,
    subtitleAvailable: regions.some((region) => region.text.trim().length > 0),
    subtitleEnabled,
    setSubtitleEnabled,
    watermarkEnabled,
    setWatermarkEnabled,
  };
}
