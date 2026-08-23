import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";

import { createWaveformRuntime, type WaveformRuntime } from "../../components/editor/waveform/waveSurferRuntime";
import {
  applyPlaybackRegionHighlight,
  buildRegionTimelineIndex,
  findPlaybackRegionId,
  selectVisibleRegions,
  syncWaveformRegions,
} from "../../components/editor/waveform/regionSync";
import { editorService } from "../../services/domain";
import type { MediaReference } from "../../services/ui/mediaReference";
import type { SubtitleSegment } from "../../types/task";

function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

export function useWaveformController({
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
}: {
  mediaUrl: string;
  video: MediaReference;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  regions: SubtitleSegment[];
  selectedIds: string[];
  activeSegmentId: string | null;
  autoScroll: boolean;
  onRegionUpdate: (id: string, start: number, end: number) => void;
  onRegionClick: (id: string, event: MouseEvent) => void;
  onContextMenu: (event: MouseEvent, id: string, region?: { start: number; end: number }) => void;
  onInteractStart?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<WaveformRuntime | null>(null);
  const baseRegionColorsRef = useRef(new Map<string, string>());
  const highlightedRegionIdRef = useRef<string | null>(null);
  const currentTempRegionId = useRef<string | null>(null);
  const scrollOwner = useRef<"top" | "wave" | null>(null);
  const [zoom, setZoom] = useState(80);
  const zoomRef = useLatestRef(zoom);
  const timelineIndex = useMemo(() => buildRegionTimelineIndex(regions), [regions]);
  const timelineIndexRef = useLatestRef(timelineIndex);
  const persistedRegionIds = useMemo(
    () => new Set(regions.map((region) => String(region.id))),
    [regions],
  );
  const persistedRegionIdsRef = useLatestRef(persistedRegionIds);
  const onRegionUpdateRef = useLatestRef(onRegionUpdate);
  const onRegionClickRef = useLatestRef(onRegionClick);
  const onContextMenuRef = useLatestRef(onContextMenu);
  const onInteractStartRef = useLatestRef(onInteractStart);
  const [readyMediaUrl, setReadyMediaUrl] = useState<string | null>(null);
  const [failedMediaUrl, setFailedMediaUrl] = useState<string | null>(null);
  const [loadingState, setLoadingState] = useState({
    mediaUrl,
    progress: 0,
  });
  const [duration, setDuration] = useState(0);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [currentPlaybackRegionId, setCurrentPlaybackRegionId] = useState<string | null>(null);
  const currentPlaybackRegionIdRef = useLatestRef(currentPlaybackRegionId);
  const [visibleRange, setVisibleRange] = useState<{
    mediaUrl: string;
    start: number;
    end: number;
  } | null>(null);
  const visibleRegions = useMemo(() => {
    if (!visibleRange || visibleRange.mediaUrl !== mediaUrl) return [];
    const viewportDuration = Math.max(visibleRange.end - visibleRange.start, 1);
    const overscan = Math.max(30, viewportDuration * 2);
    return selectVisibleRegions(
      timelineIndex,
      Math.max(0, visibleRange.start - overscan),
      visibleRange.end + overscan,
    );
  }, [mediaUrl, timelineIndex, visibleRange]);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;
    const syncCurrentRegion = () => {
      setCurrentPlaybackRegionId(
        findPlaybackRegionId(timelineIndexRef.current, videoElement.currentTime),
      );
    };
    syncCurrentRegion();
    videoElement.addEventListener("timeupdate", syncCurrentRegion);
    videoElement.addEventListener("seeked", syncCurrentRegion);
    return () => {
      videoElement.removeEventListener("timeupdate", syncCurrentRegion);
      videoElement.removeEventListener("seeked", syncCurrentRegion);
    };
  }, [mediaUrl, timelineIndexRef, videoRef]);

  useEffect(() => {
    const container = containerRef.current;
    const timeline = timelineContainerRef.current;
    const videoElement = videoRef.current;
    if (!container || !timeline || !videoElement) return;

    let cancelled = false;
    let runtime: WaveformRuntime | null = null;
    let lastVisibleStart = Number.NEGATIVE_INFINITY;
    const updateDimensions = (nextDuration: number) => {
      setReadyMediaUrl(mediaUrl);
      setDuration(nextDuration);
      setScrollWidth(container.scrollWidth);
      setVisibleRange({
        mediaUrl,
        start: 0,
        end: Math.min(nextDuration, Math.max(container.clientWidth / zoomRef.current, 1)),
      });
    };
    void editorService.getWaveformPeaks({ video_ref: video }).then((waveform) => {
      if (cancelled) return;
      setLoadingState({ mediaUrl, progress: 90 });
      runtime = createWaveformRuntime({
        container,
        timelineContainer: timeline,
        video: videoElement,
        peaks: waveform.peaks,
        duration: waveform.duration,
        zoom: zoomRef.current,
        isPersistedRegion: (id) => persistedRegionIdsRef.current.has(id),
        getTempRegionId: () => currentTempRegionId.current,
        setTempRegionId: (id) => { currentTempRegionId.current = id; },
        onRegionUpdate: (...args) => onRegionUpdateRef.current(...args),
        onRegionClick: (...args) => onRegionClickRef.current(...args),
        onContextMenu: (...args) => onContextMenuRef.current(...args),
        onInteractStart: () => onInteractStartRef.current?.(),
        onReady: updateDimensions,
        onScroll: (scroll) => {
          if (scrollOwner.current === "top") return;
          const scrollContainer = scrollContainerRef.current;
          if (!scrollContainer) return;
          scrollOwner.current = "wave";
          scrollContainer.scrollLeft = scroll;
          setTimeout(() => {
            if (scrollOwner.current === "wave") scrollOwner.current = null;
          }, 100);
        },
        onVisibleRange: (start, end) => {
          const updateThreshold = Math.max((end - start) / 4, 1);
          if (Math.abs(start - lastVisibleStart) < updateThreshold) return;
          lastVisibleStart = start;
          setVisibleRange({ mediaUrl, start, end });
        },
        onError: (error) => {
          console.error("Waveform error", error);
          setFailedMediaUrl(mediaUrl);
        },
        onLoading: (progress) => setLoadingState({ mediaUrl, progress }),
      });
      runtimeRef.current = runtime;
      setLoadingState({ mediaUrl, progress: 100 });
    }).catch((error: unknown) => {
      if (cancelled) return;
      console.error("Waveform peak generation failed", error);
      setFailedMediaUrl(mediaUrl);
    });
    return () => {
      cancelled = true;
      runtime?.destroy();
      if (runtimeRef.current === runtime) runtimeRef.current = null;
      baseRegionColorsRef.current = new Map();
      highlightedRegionIdRef.current = null;
    };
  }, [mediaUrl, onContextMenuRef, onInteractStartRef, onRegionClickRef, onRegionUpdateRef, persistedRegionIdsRef, video, videoRef, zoomRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateWidth = () => setScrollWidth(container.scrollWidth);
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container.firstElementChild ?? container);
    window.addEventListener("resize", updateWidth);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, [readyMediaUrl, zoom]);

  useEffect(() => {
    const plugin = runtimeRef.current?.regionsPlugin;
    if (!plugin || readyMediaUrl !== mediaUrl) return;
    baseRegionColorsRef.current = syncWaveformRegions({
      plugin,
      regions: visibleRegions,
      selectedIds,
      activeSegmentId,
      currentTempRegionId: currentTempRegionId.current,
    });
    applyPlaybackRegionHighlight({
      plugin,
      baseColors: baseRegionColorsRef.current,
      previousId: null,
      currentId: currentPlaybackRegionIdRef.current,
    });
    highlightedRegionIdRef.current = currentPlaybackRegionIdRef.current;
  }, [activeSegmentId, currentPlaybackRegionIdRef, mediaUrl, readyMediaUrl, selectedIds, visibleRegions]);

  useEffect(() => {
    const plugin = runtimeRef.current?.regionsPlugin;
    if (!plugin || readyMediaUrl !== mediaUrl) return;
    applyPlaybackRegionHighlight({
      plugin,
      baseColors: baseRegionColorsRef.current,
      previousId: highlightedRegionIdRef.current,
      currentId: currentPlaybackRegionId,
    });
    highlightedRegionIdRef.current = currentPlaybackRegionId;
  }, [currentPlaybackRegionId, mediaUrl, readyMediaUrl]);

  useEffect(() => {
    const wavesurfer = runtimeRef.current?.wavesurfer;
    if (!wavesurfer) return;
    try {
      wavesurfer.zoom(zoom);
    } catch {
      // WaveSurfer may reject zoom while media is being replaced.
    }
  }, [zoom]);

  useEffect(() => {
    runtimeRef.current?.wavesurfer.setOptions({ autoScroll, autoCenter: autoScroll });
  }, [autoScroll]);

  const onTopScroll = (event: React.UIEvent<HTMLDivElement>) => {
    if (scrollOwner.current === "wave") return;
    const wavesurfer = runtimeRef.current?.wavesurfer;
    if (!wavesurfer) return;
    scrollOwner.current = "top";
    wavesurfer.setScroll(event.currentTarget.scrollLeft);
    setTimeout(() => {
      if (scrollOwner.current === "top") scrollOwner.current = null;
    }, 100);
  };

  const isReady = readyMediaUrl === mediaUrl;
  const hasError = failedMediaUrl === mediaUrl;
  const loadProgress = loadingState.mediaUrl === mediaUrl
    ? loadingState.progress
    : 0;

  return {
    containerRef,
    timelineContainerRef,
    scrollContainerRef,
    zoom,
    zoomIn: () => setZoom((value) => Math.min(200, value + 10)),
    zoomOut: () => setZoom((value) => Math.max(5, value - 10)),
    isReady,
    hasError,
    loadProgress,
    duration,
    scrollWidth,
    currentPlaybackRegionId,
    onTopScroll,
  };
}
