import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";
import TimelinePlugin from "wavesurfer.js/dist/plugins/timeline.esm.js";
import HoverPlugin from "wavesurfer.js/dist/plugins/hover.esm.js";

export type WaveformRuntime = {
  wavesurfer: WaveSurfer;
  regionsPlugin: RegionsPlugin;
  destroy: () => void;
};

export function createWaveformRuntime({
  container,
  timelineContainer,
  video,
  peaks,
  duration,
  zoom,
  isPersistedRegion,
  getTempRegionId,
  setTempRegionId,
  onRegionUpdate,
  onRegionClick,
  onContextMenu,
  onInteractStart,
  onReady,
  onScroll,
  onVisibleRange,
  onError,
  onLoading,
}: {
  container: HTMLDivElement;
  timelineContainer: HTMLDivElement;
  video: HTMLVideoElement;
  peaks: Array<Float32Array | number[]>;
  duration: number;
  zoom: number;
  isPersistedRegion: (id: string) => boolean;
  getTempRegionId: () => string | null;
  setTempRegionId: (id: string | null) => void;
  onRegionUpdate: (id: string, start: number, end: number) => void;
  onRegionClick: (id: string, event: MouseEvent) => void;
  onContextMenu: (event: MouseEvent, id: string, region: { start: number; end: number }) => void;
  onInteractStart: () => void;
  onReady: (duration: number) => void;
  onScroll: (scroll: number) => void;
  onVisibleRange: (start: number, end: number) => void;
  onError: (error: Error) => void;
  onLoading: (progress: number) => void;
}): WaveformRuntime {
  const wavesurfer = WaveSurfer.create({
    container,
    waveColor: "#4F46E5",
    progressColor: "#818cf8",
    cursorColor: "#38bdf8",
    cursorWidth: 2,
    height: container.clientHeight,
    minPxPerSec: zoom,
    media: video,
    peaks,
    duration,
    hideScrollbar: true,
    dragToSeek: false,
    plugins: [
      TimelinePlugin.create({ container: timelineContainer }),
      HoverPlugin.create({
        lineColor: "rgba(255, 255, 255, 0.5)",
        lineWidth: 2,
        labelSize: "11px",
        labelColor: "#fff",
      }),
    ],
  });
  const regionsPlugin = RegionsPlugin.create();
  wavesurfer.registerPlugin(regionsPlugin);
  regionsPlugin.enableDragSelection({ color: "rgba(255, 255, 255, 0.2)" }, 10);

  let isDragging = false;
  regionsPlugin.on("region-created", (region) => {
    const isPersisted = isPersistedRegion(region.id);
    region.element?.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      onContextMenu(event, region.id, { start: region.start, end: region.end });
    });
    if (!isPersisted) {
      const previousId = getTempRegionId();
      if (previousId && previousId !== region.id) {
        regionsPlugin.getRegions().find((item) => item.id === previousId)?.remove();
      }
      setTempRegionId(region.id);
    }
  });
  regionsPlugin.on("region-update", () => {
    if (!isDragging) {
      isDragging = true;
      onInteractStart();
    }
  });
  regionsPlugin.on("region-updated", (region) => {
    isDragging = false;
    if (isPersistedRegion(region.id)) {
      onRegionUpdate(region.id, region.start, region.end);
    }
  });
  regionsPlugin.on("region-clicked", (region, event) => onRegionClick(region.id, event));
  wavesurfer.on("click", () => {
    const tempId = getTempRegionId();
    if (!tempId) return;
    regionsPlugin.getRegions().find((item) => item.id === tempId)?.remove();
    setTempRegionId(null);
  });
  wavesurfer.on("ready", () => onReady(wavesurfer.getDuration()));
  wavesurfer.on("decode", () => onReady(wavesurfer.getDuration()));
  wavesurfer.on("scroll", (start, end) => {
    onScroll(wavesurfer.getScroll());
    onVisibleRange(start, end);
  });
  wavesurfer.on("error", onError);
  wavesurfer.on("loading", onLoading);

  return {
    wavesurfer,
    regionsPlugin,
    destroy: () => {
      regionsPlugin.destroy();
      wavesurfer.destroy();
    },
  };
}
