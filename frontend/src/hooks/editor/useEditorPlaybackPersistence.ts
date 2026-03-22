import { useCallback, useEffect } from "react";
import {
  persistEditorPlaybackTime,
  restoreEditorPlaybackTime,
} from "./editorPlaybackPersistence";

type UseEditorPlaybackPersistenceArgs = {
  currentFilePath: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
};

export function useEditorPlaybackPersistence({
  currentFilePath,
  videoRef,
}: UseEditorPlaybackPersistenceArgs) {
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentFilePath) {
      return;
    }

    const saveTime = () => {
      if (video.currentTime > 0) {
        persistEditorPlaybackTime(currentFilePath, video.currentTime);
      }
    };

    const interval = setInterval(saveTime, 5000);
    video.addEventListener("pause", saveTime);

    return () => {
      saveTime();
      clearInterval(interval);
      video.removeEventListener("pause", saveTime);
    };
  }, [currentFilePath, videoRef]);

  const handleLoadedMetadata = useCallback(() => {
    if (!currentFilePath || !videoRef.current) {
      return;
    }

    const savedTime = restoreEditorPlaybackTime(currentFilePath);
    if (!savedTime) {
      return;
    }

    const time = savedTime;
    if (!isNaN(time) && time > 0 && time < videoRef.current.duration) {
      videoRef.current.currentTime = time;
    }
  }, [currentFilePath, videoRef]);

  return { handleLoadedMetadata };
}
