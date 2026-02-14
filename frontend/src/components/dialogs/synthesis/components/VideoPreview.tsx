// ── Video Preview + Overlays + Drag + Toolbar ──
import React, { useState, useRef, useEffect } from 'react';
import { Play, X, ChevronDown, Settings2, Download, Scissors } from 'lucide-react';
import type { SubtitleStyleState } from '../hooks/useSubtitleStyle';
import type { WatermarkState } from '../hooks/useWatermark';
import type { OutputSettingsState } from '../hooks/useOutputSettings';
import type { CropState } from '../hooks/useCrop';
import { CropOverlay } from './CropOverlay';

interface Props {
    mediaUrl: string | null;
    style: SubtitleStyleState;
    watermark: WatermarkState;
    output: OutputSettingsState;
    crop: CropState;
    onClose: () => void;
    onSynthesizeClick: () => void;
    isSynthesizing: boolean;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    videoSize: { w: number; h: number };
    setVideoSize: (v: { w: number; h: number }) => void;
    currentTime: number;
    onTimeUpdate: (time: number) => void;
}

export const VideoPreview: React.FC<Props> = ({
    mediaUrl, style, watermark, output, crop, onClose,
    onSynthesizeClick, isSynthesizing,
    videoRef, videoSize, setVideoSize,
    currentTime, onTimeUpdate,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [dragging, setDragging] = useState<'wm' | 'sub' | null>(null);
    const [isTrimOpen, setIsTrimOpen] = useState(false);

    // --- Drag Logic ---
    const handleDragStart = (e: React.MouseEvent, type: 'wm' | 'sub') => {
        e.preventDefault();
        setDragging(type);
    };

    // Use window-level listeners so drag continues even if mouse leaves the preview area
    // Optimize: Depend on stable setters to avoid re-binding listeners on every render
    const { setWmPos } = watermark;
    const { setSubPos } = style;

    useEffect(() => {
        if (!dragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!containerRef.current) return;

            const rect = containerRef.current.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width;
            const y = (e.clientY - rect.top) / rect.height;

            const cx = Math.max(0, Math.min(1, x));
            const cy = Math.max(0, Math.min(1, y));

            if (dragging === 'wm') {
                setWmPos({ x: cx, y: cy });
            } else if (dragging === 'sub') {
                setSubPos({ x: 0.5, y: cy });
            }
        };

        const handleMouseUp = () => {
            setDragging(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragging, setWmPos, setSubPos]);

    // Destructure for readability
    const {
        fontSize, fontColor, fontName, isBold, isItalic,
        outlineSize, shadowSize, outlineColor,
        bgEnabled, bgColor, bgOpacity, bgPadding, alignment,
        subPos, currentSubtitle,
    } = style;

    const {
        watermarkPreviewUrl, wmScale, wmOpacity, wmPos,
    } = watermark;

    const {
        quality, setQuality, isQualityMenuOpen, setIsQualityMenuOpen,
        trimStart, setTrimStart, trimEnd, setTrimEnd,
    } = output;

    return (
        <div
            className="flex-1 flex flex-col bg-[#050505] relative min-w-0"
        >
            {/* Toolbar */}
            <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-[#1a1a1a] shrink-0">
                <div className="flex items-center gap-4">
                    <span className="text-slate-400 text-xs font-medium bg-white/5 px-2 py-1 rounded border border-white/5">
                        Preview Mode
                    </span>
                </div>
                <div className="flex items-center gap-4">
                    {/* Custom Quality Selector */}
                    <div className="relative">
                        <button
                            onClick={() => setIsQualityMenuOpen(!isQualityMenuOpen)}
                            className="flex items-center gap-2 bg-black/20 hover:bg-white/5 border border-white/5 hover:border-white/10 rounded-lg pl-3 pr-2 py-1.5 transition-all outline-none focus:ring-1 focus:ring-indigo-500/50 group"
                        >
                            <div className="flex flex-col items-start gap-0.5">
                                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider leading-none">Quality</span>
                                <span className="text-xs text-slate-200 font-medium leading-none group-hover:text-white transition-colors">
                                    {quality === 'high' ? 'High Quality' : quality === 'balanced' ? 'Balanced' : 'Low Size'}
                                </span>
                            </div>
                            <ChevronDown size={14} className={`text-slate-500 transition-transform duration-200 ${isQualityMenuOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isQualityMenuOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setIsQualityMenuOpen(false)} />
                                <div className="absolute top-full mt-2 right-0 w-56 bg-[#161616] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 py-1 ring-1 ring-black/50 animate-in fade-in zoom-in-95 duration-100">
                                    {[
                                        { id: 'high', label: 'High Quality', desc: 'CRF 17 (Visually Lossless)' },
                                        { id: 'balanced', label: 'Balanced', desc: 'CRF 20 (Recommended)' },
                                        { id: 'small', label: 'Small Size', desc: 'CRF 26 (Compressed)' }
                                    ].map(opt => (
                                        <button
                                            key={opt.id}
                                            onClick={() => {
                                                setQuality(opt.id as any);
                                                setIsQualityMenuOpen(false);
                                            }}
                                            className={`w-full text-left px-4 py-2.5 flex items-start gap-3 hover:bg-white/5 transition-colors ${quality === opt.id ? 'bg-indigo-500/10' : ''}`}
                                        >
                                            <div className={`mt-0.5 w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                                                quality === opt.id ? 'border-indigo-500 bg-indigo-500' : 'border-slate-600'
                                            }`}>
                                                {quality === opt.id && <div className="w-1 h-1 bg-white rounded-full" />}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className={`text-xs font-medium ${quality === opt.id ? 'text-indigo-300' : 'text-slate-200'}`}>
                                                    {opt.label}
                                                </span>
                                                <span className="text-[10px] text-slate-500">
                                                    {opt.desc}
                                                </span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    <div className="h-4 w-[1px] bg-white/10" />
                    
                    {/* Trim Toggle */}
                    <button
                        onClick={() => setIsTrimOpen(!isTrimOpen)}
                        className={`p-1.5 rounded-lg transition-all ${isTrimOpen ? 'bg-indigo-500/20 text-indigo-400' : 'hover:bg-white/10 text-slate-400 hover:text-white'}`}
                        title="Trim Video"
                    >
                        <Scissors size={18} />
                    </button>

                    {/* Crop Toggle */}
                    <button
                        onClick={() => crop.setIsEnabled(!crop.isEnabled)}
                        className={`p-1.5 rounded-lg transition-all ${crop.isEnabled ? 'bg-indigo-500/20 text-indigo-400' : 'hover:bg-white/10 text-slate-400 hover:text-white'}`}
                        title="Crop Video"
                    >
                        <div className="relative">
                            <div className="absolute inset-0 border-2 border-current opacity-50 rounded-sm"></div>
                            <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-current"></div>
                            <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-current"></div>
                            <div className="w-4 h-4" />
                        </div>
                    </button>

                    <div className="h-4 w-[1px] bg-white/10" />
                    <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-all">
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Trim Controls Panel */}
            {isTrimOpen && (
                <div className="bg-[#1a1a1a] border-b border-white/5 px-6 py-3 flex items-center gap-6 animate-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center gap-3 text-xs">
                        <span className="text-slate-400 font-medium w-8">Start:</span>
                        <div className="flex items-center gap-1">
                            <input
                                type="number"
                                min={0}
                                max={trimEnd || videoRef.current?.duration || 100}
                                step={0.1}
                                value={trimStart}
                                onChange={(e) => setTrimStart(Number(e.target.value))}
                                className="bg-black/20 border border-white/10 rounded px-2 py-1 w-16 text-slate-200 focus:border-indigo-500 outline-none"
                            />
                            <span className="text-slate-500">s</span>
                            <button 
                                onClick={() => setTrimStart(Number(currentTime.toFixed(1)))}
                                className="ml-2 px-2 py-1 bg-white/5 hover:bg-white/10 rounded border border-white/5 text-slate-300 hover:text-white transition-colors"
                            >
                                Set Current
                            </button>
                        </div>
                    </div>

                    <div className="h-4 w-[1px] bg-white/5" />

                    <div className="flex items-center gap-3 text-xs">
                        <span className="text-slate-400 font-medium w-8">End:</span>
                        <div className="flex items-center gap-1">
                            <input
                                type="number"
                                min={trimStart}
                                max={videoRef.current?.duration || 10000}
                                step={0.1}
                                value={trimEnd}
                                onChange={(e) => setTrimEnd(Number(e.target.value))}
                                className="bg-black/20 border border-white/10 rounded px-2 py-1 w-16 text-slate-200 focus:border-indigo-500 outline-none"
                            />
                            <span className="text-slate-500">s</span>
                            <button 
                                onClick={() => setTrimEnd(Number(currentTime.toFixed(1)))}
                                className="ml-2 px-2 py-1 bg-white/5 hover:bg-white/10 rounded border border-white/5 text-slate-300 hover:text-white transition-colors"
                            >
                                Set Current
                            </button>
                        </div>
                    </div>
                     <div className="h-4 w-[1px] bg-white/5" />
                     <button 
                        onClick={() => { setTrimStart(0); setTrimEnd(0); }}
                        className="text-xs text-slate-500 hover:text-red-400 underline decoration-slate-700 hover:decoration-red-400/50 underline-offset-2 transition-colors"
                    >
                        Reset
                    </button>
                </div>
            )}

            {/* Output Preview Container */}
            <div className="flex-1 relative flex items-center justify-center bg-[url('/grid.svg')] bg-repeat opacity-100 overflow-hidden p-8">
                {/* The Video Container that matches aspect ratio */}
                <div 
                    ref={containerRef}
                    className="relative shadow-2xl shadow-black/50 border border-white/10 bg-black rounded-lg overflow-hidden ring-1 ring-white/5"
                    style={{
                        width: videoSize.w ? undefined : '100%',
                        height: videoSize.w ? undefined : '100%',
                        aspectRatio: videoSize.w ? `${videoSize.w}/${videoSize.h}` : undefined,
                        maxWidth: '100%',
                        maxHeight: '100%'
                    }}
                >
                    {mediaUrl ? (
                        <video 
                            ref={videoRef}
                            src={mediaUrl}
                            className="w-full h-full object-contain block"
                            onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
                            onLoadedMetadata={(e) => {
                                const t = e.currentTarget;
                                setVideoSize({ w: t.videoWidth, h: t.videoHeight });
                            }}
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full w-full text-slate-600 bg-white/[0.02]">
                            <Play size={48} className="opacity-20 mb-4"/>
                            <span className="text-sm font-medium">No Media Loaded</span>
                        </div>
                    )}

                    {/* --- Overlays Layer --- */}
                    
                    {/* Crop Overlay */}
                    {crop.isEnabled && (
                        <CropOverlay 
                            crop={crop.crop} 
                            setCrop={crop.setCrop} 
                            containerRef={containerRef} 
                        />
                    )}
                    
                    {/* Watermark Overlay */}
                    {watermarkPreviewUrl && (
                        <div
                            className="absolute cursor-move select-none group"
                            style={{
                                left: `${wmPos.x * 100}%`,
                                top: `${wmPos.y * 100}%`,
                                width: `${wmScale * 100}%`,
                                opacity: wmOpacity,
                                zIndex: 20,
                                transform: 'translate(-50%, -50%)',
                                border: dragging === 'wm' ? '1px dashed #6366f1' : '1px dashed transparent',
                                boxShadow: dragging === 'wm' ? '0 0 0 1000px rgba(0,0,0,0.5)' : 'none'
                            }}
                            onMouseDown={(e) => handleDragStart(e, 'wm')}
                        >
                            <img 
                                src={watermarkPreviewUrl} 
                                className="w-full h-auto pointer-events-none drop-shadow-lg"
                                alt="Watermark"
                            />
                            <div className="absolute inset-0 border border-indigo-500/50 opacity-0 group-hover:opacity-100 pointer-events-none rounded transition-opacity"></div>
                        </div>
                    )}
                    
                    {/* Subtitle Overlay */}
                    <div 
                        className="absolute left-0 right-0 cursor-move select-none group transition-colors px-6"
                        style={{ 
                            top: `${subPos.y * 100}%`,
                            transform: 'translateY(-50%)',
                            zIndex: 30,
                            textAlign: alignment === 1 ? 'left' : alignment === 3 ? 'right' : 'center',
                        }}
                        onMouseDown={(e) => handleDragStart(e, 'sub')}
                    >
                        {(currentSubtitle || dragging === 'sub') && (
                            <span 
                                className={`
                                    inline-block rounded text-lg md:text-xl leading-relaxed max-w-full break-words
                                    transition-all duration-75
                                    ${dragging === 'sub' ? 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-black/50' : 'group-hover:ring-1 group-hover:ring-white/30'}
                                `}
                                style={{ 
                                    fontSize: `${fontSize}px`, 
                                    color: fontColor,
                                    fontFamily: `"${fontName}", sans-serif`,
                                    fontWeight: isBold ? 'bold' : 'normal',
                                    fontStyle: isItalic ? 'italic' : 'normal',
                                    fontSynthesis: 'style',
                                    WebkitTextStroke: outlineSize > 0 ? `${outlineSize}px ${outlineColor}` : undefined,
                                    paintOrder: 'stroke fill',
                                    textShadow: shadowSize > 0
                                        ? `${shadowSize * 1.5}px ${shadowSize * 1.5}px ${shadowSize}px rgba(0,0,0,0.85)`
                                        : undefined,
                                    backgroundColor: bgEnabled
                                        ? `${bgColor}${Math.round(bgOpacity * 255).toString(16).padStart(2, '0')}`
                                        : 'transparent',
                                    padding: bgEnabled
                                        ? `${Math.max(2, bgPadding * 0.6)}px ${Math.max(4, bgPadding * 1.2)}px`
                                        : '8px 16px',
                                }}
                            >
                                {currentSubtitle || "(Subtitle Position)"}
                            </span>
                        )}
                    </div>
                </div>
            </div>
            
            {/* Time Seeker & Action Bar */}
            <div className="h-16 bg-[#1a1a1a] border-t border-white/5 px-6 flex items-center gap-6 shrink-0 relative z-20">
                <button 
                    onClick={() => {
                        if (videoRef.current?.paused) videoRef.current.play();
                        else videoRef.current?.pause();
                    }}
                    className="w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-full text-slate-200 border border-white/5 hover:border-white/20 transition-all active:scale-95"
                >
                    <Play size={18} fill="currentColor" className="ml-0.5"/>
                </button>
                
                <div className="flex-1 flex flex-col justify-center gap-1.5 pt-1">
                     <input 
                        type="range"
                        min="0"
                        max={videoRef.current?.duration || 100}
                        value={currentTime}
                        onChange={(e) => {
                            const t = Number(e.target.value);
                            onTimeUpdate(t);
                            if (videoRef.current) videoRef.current.currentTime = t;
                        }}
                        className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400"
                    />
                    <div className="flex justify-between px-0.5">
                        <span className="text-[10px] text-slate-500 font-mono">
                            {currentTime.toFixed(1)}s
                        </span>
                        <span className="text-[10px] text-slate-600 font-mono">
                            {videoRef.current?.duration?.toFixed(1) || '--'}s
                        </span>
                    </div>
                </div>
                
                <div className="h-8 w-[1px] bg-white/5 mx-2" />
                
                <button 
                    onClick={onSynthesizeClick}
                    disabled={isSynthesizing}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all active:scale-95"
                >
                    {isSynthesizing ? <Settings2 className="animate-spin" size={18}/> : <Download size={18}/>}
                    <span>Start Render</span>
                </button>
            </div>
        </div>
    );
};
