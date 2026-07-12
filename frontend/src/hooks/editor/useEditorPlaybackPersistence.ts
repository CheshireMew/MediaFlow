import { useCallback, useEffect, useRef } from "react";
import {
  persistEditorPlaybackRate,
  persistEditorPlaybackTime,
  restoreEditorPlaybackRate,
  restoreEditorPlaybackTime,
} from "./editorPlaybackPersistence";
import type { MediaReference } from "../../services/ui/mediaReference";

type UseEditorPlaybackPersistenceArgs = {
  video: MediaReference | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
};

export function useEditorPlaybackPersistence({
  video: videoReference,
  videoRef,
}: UseEditorPlaybackPersistenceArgs) {
  const playbackRateCleanupRef = useRef<(() => void) | null>(null);
  const playbackRateVideoRef = useRef<HTMLVideoElement | null>(null);

  const bindPlaybackRatePersistence = useCallback((video: HTMLVideoElement) => {
    if (playbackRateVideoRef.current === video) {
      return;
    }

    playbackRateCleanupRef.current?.();
    playbackRateVideoRef.current = video;

    const savedRate = restoreEditorPlaybackRate();
    if (Number.isFinite(savedRate) && savedRate > 0 && video.playbackRate !== savedRate) {
      video.playbackRate = savedRate;
    }

    const saveRate = () => {
      persistEditorPlaybackRate(video.playbackRate);
    };

    video.addEventListener("ratechange", saveRate);
    playbackRateCleanupRef.current = () => {
      saveRate();
      video.removeEventListener("ratechange", saveRate);
      if (playbackRateVideoRef.current === video) {
        playbackRateVideoRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement || !videoReference) {
      return;
    }

    const saveTime = () => {
      if (videoElement.currentTime > 0) {
        persistEditorPlaybackTime(videoReference, videoElement.currentTime);
      }
    };

    const interval = setInterval(saveTime, 5000);
    videoElement.addEventListener("pause", saveTime);

    return () => {
      saveTime();
      clearInterval(interval);
      videoElement.removeEventListener("pause", saveTime);
    };
  }, [videoReference, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      bindPlaybackRatePersistence(video);
    }

    return () => {
      playbackRateCleanupRef.current?.();
      playbackRateCleanupRef.current = null;
    };
  }, [bindPlaybackRatePersistence, videoRef]);

  const handleLoadedMetadata = useCallback(() => {
    if (!videoReference || !videoRef.current) {
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
    bindPlaybackRatePersistence(videoRef.current);

    const savedTime = restoreEditorPlaybackTime(videoReference);
    if (!savedTime) {
      return;
    }

    const time = savedTime;
    if (!isNaN(time) && time > 0 && time < videoRef.current.duration) {
      videoRef.current.currentTime = time;
    }
  }, [bindPlaybackRatePersistence, videoReference, videoRef]);

  return { handleLoadedMetadata };
}
