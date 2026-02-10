import React, { useState, useEffect, useRef } from 'react';
import { X, Play, MonitorPlay, Image as ImageIcon, Type, Download, Settings2 } from 'lucide-react';
import type { SubtitleSegment } from '../../types/task';
import { apiClient } from '../../api/client';

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
    // --- State ---
    // Subtitle Settings
    const [fontSize, setFontSize] = useState(24);
    const [fontColor, setFontColor] = useState('#FFFFFF');
    // Normalized position (0-1)
    const [subPos, setSubPos] = useState({ x: 0.5, y: 0.90 }); 
    
    // Watermark Settings
    // const [watermarkFile, setWatermarkFile] = useState<File | null>(null); // Removed unused
    const [watermarkPath, setWatermarkPath] = useState<string | null>(null); // Local path for backend
    const [watermarkPreviewUrl, setWatermarkPreviewUrl] = useState<string | null>(null); // Blob URL for frontend preview
    const [wmScale, setWmScale] = useState(0.2);
    const [wmOpacity, setWmOpacity] = useState(0.8);
    // Normalized position (0-1)
    const [wmPos, setWmPos] = useState({ x: 0.5, y: 0.5 }); // Default Center
    
    // Export Settings
    const [quality, setQuality] = useState<'high'|'balanced'|'small'>('balanced');
    const [isSynthesizing, setIsSynthesizing] = useState(false);
    
    // Preview State
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const isInitialized = useRef(false); // Prevents save effects from overwriting on mount
    const [currentTime, setCurrentTime] = useState(0);
    const [currentSubtitle, setCurrentSubtitle] = useState("");
    
    // Video Metadata for Aspect Ratio
    const [videoSize, setVideoSize] = useState({ w: 0, h: 0 }); // 0 means unknown/hidden
    const [watermarkSize, setWatermarkSize] = useState({ w: 0, h: 0 }); // Original dimensions of watermark


    // --- Interaction State ---
    const [dragging, setDragging] = useState<'wm' | 'sub' | null>(null);

    // --- Effects ---
    
    // Update subtitle based on current time
    useEffect(() => {
        const seg = regions.find(r => currentTime >= r.start && currentTime < r.end);
        setCurrentSubtitle(seg ? seg.text : "");
    }, [currentTime, regions]);

    // --- Persistence & Initialization ---
    
    // Effect 1: Restore Settings from LocalStorage (ALWAYS on dialog open)
    useEffect(() => {
        if (!isOpen) return;
        
        const savedScale = localStorage.getItem('wm_scale');
        const savedOpacity = localStorage.getItem('wm_opacity');
        const savedPos = localStorage.getItem('wm_pos');



        if (savedScale) setWmScale(parseFloat(savedScale));
        if (savedOpacity) setWmOpacity(parseFloat(savedOpacity));
        if (savedPos) {
            try {
                const pos = JSON.parse(savedPos);

                setWmPos(pos);
            } catch (e) { console.error("Invalid saved position", e); }
        }
        
        const savedSubPos = localStorage.getItem('sub_pos');
        if (savedSubPos) {
            try {
                const pos = JSON.parse(savedSubPos);
                setSubPos(pos);
            } catch (e) { console.error("Invalid saved sub position", e); }
        }
        
        // Mark as initialized AFTER loading settings
        isInitialized.current = true;

    }, [isOpen]); // Only depend on isOpen, runs every time dialog opens

    // Effect 2: Load Persisted Watermark Image (only if not already loaded)
    useEffect(() => {
        if (!isOpen) return;
        if (watermarkPreviewUrl) return; // Already have a watermark loaded
        

        apiClient.getLatestWatermark().then(res => {
            if (res && res.data_url) {

                setWatermarkPreviewUrl(res.data_url);
                setWatermarkPath(res.png_path);
                setWatermarkSize({ w: res.width, h: res.height });
            } else {

            }
        }).catch(() => {

        });
    }, [isOpen, watermarkPreviewUrl]);

    // Save Settings on Change (only after initialization to avoid overwriting)
    useEffect(() => { 
        if (!isInitialized.current) return;
        localStorage.setItem('wm_scale', wmScale.toString()); 
    }, [wmScale]);
    useEffect(() => { 
        if (!isInitialized.current) return;
        localStorage.setItem('wm_opacity', wmOpacity.toString()); 
    }, [wmOpacity]);
    useEffect(() => { 
        if (!isInitialized.current) return;

        localStorage.setItem('wm_pos', JSON.stringify(wmPos)); 
    }, [wmPos]);
    // Save Subtitle Pos
    useEffect(() => { 
        if (!isInitialized.current) return;
        localStorage.setItem('sub_pos', JSON.stringify(subPos)); 
    }, [subPos]);

    // Persist Quality
    useEffect(() => {
        if (!isOpen) return;
        const savedQuality = localStorage.getItem('synthesis_quality');
        if (savedQuality) {
            setQuality(savedQuality as any);
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isInitialized.current) return;
        localStorage.setItem('synthesis_quality', quality);
    }, [quality]);

    // Output Settings State
    const [outputFilename, setOutputFilename] = useState("");
    const [outputDir, setOutputDir] = useState<string | null>(null);

    // DEBUG: Log watermark state on every change
    useEffect(() => {

    }, [watermarkPreviewUrl, watermarkPath, watermarkSize]);

    // Initialize Output Path
    useEffect(() => {
        if (!isOpen || !videoPath) return;

        // 1. Filename: Default to current filename + _synthesized
        // Clean paths: Windows uses `\`, JS uses `/` or mixed.
        const name = videoPath.split(/[\\/]/).pop() || "video.mp4";
        const baseName = name.substring(0, name.lastIndexOf('.')) || name;
        const ext = name.substring(name.lastIndexOf('.'));
        const defaultName = `${baseName}_synthesized${ext}`;
        setOutputFilename(defaultName);

        // 2. Directory: Last used OR Current Video Directory
        const lastDir = localStorage.getItem('last_synthesis_dir');
        
        // Helper to extract dir
        const currentDir = videoPath.substring(0, Math.max(videoPath.lastIndexOf('\\'), videoPath.lastIndexOf('/')));
        
        if (lastDir) {

            setOutputDir(lastDir);
        } else {

            setOutputDir(currentDir);
        }

    }, [isOpen, videoPath]);

    const handleSelectOutputFolder = async () => {
        if (window.electronAPI?.selectDirectory) {
            const path = await window.electronAPI.selectDirectory();
            if (path) {
                setOutputDir(path);
                localStorage.setItem('last_synthesis_dir', path); // Remember immediately
            }
        } else {
            alert("Folder selection not supported in this environment.");
        }
    };


    // Handle Watermark Upload
    const handleWatermarkSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];

            
            try {
                // Upload to backend for processing (Trimming transparency & Conversion)

                const res = await apiClient.uploadWatermark(file);
                
                // Set Preview & Path
                setWatermarkPreviewUrl(res.data_url);
                setWatermarkPath(res.png_path);
                
                // Set Dimensions from Backend (Trimmed)
                const w = res.width;
                const h = res.height;

                setWatermarkSize({ w, h });
                
                // --- Smart Default Position (Top-Right) ---
                // Calculate position based on TRIMMED dimensions
                
                // Use ref if available for most up-to-date dimensions
                const vidRef = videoRef.current;
                const vidW = (vidRef?.videoWidth) || videoSize.w || 1920;
                const vidH = (vidRef?.videoHeight) || videoSize.h || 1080;
                
                // Target Scale: 20% width (of the trimmed image)
                const scale = 0.20;
                setWmScale(scale);
                
                // Calculate Target Dimensions in Pixels
                const targetW = vidW * scale;
                const targetH = targetW * (h / w); // Maintain aspect ratio
                
                // Normalized Dimensions (0-1)
                const normW = targetW / vidW;
                const normH = targetH / vidH;
                
                const margin = 0.05; // Increased to 5% margin per user request
                
                // Top Right Position (Center coordinates)
                const x = 1 - margin - (normW / 2);
                const y = margin + (normH / 2);
                

                setWmPos({ x, y }); 

            } catch (err) {
                console.error("[Synthesis] Watermark Upload Failed", err);
                alert("Failed to process watermark. Check console.");
            }
        }
    };


    // --- Smart Positioning Logic ---
    const applyPreset = (pos: 'TL'|'TC'|'TR'|'BL'|'BC'|'BR'|'C'|'LC'|'RC') => {
        if (!videoSize.w || !watermarkSize.w) {
            // Fallback for missing metadata
            const map: any = {
                'TL': {x:0.1, y:0.1}, 'TC': {x:0.5, y:0.1}, 'TR': {x:0.9, y:0.1},
                'BL': {x:0.1, y:0.9}, 'BC': {x:0.5, y:0.9}, 'BR': {x:0.9, y:0.9},
                'C': {x:0.5, y:0.5}
            };
            if(map[pos]) setWmPos(map[pos]);
            return;
        }

        // 1. Calculate Watermark Target Dimensions (in pixels)
        // wmScale is now "Target Width as % of Video Width"
        const targetW = videoSize.w * wmScale;
        const targetH = targetW * (watermarkSize.h / watermarkSize.w);
        
        // 2. Normalized Dimensions
        const normW = targetW / videoSize.w;
        const normH = targetH / videoSize.h;
        
        // 3. Margin (5%)
        // Actually, just 5% of respective axis is fine for specific "edge" feel.
        const marginX = 0.03;
        const marginY = 0.05; // Increased to 5% per user request

        let x = 0.5;
        let y = 0.5;

        // Note: wmPos is the CENTER of the watermark
        
        // Horizontal
        if (pos.includes('L')) x = marginX + normW / 2;
        else if (pos.includes('R')) x = 1 - marginX - normW / 2;
        else x = 0.5;

        // Vertical
        if (pos.includes('T')) y = marginY + normH / 2;
        else if (pos.includes('B')) y = 1 - marginY - normH / 2;
        else y = 0.5;

        setWmPos({ x, y });
    };

    // Synthesize Action
    const handleSynthesize = async () => {
        if (!videoPath) return;
        
        setIsSynthesizing(true);
        try {
            const marginV = Math.max(0, Math.round((1 - subPos.y) * videoSize.h));

            // Let's standardise: wmPos is CENTER of the watermark.
            // FFmpeg overlay filter: x = main_w * pos_x - overlay_w / 2
            const wmXExpr = `main_w*${wmPos.x}-w/2`;
            const wmYExpr = `main_h*${wmPos.y}-h/2`;
            
            // Calculate Backend Scale Factor for Watermark
            let backendScale = wmScale; // Default fallback
            if (videoSize.w > 0 && watermarkSize.w > 0) {
                 backendScale = (videoSize.w * wmScale) / watermarkSize.w;

            }

            // Calculate Font Size Scaling (WYSIWYG)
            // The preview shows fontSize (px) on a shrunken video.
            // We need to scale it up to match the real video resolution.
            let outcomeFontSize = fontSize;
            if (videoRef.current && videoSize.h > 0) {
                const previewHeight = videoRef.current.clientHeight;
                if (previewHeight > 0) {
                    const ratio = videoSize.h / previewHeight;
                    outcomeFontSize = Math.round(fontSize * ratio);

                }
            }

            // Quality mapping: Improved defaults for better clarity
            // High: 17 (Visually Lossless)
            // Balanced: 20 (High Quality) - Previously 23
            // Small: 26 (Good Compression) - Previously 28
            const options = {
                crf: quality === 'high' ? 17 : quality === 'balanced' ? 20 : 26,
                preset: quality === 'high' ? 'slow' : quality === 'balanced' ? 'medium' : 'fast',
                font_size: outcomeFontSize,
                font_color: '&H' + fontColor.replace('#', '00') + '&',
                margin_v: marginV,
                wm_x: wmXExpr,
                wm_y: wmYExpr,
                wm_scale: backendScale, // Send calculated factor
                wm_opacity: wmOpacity
            };

            // Delegate to parent (EditorPage) which handles Saving First
            if (onSynthesize) {
                // Construct parameters
                // If outputDir and outputFilename are set, construct the comprehensive path.
                // NOTE: 'videoPath' arg in onSynthesize usually means INPUT path in original code.
                // But wait, the original logic was: onSynthesize(options, videoPath, watermarkPath)
                // The EditorPage logic constructs output path based on input videoPath inside `synthesizeVideo`.
                // We need to change this contract OR pass the target path in options.
                
                // Let's pass the TARGET path as the videoPath? No, that confuses input.
                // Let's pass it inside 'options' because EditorPage just passes 'options' to apiClient.
                // AND updated apiClient to handle explicit output path.
                
                let targetPath = null;
                if (outputDir && outputFilename) {
                   // Ensure separator
                   const sep = outputDir.includes('\\') ? '\\' : '/';
                   // Remove trailing slash if exists
                   const cleanDir = outputDir.endsWith(sep) ? outputDir.slice(0, -1) : outputDir;
                   targetPath = `${cleanDir}${sep}${outputFilename}`;
                }
                
                const finalOptions = {
                    ...options,
                    output_path: targetPath // Pass explicitly
                };

                await onSynthesize(finalOptions, videoPath, watermarkPath);
            } else {
                 // Fallback (should not happen if parent implements it)
                 // ... omitted for brevity/legacy
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
    
    // --- Drag Logic ---
    const handleDragStart = (e: React.MouseEvent, type: 'wm' | 'sub') => {
        e.preventDefault();
        setDragging(type);
    };
    
    const handleMouseMove = (e: React.MouseEvent) => {
        if (!dragging || !containerRef.current) return;
        
        const rect = containerRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        
        // Clamp 0-1
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

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onMouseUp={handleMouseUp}
            onMouseMove={handleMouseMove}
        >
            <div className="bg-slate-900 w-[90vw] h-[90vh] rounded-xl border border-slate-700 shadow-2xl flex overflow-hidden">
                
                {/* Left: Settings Panel */}
                <div className="w-[350px] bg-slate-800 p-6 flex flex-col gap-6 overflow-y-auto border-r border-slate-700 z-10 shrink-0">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                        <MonitorPlay size={24} className="text-indigo-400"/> Video Synthesis
                    </h2>
                    
                    {/* Subtitle Settings */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                            <Type size={14}/> Subtitles
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-xs text-slate-500">Size (px)</label>
                                <input 
                                    type="number" 
                                    value={fontSize} 
                                    onChange={e => setFontSize(Number(e.target.value))}
                                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-slate-500">Color</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="color" 
                                        value={fontColor}
                                        onChange={e => setFontColor(e.target.value)}
                                        className="h-8 w-10 bg-transparent cursor-pointer"
                                    />
                                    <span className="text-sm text-slate-300 self-center">{fontColor}</span>
                                </div>
                            </div>
                        </div>
                        <p className="text-xs text-slate-500 italic">
                            * Drag the subtitle text in the preview to adjust vertical position.
                        </p>
                    </div>

                    <div className="h-[1px] bg-slate-700"></div>


                    {/* Output Settings */}
                    <div className="space-y-4">
                         <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                            <MonitorPlay size={14}/> Output Settings
                        </h3>
                        
                        {/* Filename Input */}
                        <div className="space-y-1">
                            <label className="text-xs text-slate-500">Filename</label>
                            <input 
                                type="text"
                                value={outputFilename}
                                onChange={e => setOutputFilename(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                                placeholder="video_synthesized.mp4"
                            />
                        </div>

                        {/* Folder Selection */}
                        <div className="space-y-1">
                            <label className="text-xs text-slate-500">Save to Folder</label>
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    readOnly
                                    value={outputDir || ""}
                                    className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-400 cursor-not-allowed"
                                />
                                <button 
                                    onClick={handleSelectOutputFolder}
                                    className="bg-slate-700 hover:bg-slate-600 text-white px-2 py-1 rounded text-xs"
                                >
                                    Change
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <div className="h-[1px] bg-slate-700"></div>

                    {/* Watermark Settings */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                            <ImageIcon size={14}/> Watermark
                        </h3>
                        
                        <input 
                            type="file" 
                            accept="image/png,image/jpeg,.psd"
                            onChange={handleWatermarkSelect}
                            className="block w-full text-xs text-slate-300
                              file:mr-4 file:py-2 file:px-4
                              file:rounded-full file:border-0
                              file:text-xs file:font-semibold
                              file:bg-indigo-600 file:text-white
                              hover:file:bg-indigo-700"
                        />
                        {watermarkPreviewUrl && (
                            <div className="flex items-center gap-2 text-xs text-emerald-400 mt-1">
                                <span className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center">✓</span>
                                已加载水印
                            </div>
                        )}
                        
                        {watermarkPreviewUrl && (
                            <>
                                {/* Position Presets */}
                                <div className="grid grid-cols-3 gap-2 p-2 bg-slate-900/50 rounded-lg border border-slate-700/50">
                                    <button 
                                        onClick={() => applyPreset('TL')}
                                        className="p-2 rounded hover:bg-slate-700 flex justify-center bg-slate-800"
                                        title="Top Left"
                                    >
                                        <div className="w-2 h-2 border-t-2 border-l-2 border-white" />
                                    </button>
                                    <button 
                                        onClick={() => applyPreset('TC')}
                                        className="p-2 rounded hover:bg-slate-700 flex justify-center bg-slate-800"
                                        title="Top Center"
                                    >
                                        <div className="w-2 h-2 border-t-2 border-white" />
                                    </button>
                                    <button 
                                        onClick={() => applyPreset('TR')}
                                        className="p-2 rounded hover:bg-slate-700 flex justify-center bg-slate-800"
                                        title="Top Right"
                                    >
                                        <div className="w-2 h-2 border-t-2 border-r-2 border-white" />
                                    </button>

                                    <button 
                                        onClick={() => applyPreset('BL')}
                                        className="p-2 rounded hover:bg-slate-700 flex justify-center bg-slate-800"
                                        title="Bottom Left"
                                    >
                                        <div className="w-2 h-2 border-b-2 border-l-2 border-white" />
                                    </button>
                                    <button 
                                        onClick={() => applyPreset('C')}
                                        className="p-2 rounded hover:bg-slate-700 flex justify-center bg-slate-800"
                                        title="Center"
                                    >
                                        <div className="w-2 h-2 border-2 border-white rounded-full bg-white/50" />
                                    </button>
                                    <button 
                                        onClick={() => applyPreset('BR')}
                                        className="p-2 rounded hover:bg-slate-700 flex justify-center bg-slate-800"
                                        title="Bottom Right"
                                    >
                                        <div className="w-2 h-2 border-b-2 border-r-2 border-white" />
                                    </button>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs text-slate-500">Scale ({Math.round(wmScale * 100)}%)</label>
                                    <input 
                                        type="range" min="0.05" max="1.0" step="0.05"
                                        value={wmScale}
                                        onChange={e => setWmScale(parseFloat(e.target.value))}
                                        className="w-full accent-indigo-500"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-slate-500">Opacity ({Math.round(wmOpacity * 100)}%)</label>
                                    <input 
                                        type="range" min="0.1" max="1.0" step="0.1"
                                        value={wmOpacity}
                                        onChange={e => setWmOpacity(parseFloat(e.target.value))}
                                        className="w-full accent-indigo-500"
                                    />
                                </div>
                                <p className="text-xs text-slate-500 italic">
                                    * Drag the watermark in the preview to reposition.
                                </p>
                            </>
                        )}
                    </div>
                </div>

                {/* Right: Preview Area */}
                <div className="flex-1 flex flex-col bg-black relative min-w-0">
                    {/* Toolbar */}
                    <div className="h-12 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-900 shrink-0">
                        <div className="flex items-center gap-4">
                            <span className="text-slate-400 text-sm">Preview - Drag elements to move</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <select 
                                value={quality} 
                                onChange={e => setQuality(e.target.value as any)}
                                className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded px-2 py-1"
                            >
                                <option value="balanced">Balanced (CRF 20)</option>
                                <option value="high">High Quality (CRF 17)</option>
                                <option value="small">Low Size (CRF 26)</option>
                            </select>
                            <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded-full text-slate-400">
                                <X size={20} />
                            </button>
                        </div>
                    </div>
                    
                    {/* Output Preview Container */}
                    <div className="flex-1 relative flex items-center justify-center bg-black/50 overflow-hidden p-4">
                        {/* The Video Container that matches aspect ratio */}
                        <div 
                            ref={containerRef}
                            className="relative shadow-2xl border border-slate-800/50 bg-black"
                            style={{
                                // We rely on the video to set the size of this container naturally (inline-block behavior ish)
                                // But to ensuring overlay is 1:1, we just wrap the video tightly.
                                // React requires us to handle this carefully to avoid 0x0.
                                // We use max-width/height to constrain within parent, and aspect ratio from metadata.
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
                                    onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                                    onLoadedMetadata={(e) => {
                                        const t = e.currentTarget;
                                        setVideoSize({ w: t.videoWidth, h: t.videoHeight });
                                    }}
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full w-full text-slate-500 bg-slate-900/50 aspect-video">
                                    <Play size={48} className="opacity-20 mb-2"/>
                                    No Media
                                </div>
                            )}

                            {/* --- Overlays Layer --- */}
                            
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
                                        transform: 'translate(-50%, -50%)', // Center anchor
                                        border: dragging === 'wm' ? '1px dashed #6366f1' : '1px dashed transparent',
                                    }}
                                    onMouseDown={(e) => handleDragStart(e, 'wm')}
                                >
                                    <img 
                                        src={watermarkPreviewUrl} 
                                        className="w-full h-auto pointer-events-none"
                                        alt="Watermark"
                                    />
                                    {/* Hover Guide */}
                                    <div className="absolute inset-0 border border-white/20 opacity-0 group-hover:opacity-100 pointer-events-none rounded"></div>
                                </div>
                            )}
                            
                            {/* Subtitle Overlay */}
                            {/* We render a box for the subtitle area */}
                            <div 
                                className="absolute left-0 right-0 text-center cursor-move select-none group hover:bg-indigo-500/10 transition-colors"
                                style={{ 
                                    top: `${subPos.y * 100}%`,
                                    transform: 'translateY(-50%)', // Center vertically on the Y point
                                    zIndex: 30,
                                    border: dragging === 'sub' ? '1px dashed #6366f1' : '1px dashed transparent',
                                }}
                                onMouseDown={(e) => handleDragStart(e, 'sub')}
                            >
                                <span 
                                    style={{ 
                                        fontSize: `${fontSize}px`, 
                                        color: fontColor,
                                        textShadow: '1px 1px 2px black, 0 0 1em black',
                                        fontFamily: 'sans-serif',
                                        padding: '4px 8px',
                                        backgroundColor: 'rgba(0,0,0,0.5)',
                                        display: 'inline-block',
                                        pointerEvents: 'none' // Click passes to div
                                    }}
                                >
                                    {currentSubtitle}
                                    {/* Show placeholder if empty only if drag is active? Or always invisible? User asked for empty. */}
                                    {!currentSubtitle && dragging === 'sub' && <span className="opacity-50 text-xs">(Subtitle Position)</span>}
                                </span>
                            </div>

                        </div>
                    </div>
                    
                    {/* Time Seeker */}
                    <div className="h-12 bg-slate-900 border-t border-slate-800 px-4 flex items-center gap-4 shrink-0">
                        <button 
                            onClick={() => {
                                if (videoRef.current?.paused) videoRef.current.play();
                                else videoRef.current?.pause();
                            }}
                            className="p-2 hover:bg-slate-800 rounded-full text-slate-200"
                        >
                            <Play size={16} fill="currentColor"/>
                        </button>
                        
                        <input 
                            type="range"
                            min="0"
                            max={videoRef.current?.duration || 100}
                            value={currentTime}
                            onChange={(e) => {
                                const t = Number(e.target.value);
                                setCurrentTime(t);
                                if (videoRef.current) videoRef.current.currentTime = t;
                            }}
                            className="flex-1 accent-indigo-500"
                        />
                        <span className="text-xs text-slate-500 font-mono w-16 text-right">
                            {currentTime.toFixed(1)}s
                        </span>
                        
                        <button 
                            onClick={handleSynthesize}
                            disabled={isSynthesizing}
                            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-1.5 rounded text-sm font-medium flex items-center gap-2"
                        >
                            {isSynthesizing ? <Settings2 className="animate-spin" size={16}/> : <Download size={16}/>}
                            Start Render
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
