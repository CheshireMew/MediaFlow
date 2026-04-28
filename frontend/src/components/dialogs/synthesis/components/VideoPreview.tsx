import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Play } from "lucide-react";
import type { SubtitleStyleState } from "../hooks/useSubtitleStyle";
import type { WatermarkState } from "../hooks/useWatermark";
import type { OutputSettingsState } from "../hooks/useOutputSettings";
import type { CropState } from "../hooks/useCrop";
import { usePreviewDrag } from "../hooks/usePreviewDrag";
import { usePreviewFrameMetrics } from "../hooks/usePreviewFrameMetrics";
import { usePreviewMediaState } from "../hooks/usePreviewMediaState";
import { resolvePreviewViewportMetrics } from "../previewViewport";
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
  onSynthesizeClick: () => void;
  isSynthesizing: boolean;
  synthesisProgress: number;
  synthesisMessage: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  setVideoSize: (v: { w: number; h: number }) => void;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
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
  onSynthesizeClick,
  isSynthesizing,
  synthesisProgress,
  synthesisMessage,
  videoRef,
  setVideoSize,
  currentTime,
  onTimeUpdate,
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

  return (
    <div className="flex-1 flex flex-col bg-[#050505] relative min-w-0">
      <PreviewToolbar
        output={output}
        crop={crop}
        isTrimOpen={isTrimOpen}
        setIsTrimOpen={setIsTrimOpen}
        onClose={onClose}
      />

      {isTrimOpen && (
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
            className="relative shadow-2xl shadow-black/50 border border-white/10 bg-black rounded-lg overflow-hidden ring-1 ring-white/5 max-w-full max-h-full"
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
              videoEvents={bindVideoEvents(mediaUrl, onTimeUpdate)}
            />

            {!frameReady && !mediaState.hasError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-slate-300 pointer-events-none">
                <div className="h-8 w-8 rounded-full border-2 border-white/15 border-t-indigo-400 animate-spin" />
                <span className="text-xs font-medium text-slate-400">
                  {t("preview.loadingMediaFrame", "正在加载视频画面...")}
                </span>
              </div>
            )}

            {mediaState.hasError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-slate-300 pointer-events-none">
                <Play size={32} className="opacity-30" />
                <span className="text-sm font-medium text-slate-300">
                  {t("preview.mediaLoadError", "视频预览加载失败")}
                </span>
                <span className="text-xs text-slate-500">
                  {t("preview.mediaLoadErrorHint", "请重新打开合成界面或检查视频编码")}
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
        onSynthesizeClick={onSynthesizeClick}
        isSynthesizing={isSynthesizing}
        synthesisProgress={synthesisProgress}
        synthesisMessage={synthesisMessage}
      />
    </div>
  );
};
