import { useEffect, useRef, useState } from "react";

import { editorService, type VideoExportScope } from "../../../../services/domain";
import type { MediaReference } from "../../../../services/ui/mediaReference";
import type { MediaExportTimelineResponse } from "../../../../types/api";
import type { SubtitleSegment } from "../../../../types/task";

const PREVIEW_VISIBLE_FRAME_OFFSET_SECONDS = 1 / 30;
export const PROBE_FAILURE_FALLBACK_VISIBLE_START_SECONDS = 2 / 30;

type PreviewSessionOptions = {
  isOpen: boolean;
  video: MediaReference | null;
  mediaUrl: string | null;
  regions: SubtitleSegment[];
  exportScope: VideoExportScope;
};

export function useSynthesisPreviewSession(options: PreviewSessionOptions) {
  const { isOpen, video, mediaUrl, regions, exportScope } = options;
  const videoPath = video?.path ?? null;
  const isClipExport = exportScope.kind === "clips";
  const clipSegments = exportScope.kind === "clips" ? exportScope.segments : [];
  const firstClipStart = clipSegments[0]?.start ?? 0;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoSize, setVideoSize] = useState({ w: 0, h: 0 });
  const [currentTime, setCurrentTime] = useState(0);
  const [timeline, setTimeline] = useState<MediaExportTimelineResponse | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [resolutionFailed, setResolutionFailed] = useState(false);
  const [activeClipIndex, setActiveClipIndex] = useState(0);
  const activeClip = clipSegments[activeClipIndex] ?? null;

  useEffect(() => {
    const timer = setTimeout(() => {
      setVideoSize({ w: 0, h: 0 });
      setCurrentTime(isOpen && isClipExport ? firstClipStart : 0);
      setTimeline(null);
      setIsResolving(false);
      setResolutionFailed(false);
      setActiveClipIndex(0);
    }, 0);
    return () => clearTimeout(timer);
  }, [firstClipStart, isClipExport, isOpen, mediaUrl, videoPath]);

  useEffect(() => {
    if (!isOpen || isClipExport || !video) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      setIsResolving(true);
      setResolutionFailed(false);
      void editorService.getMediaExportTimeline({ video_ref: video, speech_segments: regions })
        .then((result) => {
          if (cancelled) return;
          setTimeline(result);
          if (result.trim_start > 0) {
            const previewStart = result.trim_start + PREVIEW_VISIBLE_FRAME_OFFSET_SECONDS;
            setCurrentTime(previewStart);
            if (videoRef.current) videoRef.current.currentTime = previewStart;
          }
        })
        .catch(() => {
          if (!cancelled) setResolutionFailed(true);
        })
        .finally(() => {
          if (!cancelled) setIsResolving(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isClipExport, isOpen, regions, video]);

  useEffect(() => {
    if (!isOpen || !activeClip || !videoRef.current) return;
    const element = videoRef.current;
    const seekToClip = () => {
      element.pause();
      element.currentTime = activeClip.start;
      setCurrentTime(activeClip.start);
    };
    if (element.readyState >= HTMLMediaElement.HAVE_METADATA) seekToClip();
    else element.addEventListener("loadedmetadata", seekToClip, { once: true });
    return () => element.removeEventListener("loadedmetadata", seekToClip);
  }, [activeClip, isOpen]);

  return {
    videoRef,
    videoSize,
    setVideoSize,
    currentTime,
    setCurrentTime,
    timeline,
    isResolving,
    automaticTrimStart: timeline?.trim_start
      ?? (resolutionFailed ? PROBE_FAILURE_FALLBACK_VISIBLE_START_SECONDS : 0),
    clipSegments,
    activeClip,
    activeClipIndex,
    setActiveClipIndex,
  };
}
