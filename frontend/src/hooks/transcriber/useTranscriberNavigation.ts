import { useCallback, useEffect } from "react";

import type { ElectronFile } from "../../types/electron";
import {
  NavigationService,
  type NavigationPayload,
} from "../../services/ui/navigation";
import {
  consumePendingMediaNavigation,
  clearPendingMediaNavigation,
  readPendingMediaNavigation,
} from "../../services/ui/pendingMediaNavigation";

export function useTranscriberNavigation(params: {
  setFile: (file: ElectronFile | null) => void;
  setResult: (value: null) => void;
}) {
  const { setFile, setResult } = params;

  const applyNavigationPayload = useCallback(
    async (videoPath: string | null | undefined) => {
      if (!videoPath) return;

      let fileSize = 0;
      if (window.electronAPI?.getFileSize) {
        try {
          fileSize = await window.electronAPI.getFileSize(videoPath);
        } catch (error) {
          console.warn("[Transcriber] Could not get file size:", error);
        }
      }

      setResult(null);
      setFile({
        name: videoPath.split(/[\\/]/).pop() || "video.mp4",
        path: videoPath,
        size: fileSize,
        type: "video/mp4",
      } as ElectronFile);
    },
    [setFile, setResult],
  );

  const consumeNavigation = useCallback(
    async (payload?: NavigationPayload | null) => {
      if (!payload?.video_path) return;
      await applyNavigationPayload(payload.video_path);
    },
    [applyNavigationPayload],
  );

  useEffect(() => {
    const pending = readPendingMediaNavigation();
    if (pending?.target === "transcriber" && pending.video_path) {
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
