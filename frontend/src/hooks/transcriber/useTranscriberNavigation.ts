import { useCallback, useEffect } from "react";

import { isDesktopRuntime } from "../../services/domain";
import type { ElectronFile } from "../../types/electron";
import { fileService } from "../../services/fileService";
import {
  normalizeMediaReference,
  type MediaReference,
  toElectronFile,
} from "../../services/ui/mediaReference";
import {
  attachElectronFileSource,
  toNavigationFileSource,
} from "../../services/ui/electronFileSource";
import {
  NavigationService,
  type NavigationPayload,
  resolveNavigationMediaPayload,
} from "../../services/ui/navigation";
import {
  consumePendingMediaNavigation,
  clearPendingMediaNavigation,
  readPendingMediaNavigation,
} from "../../services/ui/pendingMediaNavigation";

export function useTranscriberNavigation(params: {
  setFile: (file: ElectronFile | null) => void;
  setResult: (value: null) => void;
  setCurrentTranscriptionTaskId: (taskId: string | null) => void;
}) {
  const { setFile, setResult, setCurrentTranscriptionTaskId } = params;

  const applyNavigationPayload = useCallback(
    async (
      videoPath: string | null | undefined,
      videoRef?: MediaReference | null,
    ) => {
      if (!videoPath) return;

      const resolvedVideoPath = videoPath;
      let fileSize = 0;
      if (isDesktopRuntime()) {
        try {
          fileSize = await fileService.getFileSize(resolvedVideoPath);
        } catch (error) {
          console.warn("[Transcriber] Could not get file size:", error);
        }
      }

      setCurrentTranscriptionTaskId(null);
      setResult(null);
      setFile(
        attachElectronFileSource(
          toElectronFile(
            normalizeMediaReference(
              videoRef ? { ...videoRef, path: resolvedVideoPath } : resolvedVideoPath,
              { size: fileSize, type: "video/mp4" },
            )!,
          ),
          toNavigationFileSource(videoRef),
        ),
      );
    },
    [setCurrentTranscriptionTaskId, setFile, setResult],
  );

  const consumeNavigation = useCallback(
    async (payload?: NavigationPayload | null) => {
      const { videoPath, videoRef } = resolveNavigationMediaPayload(payload);
      if (!videoPath) return;
      await applyNavigationPayload(videoPath, videoRef);
    },
    [applyNavigationPayload],
  );

  useEffect(() => {
    const pending = readPendingMediaNavigation();
    if (pending?.target === "transcriber" && resolveNavigationMediaPayload(pending).videoPath) {
      void consumeNavigation(pending).finally(() => {
        clearPendingMediaNavigation();
      });
    }

    const cleanup = NavigationService.subscribe((detail) => {
      if (detail.destination === "transcriber") {
        void consumeNavigation(detail.payload).then(() => {
          consumePendingMediaNavigation(detail.payload);
        });
      }
    });
    return cleanup;
  }, [consumeNavigation]);
}
