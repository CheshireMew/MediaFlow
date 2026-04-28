import { useEffect, useState } from "react";
import type React from "react";

export function usePreviewFrameMetrics(
  frameRef: React.RefObject<HTMLDivElement | null>,
  mediaUrl: string | null,
) {
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }

    const measure = () => {
      setFrameSize({
        width: frame.clientWidth || 0,
        height: frame.clientHeight || 0,
      });
    };

    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [frameRef, mediaUrl]);

  return frameSize;
}
