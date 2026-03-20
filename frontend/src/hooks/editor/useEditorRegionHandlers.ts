import { useCallback, useMemo, useRef, useEffect } from "react";
import type { SubtitleSegment } from "../../types/task";

type RegionClickEvent = {
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey?: boolean;
  seek?: boolean;
};

type UseEditorRegionHandlersArgs = {
  regions: SubtitleSegment[];
  activeSegmentId: string | null;
  selectSegment: (id: string, multi?: boolean, shift?: boolean) => void;
  updateRegion: (
    id: string,
    updates: Partial<Pick<SubtitleSegment, "start" | "end" | "text">>,
  ) => void;
  updateRegionText: (id: string, text: string) => void;
  snapshot: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
};

export function useEditorRegionHandlers({
  regions,
  activeSegmentId,
  selectSegment,
  updateRegion,
  updateRegionText,
  snapshot,
  videoRef,
}: UseEditorRegionHandlersArgs) {
  const regionsRef = useRef(regions);

  useEffect(() => {
    regionsRef.current = regions;
  }, [regions]);

  const displaySegment = useMemo(
    () => regions.find((region) => region.id === activeSegmentId),
    [activeSegmentId, regions],
  );

  const handleRegionClick = useCallback(
    (id: string, event?: MouseEvent | RegionClickEvent) => {
      const shiftKey = event ? ("shiftKey" in event ? Boolean(event.shiftKey) : false) : false;
      const seek = event ? ("seek" in event ? Boolean(event.seek) : false) : false;
      selectSegment(id, event?.ctrlKey || event?.metaKey || false, shiftKey);

      if (seek && videoRef.current) {
        const segment = regionsRef.current.find((region) => region.id === id);
        if (segment) {
          videoRef.current.currentTime = segment.start;
        }
      }
    },
    [selectSegment, videoRef],
  );

  const handleDetailUpdate = useCallback(
    (field: "start" | "end" | "text", value: string | number) => {
      if (!displaySegment) {
        return;
      }

      const id = String(displaySegment.id);
      if (field === "text") {
        updateRegionText(id, value as string);
        return;
      }

      snapshot();
      updateRegion(id, { [field]: value });
    },
    [displaySegment, snapshot, updateRegion, updateRegionText],
  );

  const handleRegionUpdateCallback = useCallback(
    (id: string, start: number, end: number) => {
      updateRegion(id, { start, end });
    },
    [updateRegion],
  );

  const handleFindReplaceSelectSegment = useCallback(
    (id: string) => {
      selectSegment(id, false, false);
    },
    [selectSegment],
  );

  const handleFindReplaceUpdateSegment = useCallback(
    (id: string, text: string) => {
      updateRegionText(id, text);
    },
    [updateRegionText],
  );

  return {
    displaySegment,
    handleRegionClick,
    handleDetailUpdate,
    handleRegionUpdateCallback,
    handleFindReplaceSelectSegment,
    handleFindReplaceUpdateSegment,
    regionsRef,
  };
}
