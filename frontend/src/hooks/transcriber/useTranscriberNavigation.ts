import { useCallback, useEffect } from "react";

import { isDesktopRuntime } from "../../services/domain";
import type { ElectronFile } from "../../types/electron";
import { fileService } from "../../services/fileService";
import {
  createMediaReference,
  type MediaReference,
  toElectronFile,
} from "../../services/ui/mediaReference";
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
  setActiveTaskId: (taskId: string | null) => void;
}) {
  const { setFile, setResult, setActiveTaskId } = params;

  const applyNavigationPayload = useCallback(
    async (
      videoPath: string | null | undefined,
      videoRef?: MediaReference | null,
    ) => {
      if (!videoPath) return;

      let fileSize = 0;
      if (isDesktopRuntime()) {
        try {
          fileSize = await fileService.getFileSize(videoPath);
        } catch (error) {
          console.warn("[Transcriber] Could not get file size:", error);
        }
      }

      setActiveTaskId(null);
      setResult(null);
      setFile(toElectronFile(createMediaReference({
        path: videoPath,
        name: videoRef?.name,
        size: videoRef?.size ?? fileSize,
        type: videoRef?.type ?? "video/mp4",
        media_id: videoRef?.media_id,
        media_kind: videoRef?.media_kind,
        role: videoRef?.role,
        origin: videoRef?.origin,
      })));
    },
    [setActiveTaskId, setFile, setResult],
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
