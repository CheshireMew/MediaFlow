import type React from "react";

type PreviewMediaElementProps = {
  mediaUrl: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isFrameReady: boolean;
  viewportMetrics: {
    contentWidthPercent: number;
    contentHeightPercent: number;
    contentOffsetXPercent: number;
    contentOffsetYPercent: number;
  };
  videoEvents: React.VideoHTMLAttributes<HTMLVideoElement>;
};

export function PreviewMediaElement({
  mediaUrl,
  videoRef,
  isFrameReady,
  viewportMetrics,
  videoEvents,
}: PreviewMediaElementProps) {
  return (
    <div
      className="absolute inset-0"
      style={{
        width: `${viewportMetrics.contentWidthPercent}%`,
        height: `${viewportMetrics.contentHeightPercent}%`,
        left: `${viewportMetrics.contentOffsetXPercent}%`,
        top: `${viewportMetrics.contentOffsetYPercent}%`,
      }}
    >
      <video
        key={mediaUrl}
        ref={videoRef}
        src={mediaUrl}
        preload="auto"
        playsInline
        className={`block w-full h-full transition-opacity duration-150 ${
          isFrameReady ? "opacity-100" : "opacity-0"
        }`}
        {...videoEvents}
      />
    </div>
  );
}
