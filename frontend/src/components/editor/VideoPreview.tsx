import { Clapperboard } from "lucide-react";
import React, { type RefObject, useState, useCallback, useMemo } from "react";
import type { SubtitleSegment } from "../../types/task";

interface VideoPreviewProps {
    mediaUrl: string | null;
    videoRef: RefObject<HTMLVideoElement | null>;
    regions: SubtitleSegment[];
    onLoadedMetadata?: () => void;
}

function VideoPreviewComponent({
    mediaUrl,
    videoRef,
    regions,
    onLoadedMetadata
}: VideoPreviewProps) {
    // 内部管理时间状态，不传递给父组件
    const [currentTime, setCurrentTime] = useState(0);

    const handleTimeUpdate = useCallback(() => {
        if (videoRef.current) {
            setCurrentTime(videoRef.current.currentTime);
        }
    }, [videoRef]);

    // 缓存当前字幕，避免每次渲染都遍历
    const currentSubtitle = useMemo(() => 
        regions.find(r => currentTime >= r.start && currentTime < r.end)?.text || "",
        [regions, currentTime]
    );

    const [hasError, setHasError] = useState(false);

    // Reset error when url changes
    React.useEffect(() => {
        setHasError(false);
    }, [mediaUrl]);

    const handleError = () => {
        setHasError(true);
    };

    return (
        <div className="flex-1 bg-black/40 flex flex-col relative justify-center items-center backdrop-blur-sm">
            {mediaUrl && !hasError ? (
                <div className="w-full h-full relative p-6 flex flex-col">
                    <div className="flex-1 relative flex items-center justify-center bg-black/50 rounded-2xl overflow-hidden border border-white/5 shadow-2xl ring-1 ring-white/5">
                        <video 
                           key={mediaUrl}
                           ref={videoRef as any}
                           src={mediaUrl}
                           className="max-w-full max-h-full shadow-2xl"
                           controls={true}
                           onTimeUpdate={handleTimeUpdate}
                           onLoadedMetadata={onLoadedMetadata}
                           onError={handleError}
                        />
                        {/* Overlay Subtitles (Improved Typography) */}
                        <div className="absolute bottom-16 left-0 right-0 text-center pointer-events-none px-12">
                            {currentSubtitle && (
                                <span className="inline-block bg-black/60 text-white/95 px-6 py-3 rounded-xl text-lg md:text-xl font-medium shadow-lg backdrop-blur-md border border-white/10 leading-relaxed max-w-full break-words">
                                    {currentSubtitle}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="text-slate-500/50 flex flex-col items-center gap-4">
                    <div className="p-6 rounded-3xl bg-white/[0.02] border border-white/5 shadow-inner">
                        <Clapperboard size={64} className="opacity-20" />
                    </div>
                    <p className="text-sm font-medium tracking-wide opacity-60">
                        {hasError ? "Media failed to load" : "No media loaded"}
                    </p>
                </div>
            )}
        </div>
    );
}

export const VideoPreview = React.memo(VideoPreviewComponent);
