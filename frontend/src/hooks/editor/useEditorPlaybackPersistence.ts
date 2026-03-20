import { useCallback, useEffect } from "react";

type UseEditorPlaybackPersistenceArgs = {
  currentFilePath: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
};

function getPlaybackStorageKey(currentFilePath: string) {
  return `playback_pos_${currentFilePath}`;
}

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
        localStorage.setItem(
          getPlaybackStorageKey(currentFilePath),
          String(video.currentTime),
        );
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

    const saved = localStorage.getItem(getPlaybackStorageKey(currentFilePath));
    if (!saved) {
      return;
    }

    const time = parseFloat(saved);
    if (!isNaN(time) && time > 0 && time < videoRef.current.duration) {
      videoRef.current.currentTime = time;
    }
  }, [currentFilePath, videoRef]);

  return { handleLoadedMetadata };
}
