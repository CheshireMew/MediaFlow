import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";

import { stopVideoAtClipEnd } from "../../utils/clipPlayback";

export function useClipPlayback({
  mediaUrl,
  workspaceMode,
  videoElementRef,
}: {
  mediaUrl: string | null;
  workspaceMode: string;
  videoElementRef: RefObject<HTMLVideoElement | null>;
}) {
  const clipEndRef = useRef<number | null>(null);

  useEffect(() => {
    clipEndRef.current = null;
  }, [mediaUrl, workspaceMode]);

  useEffect(() => {
    const video = videoElementRef.current;
    if (!video) return;
    const stopAtBoundary = () => {
      const end = clipEndRef.current;
      if (end !== null && stopVideoAtClipEnd(video, end)) clipEndRef.current = null;
    };
    const clearBoundary = () => { clipEndRef.current = null; };
    video.addEventListener("timeupdate", stopAtBoundary);
    video.addEventListener("ended", clearBoundary);
    return () => {
      video.removeEventListener("timeupdate", stopAtBoundary);
      video.removeEventListener("ended", clearBoundary);
    };
  }, [mediaUrl, videoElementRef]);

  const seek = useCallback((start: number) => {
    clipEndRef.current = null;
    if (videoElementRef.current) videoElementRef.current.currentTime = start;
  }, [videoElementRef]);

  const play = useCallback((start: number, end: number) => {
    const video = videoElementRef.current;
    if (!video) return;
    clipEndRef.current = end;
    video.currentTime = start;
    void video.play().catch(() => { clipEndRef.current = null; });
  }, [videoElementRef]);

  return { seek, play };
}
