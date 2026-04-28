import { useEffect, useState } from "react";
import type React from "react";

export type PreviewMediaState = {
  url: string | null;
  hasMetadata: boolean;
  hasFrame: boolean;
  hasError: boolean;
  width: number;
  height: number;
  duration: number;
};

export function createPreviewMediaState(url: string | null): PreviewMediaState {
  return {
    url,
    hasMetadata: false,
    hasFrame: false,
    hasError: false,
    width: 0,
    height: 0,
    duration: 0,
  };
}

export function usePreviewMediaState({
  mediaUrl,
  videoRef,
  setVideoSize,
}: {
  mediaUrl: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  setVideoSize: (v: { w: number; h: number }) => void;
}) {
  const [mediaState, setMediaState] = useState<PreviewMediaState>(() =>
    createPreviewMediaState(mediaUrl),
  );

  useEffect(() => {
    setMediaState(createPreviewMediaState(mediaUrl));
  }, [mediaUrl]);

  useEffect(() => {
    if (!mediaUrl || !videoRef.current) {
      return;
    }
    videoRef.current.load();
  }, [mediaUrl, videoRef]);

  const bindVideoEvents = (url: string, onTimeUpdate: (time: number) => void) => ({
    onLoadStart: () => {
      setMediaState(createPreviewMediaState(url));
    },
    onTimeUpdate: (event: React.SyntheticEvent<HTMLVideoElement>) => {
      onTimeUpdate(event.currentTarget.currentTime);
    },
    onLoadedMetadata: (event: React.SyntheticEvent<HTMLVideoElement>) => {
      const target = event.currentTarget;
      const nextSize = {
        w: target.videoWidth || 0,
        h: target.videoHeight || 0,
      };
      const nextDuration = Number.isFinite(target.duration) ? target.duration : 0;
      setVideoSize(nextSize);
      setMediaState({
        url,
        hasMetadata: true,
        hasFrame: false,
        hasError: false,
        width: nextSize.w,
        height: nextSize.h,
        duration: nextDuration,
      });
    },
    onLoadedData: (event: React.SyntheticEvent<HTMLVideoElement>) => {
      const target = event.currentTarget;
      setMediaState((current) => ({
        url,
        hasMetadata: true,
        hasFrame: true,
        hasError: false,
        width: target.videoWidth || current.width,
        height: target.videoHeight || current.height,
        duration: Number.isFinite(target.duration) ? target.duration : current.duration,
      }));
    },
    onCanPlay: (event: React.SyntheticEvent<HTMLVideoElement>) => {
      const target = event.currentTarget;
      setMediaState((current) => ({
        url,
        hasMetadata: current.hasMetadata || target.videoWidth > 0,
        hasFrame: true,
        hasError: false,
        width: target.videoWidth || current.width,
        height: target.videoHeight || current.height,
        duration: Number.isFinite(target.duration) ? target.duration : current.duration,
      }));
    },
    onDurationChange: (event: React.SyntheticEvent<HTMLVideoElement>) => {
      const nextDuration = Number.isFinite(event.currentTarget.duration)
        ? event.currentTarget.duration
        : 0;
      setMediaState((current) => ({
        ...current,
        duration: nextDuration,
      }));
    },
    onError: () => {
      setVideoSize({ w: 0, h: 0 });
      setMediaState({
        url,
        hasMetadata: false,
        hasFrame: false,
        hasError: true,
        width: 0,
        height: 0,
        duration: 0,
      });
    },
  });

  return {
    mediaState,
    bindVideoEvents,
  };
}
