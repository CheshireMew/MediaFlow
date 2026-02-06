
import { Clapperboard, Scissors } from "lucide-react";
import React, { RefObject } from "react";
import type { SubtitleSegment } from "../../types/task";

interface VideoPreviewProps {
    mediaUrl: string | null;
    videoRef: RefObject<HTMLVideoElement | null>; // Relaxed type to match useRef(null) inference
    currentTime: number;
    regions: SubtitleSegment[];
    activeSegmentId: string | null;
    handleTimeUpdate: () => void;
    splitSegment: (time: number) => void;
}

export function VideoPreview({
    mediaUrl,
    videoRef,
    currentTime,
    regions,
    activeSegmentId,
    handleTimeUpdate,
    splitSegment
}: VideoPreviewProps) {
    return (
        <div className="flex-1 bg-black flex flex-col relative justify-center items-center">
            {mediaUrl ? (
                <div className="w-full h-full relative p-4 flex flex-col">
                    <div className="flex-1 relative flex items-center justify-center bg-black/50 rounded-lg overflow-hidden border border-slate-800">
                        <video 
                           ref={videoRef as any}
                           src={mediaUrl}
                           className="max-w-full max-h-full shadow-2xl"
                           controls={false} 
                           onTimeUpdate={handleTimeUpdate}
                           onClick={() => {
                               if(videoRef.current?.paused) videoRef.current.play();
                               else videoRef.current?.pause();
                           }}
                        />
                        {/* Overlay Subtitles */}
                        <div className="absolute bottom-8 left-0 right-0 text-center pointer-events-none">
                            <span className="bg-black/60 text-white px-2 py-1 rounded text-lg font-medium shadow-sm backdrop-blur-sm">
                                {regions.find(r => currentTime >= r.start && currentTime < r.end)?.text || ""}
                            </span>
                        </div>
                    </div>
                    
                    {/* Mini Controls */}
                    <div className="h-12 flex items-center justify-center gap-4 bg-slate-900 border-t border-slate-800 mt-2 rounded-lg">
                        <span className="font-mono text-cyan-400 text-sm">
                            {new Date(currentTime * 1000).toISOString().substr(11, 8)}
                        </span>
                        <button
                          onClick={() => videoRef.current && splitSegment(videoRef.current.currentTime)}
                          disabled={!activeSegmentId}
                          className="flex items-center gap-1 text-xs bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded disabled:opacity-50"
                          title="Split at Current Time"
                        >
                            <Scissors size={14} /> Split
                        </button>
                    </div>
                </div>
            ) : (
                <div className="text-slate-600 flex flex-col items-center">
                    <Clapperboard size={48} className="mb-4 opacity-50" />
                    <p>No media loaded</p>
                </div>
            )}
        </div>
    );
}
