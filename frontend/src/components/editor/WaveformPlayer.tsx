import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.esm.js';
import HoverPlugin from 'wavesurfer.js/dist/plugins/hover.esm.js';
import type { SubtitleSegment } from '../../types/task';

type WaveformPeaks = Array<Float32Array | number[]> | null;

type RegionLike = {
    id: string;
    start: number;
    end: number;
    color?: string;
    element?: HTMLElement | null;
    setOptions: (options: Record<string, unknown>) => void;
    remove: () => void;
};

// Note: We need to import styles for regions if they are not bundled
// usually wavesurfer regions has default styles or we inject them.

interface WaveformPlayerProps {
    mediaUrl: string;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    regions: SubtitleSegment[];
    onRegionUpdate: (id: string, start: number, end: number) => void;
    onRegionClick: (id: string, e: MouseEvent) => void;
    onContextMenu: (e: MouseEvent, id: string, regionData?: {start: number, end: number}) => void;
    peaks?: WaveformPeaks;
    onPeaksGenerated?: (peaks: WaveformPeaks) => void;
    selectedIds?: string[];
    autoScroll?: boolean;
    onInteractStart?: () => void;
}

const WaveformPlayerComponent: React.FC<WaveformPlayerProps> = ({ 
    mediaUrl, 
    videoRef, 
    regions,
    onRegionUpdate,
    onRegionClick,
    onContextMenu,
    peaks,
    onPeaksGenerated,
    selectedIds = [],
    autoScroll = true,
    onInteractStart
}) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null); // Top scrollbar
    const containerRef = useRef<HTMLDivElement>(null); // Waveform wrapper
    const timelineContainerRef = useRef<HTMLDivElement>(null);
    const wavesurfer = useRef<WaveSurfer | null>(null);
    const wsRegions = useRef<RegionsPlugin | null>(null);
    const isDraggingRef = useRef(false);
    const currentTempRegionId = useRef<string | null>(null); // Track active temp region
    const latestRegionsRef = useRef(regions); // Track latest regions for event listeners
    const peaksReportedRef = useRef(false);
    const onContextMenuRef = useRef(onContextMenu);
    const onRegionClickRef = useRef(onRegionClick);
    const onRegionUpdateRef = useRef(onRegionUpdate);
    const onInteractStartRef = useRef(onInteractStart);
    const onPeaksGeneratedRef = useRef(onPeaksGenerated);

    useEffect(() => {
        latestRegionsRef.current = regions;
    }, [regions]);

    useEffect(() => {
        onContextMenuRef.current = onContextMenu;
    }, [onContextMenu]);

    useEffect(() => {
        onRegionClickRef.current = onRegionClick;
    }, [onRegionClick]);

    useEffect(() => {
        onRegionUpdateRef.current = onRegionUpdate;
    }, [onRegionUpdate]);

    useEffect(() => {
        onInteractStartRef.current = onInteractStart;
    }, [onInteractStart]);

    useEffect(() => {
        onPeaksGeneratedRef.current = onPeaksGenerated;
    }, [onPeaksGenerated]);

    const [scrollWidth, setScrollWidth] = useState(0);
    const [duration, setDuration] = useState(0); // Added duration back
    const [zoom, setZoom] = useState(80);  
    const [isReady, setIsReady] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [loadProgress, setLoadProgress] = useState(0);
    
    const isScrolling = useRef<'top' | 'wave' | null>(null);

    // Sync Scroll: Top scrollbar -> WaveSurfer (via setScroll API)
    const onTopScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (isScrolling.current === 'wave') return;
        
        if (wavesurfer.current) {
            isScrolling.current = 'top';
            wavesurfer.current.setScroll(e.currentTarget.scrollLeft);
            setTimeout(() => { if(isScrolling.current === 'top') isScrolling.current = null }, 100);
        }
    };
    

    // Sync Width Effect using ResizeObserver (Backup) AND duration update
    useEffect(() => {
        if (!containerRef.current) return;
        
        // Use ResizeObserver as a fallback to ensure we catch layout changes
        const observer = new ResizeObserver(() => {
             if (containerRef.current) {
                 setScrollWidth(containerRef.current.scrollWidth);
             }
        });

        if (containerRef.current.firstElementChild) {
             observer.observe(containerRef.current.firstElementChild);
        } else {
             observer.observe(containerRef.current);
        }
        
        const handleResize = () => {
             if (containerRef.current) setScrollWidth(containerRef.current.scrollWidth);
        };
        window.addEventListener('resize', handleResize);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', handleResize);
        };
    }, [zoom, isReady]);

    // Force update duration/width on zoom change
    useEffect(() => {
        const timer = setTimeout(() => {
             if (containerRef.current) setScrollWidth(containerRef.current.scrollWidth);
             if (wavesurfer.current) setDuration(wavesurfer.current.getDuration());
        }, 100);
        return () => clearTimeout(timer);
    }, [zoom, isReady]);

    // Initialize WaveSurfer
    useEffect(() => {
        if (!containerRef.current || !videoRef.current || !timelineContainerRef.current) return;

        const resetTimer = setTimeout(() => {
            setIsReady(false);
            setHasError(false);
            setLoadProgress(0);
        }, 0);
        peaksReportedRef.current = false;

        const reportGeneratedPeaks = () => {
            if (peaks || peaksReportedRef.current || !onPeaksGeneratedRef.current) return;
            const exported = wavesurfer.current?.exportPeaks();
            if (exported && exported.length > 0) {
                peaksReportedRef.current = true;
                onPeaksGeneratedRef.current(exported);
            }
        };

        const options: Parameters<typeof WaveSurfer.create>[0] = {
            container: containerRef.current,
            waveColor: '#4F46E5',
            progressColor: '#818cf8',
            cursorColor: '#38bdf8', // Cyan Playhead
            cursorWidth: 2,
            height: containerRef.current.clientHeight,
            minPxPerSec: zoom,
            media: videoRef.current,
            hideScrollbar: true, // Hide native bottom scrollbar, we use our own top scrollbar
            dragToSeek: false, // Critical: Disable drag-seeking so regions plugin can handle drag selection
            plugins: [
                TimelinePlugin.create({
                    container: timelineContainerRef.current
                }),
                HoverPlugin.create({
                    lineColor: 'rgba(255, 255, 255, 0.5)',
                    lineWidth: 2,
                    labelSize: '11px',
                    labelColor: '#fff'
                })
            ]
        };

        if (peaks) {
            options.peaks = peaks;
        }

        const ws = WaveSurfer.create(options);

        // Initialize Regions
        const regionsPlugin = RegionsPlugin.create();
        ws.registerPlugin(regionsPlugin);
        wsRegions.current = regionsPlugin;
        
        // Explicitly enable drag selection since constructor options might be ignored in this version
        regionsPlugin.enableDragSelection({
            color: 'rgba(255, 255, 255, 0.2)',
        }, 10); // Threshold (slop) in pixels

        // Region Events
        // Region Events
        regionsPlugin.on('region-created', (region) => {
             // 1. Check if this is a "Prop-Sync" region (Programmatic)
             // We use latestRegionsRef to check if this ID exists in our props
             const isRealRegion = latestRegionsRef.current.some(r => String(r.id) === region.id);
             
             // 2. Event Listener Attachment (Universal)
             // We MUST attach context menu to ALL regions, whether temp or real
             if(region.element) {
                 region.element.addEventListener('contextmenu', (e) => {
                     e.preventDefault();
                     onContextMenuRef.current?.(e, region.id, { start: region.start, end: region.end });
                 });
             }

             // 3. Temp Region Logic (User Drag Only)
             if (!isRealRegion) {
                 // Clear previous temp region if it exists due to stale state
                 if (currentTempRegionId.current && currentTempRegionId.current !== region.id) {
                     const prev = regionsPlugin.getRegions().find((r) => r.id === currentTempRegionId.current);
                     if (prev) prev.remove();
                 }
                 
                 currentTempRegionId.current = region.id;
                 
                 // Show Toast hint
                 // toast.info("Right-click to identify segment", { duration: 2000 });
             }
        });

        regionsPlugin.on('region-update', () => {
             if (!isDraggingRef.current) {
                 isDraggingRef.current = true;
                 onInteractStartRef.current?.();
             }
             if (wavesurfer.current) setDuration(wavesurfer.current.getDuration());
        });

        regionsPlugin.on('region-updated', (region) => {
             isDraggingRef.current = false;
             // Only update parent if it's a REAL region
             // Temp regions don't sync back to parent until "Insert" is clicked
             const isReal = latestRegionsRef.current.some(r => String(r.id) === region.id);
             if (isReal) {
                onRegionUpdateRef.current?.(region.id, region.start, region.end);
             }
        });

        regionsPlugin.on('region-clicked', (region, e) => {
            onRegionClickRef.current?.(region.id, e);
        });
        
        // Interaction (Click on background)
        ws.on('interaction', () => {
             // We wait a tick to see if a region was clicked/created
             // But actually, 'interaction' is broad. 
             // Let's use 'click' specifically for clearing.
        });
        
        // Click on Waveform (Background) -> Clear Temp Region
        ws.on('click', () => {
             if (currentTempRegionId.current) {
                 const temp = regionsPlugin.getRegions().find((r) => r.id === currentTempRegionId.current);
                 if (temp) {
                     temp.remove();
                     currentTempRegionId.current = null;
                 }
             }
        });

        ws.on('ready', () => {
             setIsReady(true);
             setDuration(ws.getDuration());
             if (containerRef.current) setScrollWidth(containerRef.current.scrollWidth);
             reportGeneratedPeaks();
        });
        
        // Sync Scroll: WaveSurfer -> Top scrollbar (via scroll event)
        ws.on('scroll', () => {
             if (isScrolling.current === 'top') return;
             if (scrollContainerRef.current && wavesurfer.current) {
                 isScrolling.current = 'wave';
                 scrollContainerRef.current.scrollLeft = wavesurfer.current.getScroll();
                 setTimeout(() => { if(isScrolling.current === 'wave') isScrolling.current = null }, 100);
             }
        });
        
        ws.on('decode', () => {
             setDuration(ws.getDuration());
             if (containerRef.current) setScrollWidth(containerRef.current.scrollWidth);
             reportGeneratedPeaks();
        });
        
        ws.on('error', (error) => {
             console.error("Waveform error", error);
             setHasError(true);
        });

        ws.on('loading', (percent: number) => {
             setLoadProgress(percent);
        });

        wavesurfer.current = ws;

        return () => {
            clearTimeout(resetTimer);
            // Explicitly destroy plugins to detach events
            if (wsRegions.current) {
                wsRegions.current.destroy();
                wsRegions.current = null;
            }
            if (wavesurfer.current) {
                wavesurfer.current.destroy();
                wavesurfer.current = null;
            }
        };
    }, [mediaUrl, videoRef]);

    // Update Regions when props change OR when WaveSurfer is ready
    useEffect(() => {
        if (!wsRegions.current || !isReady) return;
        
        // --- PERFORMANCE OPTIMIZATION & STRICT SYNC ---
        // 1. Prepare "Geometry & Style" map from Props (The Truth)
        const geometryMap = new Map<string, { start: number, end: number, color: string }>();
        const overlappingIds = new Set<string>();

        // Overlap Detection (O(n^2) but n < 2000 usually ok)
        for (let i = 0; i < regions.length; i++) {
            for (let j = i + 1; j < regions.length; j++) {
                const r1 = regions[i];
                const r2 = regions[j];
                const tolerance = 0.01;
                if (r1.start < r2.end - tolerance && r2.start < r1.end - tolerance) {
                    overlappingIds.add(String(r1.id));
                    overlappingIds.add(String(r2.id));
                }
            }
        }

        regions.forEach(seg => {
            const strId = String(seg.id);
            const isSelected = selectedIds.includes(strId);
            const isOverlapping = overlappingIds.has(strId);
            
            let color = 'rgba(79, 70, 229, 0.2)'; 
            if (isOverlapping) color = 'rgba(239, 68, 68, 0.5)';
            if (isSelected) {
                color = isOverlapping ? 'rgba(239, 68, 68, 0.7)' : 'rgba(234, 179, 8, 0.5)';
            }
            geometryMap.set(strId, { start: seg.start, end: seg.end, color });
        });

        const existingRegions = wsRegions.current.getRegions() as RegionLike[];
        
        // 2. Remove regions that are NOT in props AND NOT the current temp region
        existingRegions.forEach(r => {
            const isPropRegion = geometryMap.has(r.id);
            const isTempRegion = currentTempRegionId.current === r.id;

            if (!isPropRegion && !isTempRegion) {
                // Determine if it WAS a temp region that should be removed?
                // actually if it's not current temp, it's garbage.
                r.remove();
            }
        });

        // 3. Add or Update Prop Regions
        geometryMap.forEach((geo, id) => {
            const existing = existingRegions.find(r => r.id === id);
            
            if (existing) {
                // Update if changed
                const startChanged = Math.abs(existing.start - geo.start) > 0.001;
                const endChanged = Math.abs(existing.end - geo.end) > 0.001;
                const colorChanged = existing.color !== geo.color;

                if (startChanged || endChanged || colorChanged) {
                    existing.setOptions({
                        start: geo.start,
                        end: geo.end,
                        color: geo.color,
                        drag: true, // Ensure drag is enabled for real regions too (for editing)
                        resize: true
                    });
                }
            } else {
                // Add new
                wsRegions.current?.addRegion({
                    id: id,
                    start: geo.start,
                    end: geo.end,
                    color: geo.color,
                    drag: true,
                    resize: true
                });
            }
        });

    }, [regions, selectedIds, isReady]);

    // Zoom setup...
    useEffect(() => {
        if(wavesurfer.current) {
            try {
                wavesurfer.current.zoom(zoom);
            } catch {
                // console.warn("WaveSurfer zoom failed", e);
            }
        }
    }, [zoom]);

    // Zoom Handlers
    const handleZoomIn = () => setZoom(prev => Math.min(200, prev + 10));
    const handleZoomOut = () => setZoom(prev => Math.max(5, prev - 10));

    useEffect(() => {
        if (wavesurfer.current) {
            wavesurfer.current.setOptions({
                autoScroll,
                autoCenter: autoScroll
            });
        }
    }, [autoScroll]);
    
    return (
        <div className="w-full h-full flex flex-col relative bg-[#0a0a0a] border-t border-white/10">
            {/* Toolbar */}
            <div className="absolute top-3 right-3 z-30 flex gap-2">
                <button 
                  onClick={handleZoomOut} 
                  className="bg-black/40 backdrop-blur-md p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white border border-white/10 transition-all shadow-lg active:scale-95"
                  title="Zoom Out"
                >
                     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </button>
                <button 
                  onClick={handleZoomIn} 
                  className="bg-black/40 backdrop-blur-md p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white border border-white/10 transition-all shadow-lg active:scale-95"
                  title="Zoom In"
                >
                     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </button>
            </div>

            {/* Synced Top Scrollbar */}
            <div 
                ref={scrollContainerRef}
                className="w-full overflow-x-auto overflow-y-hidden custom-scrollbar bg-[#0a0a0a] border-b border-white/5"
                style={{ height: '12px', minHeight: '12px' }}
                onScroll={onTopScroll}
            >
                <div style={{ width: `${Math.max(scrollWidth, duration * zoom)}px`, height: '1px' }}></div>
            </div>

            {/* WaveSurfer Container */}
            <div 
                className="relative w-full flex-1 overflow-hidden" 
                ref={containerRef} 
                onContextMenu={(e) => e.preventDefault()}
            >
               {/* Timeline container */}
               <div ref={timelineContainerRef} className="absolute top-0 left-0 w-full h-5 z-20 pointer-events-none opacity-70"></div>
            </div>
            
            {/* Loading Overlay */}
            {!isReady && !hasError && mediaUrl && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/80 z-40 backdrop-blur-sm transition-all duration-500">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-300 ease-out"
                                style={{ width: `${loadProgress}%` }}
                            />
                        </div>
                        <span className="text-xs font-medium text-indigo-400 tracking-wider uppercase">
                            {loadProgress < 100 ? `解码音频 ${loadProgress}%` : '渲染波形...'}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};

export const WaveformPlayer = React.memo(WaveformPlayerComponent);
