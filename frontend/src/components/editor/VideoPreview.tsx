import React, { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { Clapperboard } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useVideoPreviewPlayback } from "../../hooks/editor/useVideoPreviewPlayback";
import {
  resolveContainedViewportFrame,
  resolvePreviewViewportMetrics,
} from "../../services/domain";
import type { SubtitleSegment } from "../../types/task";
import { SubtitleOverlay } from "./video-preview/SubtitleOverlay";
import { VideoPlaybackControls } from "./video-preview/VideoPlaybackControls";

interface VideoPreviewProps {
  mediaUrl: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  regions: SubtitleSegment[];
  onLoadedMetadata?: () => void;
}

function useElementSize(ref: RefObject<HTMLDivElement | null>, dependency: unknown) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      const next = { width: element.clientWidth, height: element.clientHeight };
      setSize((current) => current.width === next.width && current.height === next.height ? current : next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [dependency, ref]);
  return size;
}

function VideoPreviewComponent({
  mediaUrl,
  videoRef,
  regions,
  onLoadedMetadata,
}: VideoPreviewProps) {
  const { t } = useTranslation("editor");
  const panelRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const videoFrameRef = useRef<HTMLDivElement>(null);
  const [failedMediaUrl, setFailedMediaUrl] = useState<string | null>(null);
  const playback = useVideoPreviewPlayback({
    mediaUrl,
    videoRef,
    panelRef,
    onLoadedMetadata,
  });
  const stageSize = useElementSize(stageRef, mediaUrl);

  const hasError = mediaUrl !== null && failedMediaUrl === mediaUrl;

  const currentSubtitleIndex = useMemo(
    () => regions.findIndex(
      (region) => playback.currentTime >= region.start && playback.currentTime < region.end,
    ),
    [playback.currentTime, regions],
  );
  const currentSubtitle = currentSubtitleIndex >= 0
    ? regions[currentSubtitleIndex]?.text ?? ""
    : "";
  const viewportMetrics = useMemo(
    () => resolvePreviewViewportMetrics({
      sourceWidth: playback.mediaSize.width,
      sourceHeight: playback.mediaSize.height,
    }),
    [playback.mediaSize.height, playback.mediaSize.width],
  );
  const frameSize = useMemo(
    () => resolveContainedViewportFrame({
      containerWidth: stageSize.width,
      containerHeight: stageSize.height,
      aspectRatio: viewportMetrics.aspectRatio,
    }),
    [stageSize.height, stageSize.width, viewportMetrics.aspectRatio],
  );

  const handleFrameKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    playback.playPause();
  };

  return (
    <div className="flex-1 bg-[#0b0b0b] flex flex-col relative justify-center items-center">
      {mediaUrl && !hasError ? (
        <div
          ref={panelRef}
          data-testid="editor-video-preview-panel"
          className="w-full h-full min-h-0 relative flex flex-col bg-transparent"
        >
          <div
            ref={stageRef}
            className="flex-1 min-h-0 relative flex items-center justify-center overflow-hidden border border-white/[0.07] bg-black shadow-2xl"
          >
            <div
              ref={videoFrameRef}
              role="button"
              tabIndex={0}
              aria-label={playback.isPlaying ? t("videoPreview.pauseFrame") : t("videoPreview.playFrame")}
              onClick={playback.playPause}
              onKeyDown={handleFrameKeyDown}
              className="relative overflow-hidden bg-black shadow-2xl max-w-full max-h-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400/70"
              style={{
                width: frameSize.width > 0 ? `${frameSize.width}px` : "100%",
                height: frameSize.height > 0 ? `${frameSize.height}px` : "100%",
              }}
            >
              <video
                key={mediaUrl}
                ref={videoRef}
                src={mediaUrl}
                className="block w-full h-full object-contain"
                playsInline
                onTimeUpdate={playback.handleTimeUpdate}
                onLoadedMetadata={playback.handleLoadedMetadata}
                onError={() => setFailedMediaUrl(mediaUrl)}
              />
              <SubtitleOverlay
                text={currentSubtitle}
                currentIndex={currentSubtitleIndex}
                total={regions.length}
                isFullscreen={playback.isFullscreen}
                frameRef={videoFrameRef}
              />
            </div>
          </div>
          <VideoPlaybackControls
            width={frameSize.width}
            currentTime={playback.currentTime}
            duration={playback.duration}
            playbackRate={playback.playbackRate}
            volume={playback.volume}
            isMuted={playback.isMuted}
            isPlaying={playback.isPlaying}
            isFullscreen={playback.isFullscreen}
            onPlayPause={playback.playPause}
            onSeek={playback.seek}
            onRateChange={playback.setRate}
            onVolumeChange={playback.setPlaybackVolume}
            onMuteToggle={playback.toggleMute}
            onFullscreenToggle={playback.toggleFullscreen}
          />
        </div>
      ) : (
        <div className="text-slate-400 flex flex-col items-center gap-4">
          <div className="p-6 rounded-3xl bg-white/[0.02] border border-white/5 shadow-inner">
            <Clapperboard size={64} className="opacity-20" />
          </div>
          <p className="text-sm font-medium tracking-wide">
            {hasError ? t("videoPreview.mediaFailed") : t("videoPreview.noMedia")}
          </p>
        </div>
      )}
    </div>
  );
}

export const VideoPreview = React.memo(VideoPreviewComponent);
