// ── SynthesisDialog — Slim Orchestration Shell ──
// All state logic lives in hooks, all UI sections live in subcomponents.
// This component only handles: hook wiring, handleSynthesize, and dialog layout.

import React, { useState, useRef } from 'react';
import { MonitorPlay } from 'lucide-react';
import type { SubtitleSegment } from '../../types/task';
import { hexToAss } from './synthesis/types';
import { useSubtitleStyle } from './synthesis/hooks/useSubtitleStyle';
import { useWatermark } from './synthesis/hooks/useWatermark';
import { useOutputSettings } from './synthesis/hooks/useOutputSettings';
import { useCrop } from './synthesis/hooks/useCrop';
import { SubtitleStylePanel } from './synthesis/components/SubtitleStylePanel';
import { WatermarkPanel } from './synthesis/components/WatermarkPanel';
import { OutputSettingsPanel } from './synthesis/components/OutputSettingsPanel';
import { VideoPreview } from './synthesis/components/VideoPreview';

interface SynthesisDialogProps {
    isOpen: boolean;
    onClose: () => void;
    regions: SubtitleSegment[];
    videoPath: string | null;
    mediaUrl: string | null;
    onSynthesize?: (options: any, videoPath: string, watermarkPath: string | null) => Promise<void>;
}

export const SynthesisDialog: React.FC<SynthesisDialogProps> = ({ 
    isOpen, onClose, regions, videoPath, mediaUrl, onSynthesize 
}) => {
    // --- Shared refs ---
    const videoRef = useRef<HTMLVideoElement>(null);
    const [videoSize, setVideoSize] = useState({ w: 0, h: 0 });
    const [currentTime, setCurrentTime] = useState(0);
    const [isSynthesizing, setIsSynthesizing] = useState(false);

    // --- Hooks ---
    const style = useSubtitleStyle(isOpen, regions, currentTime);
    const watermark = useWatermark(isOpen, style.isInitialized, videoSize);
    const output = useOutputSettings(isOpen, videoPath, style.isInitialized);
    const crop = useCrop(isOpen);

    // --- Synthesize Action (cross-cutting: reads from all 3 hooks) ---
    const handleSynthesize = async () => {
        if (!videoPath) return;
        
        setIsSynthesizing(true);
        try {
            const marginV = Math.max(0, Math.round((1 - style.subPos.y) * videoSize.h));

            // FFmpeg overlay expressions for watermark position
            const wmXExpr = `main_w*${watermark.wmPos.x}-w/2`;
            const wmYExpr = `main_h*${watermark.wmPos.y}-h/2`;
            
            // Calculate Backend Scale Factor for Watermark
            let backendScale = watermark.wmScale;
            if (videoSize.w > 0 && watermark.watermarkSize.w > 0) {
                backendScale = (videoSize.w * watermark.wmScale) / watermark.watermarkSize.w;
            }

            // Calculate Font Size Scaling (WYSIWYG)
            let outcomeFontSize = style.fontSize;
            if (videoRef.current && videoSize.h > 0) {
                const previewHeight = videoRef.current.clientHeight;
                if (previewHeight > 0) {
                    const ratio = videoSize.h / previewHeight;
                    // FIX: FFmpeg (libass) renders fonts slightly smaller than HTML canvas at the same pixel size.
                    // We add a compensation factor (approx 1.2x) to match WYSIWYG.
                    const COMPENSATION_FACTOR = 1.25; 
                    outcomeFontSize = Math.round(style.fontSize * ratio * COMPENSATION_FACTOR);
                }
            }

            // ASS alpha: 00 = fully opaque, FF = fully transparent
            const bgAlphaHex = Math.round((1 - style.bgOpacity) * 255).toString(16).padStart(2, '0').toUpperCase();

            const options = {
                crf: output.quality === 'high' ? 17 : output.quality === 'balanced' ? 20 : 26,
                preset: output.quality === 'high' ? 'slow' : output.quality === 'balanced' ? 'medium' : 'fast',
                use_gpu: output.useGpu,
                font_name: style.fontName,
                font_size: outcomeFontSize,
                font_color: hexToAss(style.fontColor),
                bold: style.isBold,
                italic: style.isItalic,
                outline: style.bgEnabled ? style.bgPadding : style.outlineSize,
                shadow: style.shadowSize,
                // Final decided styles:
                outline_color: style.bgEnabled ? hexToAss(style.bgColor, bgAlphaHex) : hexToAss(style.outlineColor),
                back_color: style.bgEnabled ? "&H80000000" : hexToAss(style.bgColor, bgAlphaHex), // Shadow
                border_style: style.bgEnabled ? 3 : 1,
                alignment: style.alignment,
                margin_v: marginV,
                wm_x: wmXExpr,
                wm_y: wmYExpr,
                wm_scale: backendScale,
                wm_opacity: watermark.wmOpacity,
                trim_start: output.trimStart > 0 ? output.trimStart : undefined,
                trim_end: output.trimEnd > 0 ? output.trimEnd : undefined,
                video_width: videoSize.w || 1920,
                video_height: videoSize.h || 1080,
            };

            // Mix in Crop Params if enabled
            if (crop.isEnabled) {
                // Convert normalized (0-1) to pixels
                const w = videoSize.w || 1920;
                const h = videoSize.h || 1080;
                
                Object.assign(options, {
                    crop_x: Math.round(crop.crop.x * w),
                    crop_y: Math.round(crop.crop.y * h),
                    crop_w: Math.round(crop.crop.w * w),
                    crop_h: Math.round(crop.crop.h * h),
                });
            }

            if (onSynthesize) {
                let targetPath = null;
                if (output.outputDir && output.outputFilename) {
                    const sep = output.outputDir.includes('\\') ? '\\' : '/';
                    const cleanDir = output.outputDir.endsWith(sep) ? output.outputDir.slice(0, -1) : output.outputDir;
                    targetPath = `${cleanDir}${sep}${output.outputFilename}`;
                }
                
                const finalOptions = {
                    ...options,
                    output_path: targetPath,
                };

                await onSynthesize(finalOptions, videoPath, watermark.watermarkPath);
            }
            
            alert("Synthesis Task Started! Check Task Monitor.");
            onClose();
        } catch (e) {
            console.error(e);
            alert("Failed to start synthesis.");
        } finally {
            setIsSynthesizing(false);
        }
    };


    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div 
                className="bg-[#0a0a0a] w-[95vw] h-[90vh] rounded-2xl border border-white/10 shadow-2xl flex overflow-hidden ring-1 ring-white/5"
                style={{ WebkitAppRegion: 'no-drag' } as any}
            >
                {/* Left: Settings Panel */}
                <div className="w-[340px] bg-[#161616] flex flex-col border-r border-white/5 z-10 shrink-0">
                    <div className="p-6 pb-4">
                        <h2 className="text-xl font-bold flex items-center gap-3 text-white tracking-tight">
                            <div className="p-2 bg-indigo-500/20 rounded-lg">
                                <MonitorPlay size={20} className="text-indigo-400"/>
                            </div>
                            Video Synthesis
                        </h2>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pt-0 flex flex-col gap-6">
                        <SubtitleStylePanel style={style} />
                        <OutputSettingsPanel output={output} />
                        <WatermarkPanel watermark={watermark} />
                    </div>
                </div>

                {/* Right: Preview Area */}
                <VideoPreview
                    mediaUrl={mediaUrl}
                    style={style}
                    watermark={watermark}
                    output={output}
                    crop={crop}
                    onClose={onClose}
                    onSynthesizeClick={handleSynthesize}
                    isSynthesizing={isSynthesizing}
                    videoRef={videoRef}
                    videoSize={videoSize}
                    setVideoSize={setVideoSize}
                    currentTime={currentTime}
                    onTimeUpdate={setCurrentTime}
                />
            </div>
        </div>
    );
};
