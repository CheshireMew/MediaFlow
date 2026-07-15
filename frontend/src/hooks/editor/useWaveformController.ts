import { useEffect, useRef, useState } from "react";
import type React from "react";

import { createWaveformRuntime, type WaveformRuntime } from "../../components/editor/waveform/waveSurferRuntime";
import { syncWaveformRegions } from "../../components/editor/waveform/regionSync";
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
  const currentTempRegionId = useRef<string | null>(null);
  const scrollOwner = useRef<"top" | "wave" | null>(null);
  const [zoom, setZoom] = useState(80);
  const zoomRef = useLatestRef(zoom);
  const regionsRef = useLatestRef(regions);
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

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const syncCurrentRegion = () => {
      const current = regionsRef.current.find(
        (region) => video.currentTime >= region.start && video.currentTime < region.end,
      );
      setCurrentPlaybackRegionId(current ? String(current.id) : null);
    };
    syncCurrentRegion();
    video.addEventListener("timeupdate", syncCurrentRegion);
    video.addEventListener("seeked", syncCurrentRegion);
    return () => {
      video.removeEventListener("timeupdate", syncCurrentRegion);
      video.removeEventListener("seeked", syncCurrentRegion);
    };
  }, [mediaUrl, regionsRef, videoRef]);

  useEffect(() => {
    const container = containerRef.current;
    const timeline = timelineContainerRef.current;
    const video = videoRef.current;
    if (!container || !timeline || !video) return;

    const updateDimensions = (nextDuration: number) => {
      setReadyMediaUrl(mediaUrl);
      setDuration(nextDuration);
      setScrollWidth(container.scrollWidth);
    };
    const runtime = createWaveformRuntime({
      container,
      timelineContainer: timeline,
      video,
      zoom: zoomRef.current,
      getRegions: () => regionsRef.current,
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
      onError: (error) => {
        console.error("Waveform error", error);
        setFailedMediaUrl(mediaUrl);
      },
      onLoading: (progress) => setLoadingState({ mediaUrl, progress }),
    });
    runtimeRef.current = runtime;
    return () => {
      runtime.destroy();
      if (runtimeRef.current === runtime) runtimeRef.current = null;
    };
  }, [mediaUrl, onContextMenuRef, onInteractStartRef, onRegionClickRef, onRegionUpdateRef, regionsRef, videoRef, zoomRef]);

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
    syncWaveformRegions({
      plugin,
      regions,
      selectedIds,
      activeSegmentId,
      currentPlaybackRegionId,
      currentTempRegionId: currentTempRegionId.current,
    });
  }, [activeSegmentId, currentPlaybackRegionId, mediaUrl, readyMediaUrl, regions, selectedIds]);

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
