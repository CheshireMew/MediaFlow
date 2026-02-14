import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.esm.js';
import HoverPlugin from 'wavesurfer.js/dist/plugins/hover.esm.js';
import type { SubtitleSegment } from '../../types/task';

// Note: We need to import styles for regions if they are not bundled
// usually wavesurfer regions has default styles or we inject them.

interface WaveformPlayerProps {
    mediaUrl: string;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    regions: SubtitleSegment[];
    onRegionUpdate: (id: string, start: number, end: number) => void;
    onRegionClick: (id: string, e: MouseEvent) => void;
    onContextMenu: (e: MouseEvent, id: string, regionData?: {start: number, end: number}) => void;
    peaks?: any;
    onPeaksGenerated?: (peaks: any) => void;
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
    const wavesurfer = useRef<WaveSurfer | null>(null);
    const wsRegions = useRef<RegionsPlugin | null>(null);
    const isDraggingRef = useRef(false);
    const currentTempRegionId = useRef<string | null>(null); // Track active temp region
    const latestRegionsRef = useRef(regions); // Track latest regions for event listeners

    useEffect(() => {
        latestRegionsRef.current = regions;
    }, [regions]);

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
        
        window.addEventListener('resize', () => {
             if (containerRef.current) setScrollWidth(containerRef.current.scrollWidth);
        });

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', () => {});
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
        if (!containerRef.current || !videoRef.current) return;
        
        setIsReady(false);
        setHasError(false);
        setLoadProgress(0);

        const options: any = {
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
                    container: '#waveform-timeline'
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
        regionsPlugin.on('region-created', (region) => {
             // CRITICAL FIX: Distinguish between user-dragged regions and programmatically added regions
             // If this region's ID exists in our props.regions, it's NOT a temp region.
             // Use Ref because this effect runs once (stale closure)
             const isRealRegion = latestRegionsRef.current.some(r => String(r.id) === region.id);
             
             // 2. Mark this as current temp
             if (!isRealRegion) {
                 // 1. Remove previous temp region if exists
                 if (currentTempRegionId.current && currentTempRegionId.current !== region.id) {
                     const prev = regionsPlugin.getRegions().find(r => r.id === currentTempRegionId.current);
                     if (prev) prev.remove();
                 }
                 
                 // 2. Mark this as current temp
                 currentTempRegionId.current = region.id;
                 
                 // Mark as user created so we don't auto-delete it immediately in useEffect sync
                 (region as any).isUserCreated = true;
             }

             if(region.element) {
                 region.element.addEventListener('contextmenu', (e) => {
                     e.preventDefault();
                     onContextMenu(e, region.id, { start: region.start, end: region.end });
                 });
             }
        });

        regionsPlugin.on('region-update', () => {
             if (!isDraggingRef.current) {
                 isDraggingRef.current = true;
                 onInteractStart?.();
             }
             // Ensure duration is updated if needed (unlikely on region move but safe)
             if (wavesurfer.current) setDuration(wavesurfer.current.getDuration());
        });

        regionsPlugin.on('region-updated', (region) => {
             isDraggingRef.current = false;
             // Final sync
             onRegionUpdate(region.id, region.start, region.end);
        });

        regionsPlugin.on('region-clicked', (region, e) => {
            onRegionClick(region.id, e);
        });
        
        ws.on('interaction', () => {
             // Clear temp region on click (if not clicking the region itself)
             // Note: region-click handles region clicks. interaction handles waveform clicks.
             // We need a small timeout because interaction fires before region-click? 
             // Actually, if we click outside, we want to clear.
             // If we drag, region-created fires.
             // If we click the region, region-clicked fires.
             
             // Simple logic: interaction clears temp UNLESS it was just created or clicked
             // But we don't want to clear immediately on drag start?
             // Actually 'interaction' fires on seek (click).
             
             // Let's rely on CLICK event for clearing (seeking)
        });
        
        // Use 'click' to clear temp region if we clicked outside
        // Note: WaveSurfer click event argument might vary, usually it's relative position or event
        ws.on('click', () => {
            if (currentTempRegionId.current) {
                // If we are NOT dragging (just clicked), remove the temp region
                // Limitation: If we click *inside* the temp region, does this fire?
                // RegionsPlugin usually stops propagation if region is clicked.
                // So this should only fire if we click OUTSIDE.
                const temp = regionsPlugin.getRegions().find(r => r.id === currentTempRegionId.current);
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
             if (!peaks && onPeaksGenerated) {
                 const exported = ws.exportPeaks();
                 if (exported && exported.length > 0) onPeaksGenerated(exported);
             }
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
             if (!peaks && onPeaksGenerated) {
                 const exported = ws.exportPeaks();
                 if (exported && exported.length > 0) onPeaksGenerated(exported);
             }
        });
        
        ws.on('error', (e) => {
             console.error("Waveform error", e);
             setHasError(true);
        });

        ws.on('loading', (percent: number) => {
             setLoadProgress(percent);
        });

        wavesurfer.current = ws;

        return () => {
            // Explicitly destroy plugins to detach events
            if (wsRegions.current) {
                wsRegions.current.destroy();
                wsRegions.current = null;
            }
            if (wavesurfer.current) {
                wavesurfer.current.destroy();
                wavesurfer.current = null;
            }
            setIsReady(false);
        };
    }, [mediaUrl, videoRef]); // Added videoRef dependency to strictly follow deps

    // Update Regions when props change OR when WaveSurfer is ready
    useEffect(() => {
        if (!wsRegions.current || !isReady) return;
        
        // console.log('Syncing Regions:', regions.length, 'Current Temp:', currentTempRegionId.current);
        
        // --- PERFORMANCE OPTIMIZATION ---
        // We do typically 2 things: 
        // 1. Calculate appearance (color)
        // 2. Diff against existing regions to add/remove/update
        // Crucial: We must NOT re-run this if only the 'text' of a segment changed!
        
        // 1. Prepare "Geometry & Style" map
        const geometryMap = new Map<string, { start: number, end: number, color: string }>();
        const overlappingIds = new Set<string>();
        
        // n^2 overlap check (acceptable for < 2000 items usually, but strictly we can't avoid it without interval tree)
        // For performance, maybe we skip overlap check on every keypress? 
        // But here we are protected by `geometry` comparison down below hopefully.
        // Actually, if we type, `regions` changes. UseEffect triggers.
        // We need to verify if start/end/color changed.

        // Calculate overlapping
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

        // Build desired state
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

        const existingRegions = wsRegions.current.getRegions();
        
        // 1. Remove deleted
        existingRegions.forEach(r => {
            if (!geometryMap.has(r.id)) {
                // strict check: passed regions are authoritative source.
                // EXCEPTION: The currently active temporary region (user just dragged it)
                if (currentTempRegionId.current === r.id) {
                     // Keep it!
                } else {
                    r.remove();
                }
            }
        });

        // 2. Add or Update
        geometryMap.forEach((geo, id) => {
            const existing = existingRegions.find(r => r.id === id);
            
            if (existing) {
                // DIFF: Only update if visual properties changed
                const startChanged = Math.abs(existing.start - geo.start) > 0.001;
                const endChanged = Math.abs(existing.end - geo.end) > 0.001;
                const colorChanged = existing.color !== geo.color;

                if (startChanged || endChanged || colorChanged) {
                    existing.setOptions({
                        start: geo.start,
                        end: geo.end,
                        color: geo.color
                    });
                }
            } else {
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

    }, [regions, selectedIds, isReady, zoom]); // Still triggers on regions change (text), but internal Diff prevents WS mutation

    // Zoom setup...
    useEffect(() => {
        if(wavesurfer.current) {
            try {
                wavesurfer.current.zoom(zoom);
            } catch (e) {
                // console.warn("WaveSurfer zoom failed", e);
            }
        }
    }, [zoom]);

    // Placeholder for handleZoomIn/Out, not provided in the instruction
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
               <div id="waveform-timeline" className="absolute top-0 left-0 w-full h-5 z-20 pointer-events-none opacity-70"></div>
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
