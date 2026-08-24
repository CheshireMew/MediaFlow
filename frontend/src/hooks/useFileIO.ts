import { useCallback, useEffect } from "react";
import { useTranslatorStore } from "../stores/translatorStore";
import {
  NavigationService,
  type NavigationPayload,
  resolveNavigationMediaPayload,
} from "../services/ui/navigation";
import {
  consumePendingMediaNavigation,
  clearPendingMediaNavigation,
  readPendingMediaNavigation,
} from "../services/ui/pendingMediaNavigation";
import {
} from "./translator/translatorFileHelpers";
import { useTranslatorFileLoader } from "./translator/useTranslatorFileLoader";
import { useTranslatorOutputActions } from "./translator/useTranslatorOutputActions";
import { useShallow } from "zustand/react/shallow";

export {
  buildTranslatorOutputPath,
  getTranslatorAutoloadSuffixes,
  getTranslatorOutputSuffix,
  isSupportedTranslatorSubtitlePath,
  stripTranslatorSubtitleExtension,
} from "./translator/translatorFileHelpers";

export const useFileIO = () => {
  const {
    sourceFileRef,
    sourceSegments,
    targetSegments,
  } = useTranslatorStore(useShallow((state) => ({
    sourceFileRef: state.sourceFileRef,
    sourceSegments: state.sourceSegments,
    targetSegments: state.targetSegments,
  })));
  const { handleFileUpload } = useTranslatorFileLoader();
  const { exportSRT, handleOpenInEditor } = useTranslatorOutputActions();

  const applyTranslatorPayload = useCallback((payload?: NavigationPayload | null) => {
    if (!payload) {
      return false;
    }

    try {
      const { subtitleRef } = resolveNavigationMediaPayload(payload);

      if (subtitleRef) {
        void handleFileUpload(subtitleRef);
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
    sourceFileRef,
    sourceSegments, // Exposed for checking length
    targetSegments, // Exposed for checking length
    handleFileUpload,
    exportSRT,
    handleOpenInEditor,
  };
};
