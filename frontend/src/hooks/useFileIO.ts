import { useCallback, useEffect } from "react";
import { useTranslatorStore } from "../stores/translatorStore";
import { NavigationService } from "../services/ui/navigation";
import {
  consumePendingMediaNavigation,
  clearPendingMediaNavigation,
  readPendingMediaNavigation,
} from "../services/ui/pendingMediaNavigation";
import {
  getTranslatorAutoloadSuffixes,
  getTranslatorOutputSuffix,
  isSupportedTranslatorSubtitlePath,
  stripTranslatorSubtitleExtension,
} from "./translator/translatorFileHelpers";
import { useTranslatorFileLoader } from "./translator/useTranslatorFileLoader";
import { useTranslatorOutputActions } from "./translator/useTranslatorOutputActions";

export {
  getTranslatorAutoloadSuffixes,
  getTranslatorOutputSuffix,
  isSupportedTranslatorSubtitlePath,
  stripTranslatorSubtitleExtension,
} from "./translator/translatorFileHelpers";

export const useFileIO = () => {
  const {
    sourceFilePath,
    sourceSegments,
    targetSegments,
  } = useTranslatorStore();
  const { handleFileUpload } = useTranslatorFileLoader();
  const { exportSRT, handleOpenInEditor } = useTranslatorOutputActions();

  const applyTranslatorPayload = useCallback((payload?: {
    subtitle_path?: string | null;
    video_path?: string | null;
  } | null) => {
    if (!payload) {
      return false;
    }

    try {
      if (payload.subtitle_path) {
        void handleFileUpload(payload.subtitle_path);
        return true;
      }
      if (
        payload.video_path &&
        isSupportedTranslatorSubtitlePath(payload.video_path)
      ) {
        void handleFileUpload(payload.video_path);
        return true;
      }
    } catch (error) {
      console.error("[useFileIO] Failed to handle navigation payload:", error);
    }
    return false;
  }, [handleFileUpload]);

  const checkPendingNavigation = useCallback(() => {
    const pendingFile = readPendingMediaNavigation();
    if (pendingFile) {
      applyTranslatorPayload(pendingFile);
      clearPendingMediaNavigation();
    }
  }, [applyTranslatorPayload]);

  useEffect(() => {
    checkPendingNavigation();
    const cleanup = NavigationService.subscribe((detail) => {
      if (detail.destination === "translator") {
        if (applyTranslatorPayload(detail.payload)) {
          consumePendingMediaNavigation(detail.payload);
          return;
        }
        checkPendingNavigation();
      }
    });
    return cleanup;
  }, [applyTranslatorPayload, checkPendingNavigation]);

  return {
    sourceFilePath,
    sourceSegments, // Exposed for checking length
    targetSegments, // Exposed for checking length
    handleFileUpload,
    exportSRT,
    handleOpenInEditor,
  };
};
