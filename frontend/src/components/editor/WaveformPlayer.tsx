import React from "react";
import { AudioLines, Minus, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useWaveformController } from "../../hooks/editor/useWaveformController";
import type { MediaReference } from "../../services/ui/mediaReference";
import type { SubtitleSegment } from "../../types/task";

interface WaveformPlayerProps {
  mediaUrl: string;
  video: MediaReference;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  regions: SubtitleSegment[];
  onRegionUpdate: (id: string, start: number, end: number) => void;
  onRegionClick: (id: string, event: MouseEvent) => void;
  onContextMenu: (event: MouseEvent, id: string, region?: { start: number; end: number }) => void;
  selectedIds?: string[];
  activeSegmentId?: string | null;
  autoScroll?: boolean;
  onInteractStart?: () => void;
}

function WaveformPlayerComponent({
  mediaUrl,
  video,
  videoRef,
  regions,
  onRegionUpdate,
  onRegionClick,
  onContextMenu,
  selectedIds = [],
  activeSegmentId = null,
  autoScroll = true,
  onInteractStart,
}: WaveformPlayerProps) {
  const { t } = useTranslation("editor");
  const {
    containerRef,
    timelineContainerRef,
    scrollContainerRef,
    zoom,
    zoomIn,
    zoomOut,
    isReady,
    hasError,
    loadProgress,
    duration,
    scrollWidth,
    currentPlaybackRegionId,
    onTopScroll,
  } = useWaveformController({
    mediaUrl,
    video,
    videoRef,
    regions,
    selectedIds,
    activeSegmentId,
    autoScroll,
    onRegionUpdate,
    onRegionClick,
    onContextMenu,
    onInteractStart,
  });

  return (
    <div className="w-full h-full flex flex-col relative bg-[#090909] border-t border-white/10">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-white/5 bg-[#141414] px-3">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
          <AudioLines size={14} className="text-indigo-300" />
          <span>{t("waveform.title")}</span>
          <span className="rounded-md border border-white/5 bg-white/[0.03] px-1.5 py-0.5 font-mono text-xs text-slate-400">
            {currentPlaybackRegionId
              ? t("waveform.currentSegment", { id: currentPlaybackRegionId })
              : t("waveform.noCurrentSegment")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-400">{Math.round(zoom)} px/s</span>
          <button
            type="button"
            onClick={zoomOut}
            className="bg-black/30 p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white border border-white/10 transition-all active:scale-95"
            title={t("waveform.zoomOut")}
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            onClick={zoomIn}
            className="bg-black/30 p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white border border-white/10 transition-all active:scale-95"
            title={t("waveform.zoomIn")}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className="w-full overflow-x-auto overflow-y-hidden custom-scrollbar bg-[#050505] border-b border-white/5"
        style={{ height: "12px", minHeight: "12px" }}
        onScroll={onTopScroll}
      >
        <div
          style={{
            width: `${Math.max(scrollWidth, duration * zoom)}px`,
            height: "1px",
          }}
        />
      </div>

      <div
        ref={containerRef}
        className="wavesurfer-wrapper relative w-full flex-1 overflow-hidden"
        onContextMenu={(event) => event.preventDefault()}
      >
        <div ref={timelineContainerRef} className="absolute top-0 left-0 w-full h-5 z-20 pointer-events-none opacity-95" />
      </div>
      <style>{`
        .wavesurfer-wrapper ::part(cursor) { box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.35), 0 0 14px rgba(56, 189, 248, 0.55); }
        .wavesurfer-wrapper ::part(region) { border-left: 1px solid rgba(255, 255, 255, 0.16); border-right: 1px solid rgba(255, 255, 255, 0.12); }
        .wavesurfer-wrapper ::part(timeline) { color: rgba(203, 213, 225, 0.78); }
      `}</style>

      {!isReady && !hasError && mediaUrl && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/80 z-40 backdrop-blur-sm transition-all duration-500">
          <div className="flex flex-col items-center gap-3">
            <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${loadProgress}%` }}
              />
            </div>
            <span className="text-xs font-medium text-indigo-400 tracking-wider uppercase">
              {loadProgress < 100
                ? t("waveform.decoding", { progress: loadProgress })
                : t("waveform.rendering")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export const WaveformPlayer = React.memo(WaveformPlayerComponent);
