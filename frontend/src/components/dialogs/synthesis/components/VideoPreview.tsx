import React, { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Play } from "lucide-react";
import type { SubtitleStyleState } from "../hooks/useSubtitleStyle";
import type { WatermarkState } from "../hooks/useWatermark";
import type { OutputSettingsState } from "../hooks/useOutputSettings";
import type { CropState } from "../hooks/useCrop";
import { usePreviewDrag } from "../hooks/usePreviewDrag";
import { usePreviewFrameMetrics } from "../hooks/usePreviewFrameMetrics";
import { usePreviewMediaState } from "../hooks/usePreviewMediaState";
import { resolvePreviewViewportMetrics } from "../../../../services/domain";
import { CropOverlay } from "./CropOverlay";
import { PreviewMediaElement } from "./PreviewMediaElement";
import {
  isCurrentMediaFrameReady,
  isCurrentMediaMetadataReady,
} from "./previewMediaReadiness";
import { PreviewActionBar } from "./PreviewActionBar";
import { PreviewToolbar } from "./PreviewToolbar";
import { PreviewTrimPanel } from "./PreviewTrimPanel";
import { SubtitlePreviewLayer } from "./SubtitlePreviewLayer";
import { WatermarkPreviewLayer } from "./WatermarkPreviewLayer";

interface Props {
  mediaUrl: string | null;
  style: SubtitleStyleState;
  watermark: WatermarkState;
  output: OutputSettingsState;
  crop: CropState;
  subtitleEnabled: boolean;
  watermarkEnabled: boolean;
  onClose: () => void;
  onExportClick: () => void;
  isSubmitting: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  setVideoSize: (v: { w: number; h: number }) => void;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  previewRange?: { start: number; end: number } | null;
  clipNavigator?: {
    index: number;
    count: number;
    title: string;
    onPrevious: () => void;
    onNext: () => void;
  } | null;
  allowTrim?: boolean;
  actionLabel?: string;
}

export const VideoPreview: React.FC<Props> = ({
  mediaUrl,
  style,
  watermark,
  output,
  crop,
  subtitleEnabled,
  watermarkEnabled,
  onClose,
  onExportClick,
  isSubmitting,
  videoRef,
  setVideoSize,
  currentTime,
  onTimeUpdate,
  previewRange = null,
  clipNavigator = null,
  allowTrim = true,
  actionLabel,
}) => {
  const frameRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation("synthesis");
  const [isTrimOpen, setIsTrimOpen] = useState(false);
  const { mediaState, bindVideoEvents } = usePreviewMediaState({
    mediaUrl,
    videoRef,
    setVideoSize,
  });
  const frameSize = usePreviewFrameMetrics(frameRef, mediaUrl);
  const { dragging, startDrag, startSubtitleDrag } = usePreviewDrag({
    frameRef,
    setWmPos: watermark.setWmPos,
    setSubPos: style.setSubPos,
  });

  const metadataReady = isCurrentMediaMetadataReady(mediaUrl, mediaState);
  const frameReady = isCurrentMediaFrameReady(mediaUrl, mediaState);
  const effectiveVideoSize = metadataReady
    ? { w: mediaState.width, h: mediaState.height }
    : { w: 0, h: 0 };
  const effectiveDuration = metadataReady ? mediaState.duration : 0;
  const previewViewportMetrics = resolvePreviewViewportMetrics({
    sourceWidth: effectiveVideoSize.w,
    sourceHeight: effectiveVideoSize.h,
    crop: crop.isEnabled ? crop.crop : null,
  });
  const togglePreviewPlayback = useCallback(() => {
    if (dragging || mediaState.hasError || !frameReady) {
      return;
    }

    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (video.paused) {
      if (previewRange &&
          (video.currentTime < previewRange.start || video.currentTime >= previewRange.end)) {
        video.currentTime = previewRange.start;
        onTimeUpdate(previewRange.start);
      }
      void video.play();
      return;
    }

    video.pause();
  }, [dragging, frameReady, mediaState.hasError, onTimeUpdate, previewRange, videoRef]);

  const handlePreviewFrameClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (
        event.target !== event.currentTarget &&
        !(event.target instanceof HTMLVideoElement)
      ) {
        return;
      }

      togglePreviewPlayback();
    },
    [togglePreviewPlayback],
  );

  const handlePreviewFrameKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      togglePreviewPlayback();
    },
    [togglePreviewPlayback],
  );
  const handlePreviewTimeUpdate = useCallback((time: number, video: HTMLVideoElement) => {
    if (previewRange && time >= previewRange.end) {
      video.pause();
      if (Math.abs(video.currentTime - previewRange.end) > 0.01) {
        video.currentTime = previewRange.end;
      }
      onTimeUpdate(previewRange.end);
      return;
    }
    onTimeUpdate(time);
  }, [onTimeUpdate, previewRange]);

  return (
    <div className="flex-1 flex flex-col bg-[#050505] relative min-w-0">
      <PreviewToolbar
        output={output}
        crop={crop}
        isTrimOpen={isTrimOpen}
        setIsTrimOpen={setIsTrimOpen}
        onClose={onClose}
        showTrimButton={allowTrim}
        clipNavigator={clipNavigator}
      />

      {allowTrim && isTrimOpen && (
        <PreviewTrimPanel
          output={output}
          currentTime={currentTime}
          duration={effectiveDuration}
        />
      )}

      <div className="flex-1 relative flex items-center justify-center bg-[url('/grid.svg')] bg-repeat opacity-100 overflow-hidden p-8">
        {mediaUrl ? (
          <div
            ref={frameRef}
            role="button"
            tabIndex={0}
            aria-label={t("preview.togglePlayback")}
            onClick={handlePreviewFrameClick}
            onKeyDown={handlePreviewFrameKeyDown}
            className="relative shadow-2xl shadow-black/50 border border-white/10 bg-black rounded-lg overflow-hidden ring-1 ring-white/5 max-w-full max-h-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400/70"
            style={{
              aspectRatio: `${previewViewportMetrics.aspectRatio}`,
              width:
                effectiveVideoSize.w > 0 && effectiveVideoSize.h > 0
                  ? "min(100%, calc((100vh - 240px) * var(--preview-aspect)))"
                  : undefined,
              height: "auto",
              ["--preview-aspect" as string]: `${previewViewportMetrics.aspectRatio}`,
            }}
          >
            <PreviewMediaElement
              mediaUrl={mediaUrl}
              videoRef={videoRef}
              isFrameReady={frameReady}
              viewportMetrics={previewViewportMetrics}
              videoEvents={bindVideoEvents(mediaUrl, handlePreviewTimeUpdate)}
            />

            {!frameReady && !mediaState.hasError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-slate-300 pointer-events-none">
                <div className="h-8 w-8 rounded-full border-2 border-white/15 border-t-indigo-400 animate-spin" />
                <span className="text-xs font-medium text-slate-400">
                  {t("preview.loadingMediaFrame")}
                </span>
              </div>
            )}

            {mediaState.hasError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-slate-300 pointer-events-none">
                <Play size={32} className="opacity-30" />
                <span className="text-sm font-medium text-slate-300">
                  {t("preview.mediaLoadError")}
                </span>
                <span className="text-xs text-slate-500">
                  {t("preview.mediaLoadErrorHint")}
                </span>
              </div>
            )}

            {crop.isEnabled && metadataReady && (
              <CropOverlay crop={crop.crop} setCrop={crop.setCrop} containerRef={frameRef} />
            )}

            {watermarkEnabled && watermark.watermarkPreviewUrl && frameReady && (
              <WatermarkPreviewLayer
                watermarkPreviewUrl={watermark.watermarkPreviewUrl}
                wmScale={watermark.wmScale}
                wmOpacity={watermark.wmOpacity}
                wmPos={watermark.wmPos}
                dragging={dragging}
                onDragStart={startDrag}
              />
            )}

            {subtitleEnabled && frameReady && (
              <SubtitlePreviewLayer
                style={style}
                frameSize={frameSize}
                sourceSize={{
                  width: previewViewportMetrics.outputSourceWidth,
                  height: previewViewportMetrics.outputSourceHeight,
                }}
                fallbackText={t("preview.subtitlePosition")}
                dragging={dragging}
                onSubtitleDragStart={startSubtitleDrag}
              />
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center w-full h-full text-slate-600 bg-white/[0.02] rounded-lg border border-white/10 ring-1 ring-white/5">
            <Play size={48} className="opacity-20 mb-4" />
            <span className="text-sm font-medium">{t("preview.noMediaLoaded")}</span>
          </div>
        )}
      </div>

      <PreviewActionBar
        videoRef={videoRef}
        currentTime={currentTime}
        duration={effectiveDuration}
        onTimeUpdate={onTimeUpdate}
        onExportClick={onExportClick}
        isSubmitting={isSubmitting}
        playbackRange={previewRange}
        actionLabel={actionLabel}
      />
    </div>
  );
};
