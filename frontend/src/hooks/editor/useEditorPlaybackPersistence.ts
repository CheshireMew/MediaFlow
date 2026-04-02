import { useCallback, useEffect } from "react";
import {
  persistEditorPlaybackRate,
  persistEditorPlaybackTime,
  restoreEditorPlaybackRate,
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

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const savedRate = restoreEditorPlaybackRate();
    if (Number.isFinite(savedRate) && savedRate > 0 && video.playbackRate !== savedRate) {
      video.playbackRate = savedRate;
    }

    const saveRate = () => {
      persistEditorPlaybackRate(video.playbackRate);
    };

    video.addEventListener("ratechange", saveRate);

    return () => {
      saveRate();
      video.removeEventListener("ratechange", saveRate);
    };
  }, [currentFilePath, videoRef]);

  const handleLoadedMetadata = useCallback(() => {
    if (!currentFilePath || !videoRef.current) {
      return;
    }

    const savedRate = restoreEditorPlaybackRate();
    if (
      Number.isFinite(savedRate) &&
      savedRate > 0 &&
      videoRef.current.playbackRate !== savedRate
    ) {
      videoRef.current.playbackRate = savedRate;
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
