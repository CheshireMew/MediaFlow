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
    onContextMenu: (e: MouseEvent, id: string) => void;
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
    const containerRef = useRef<HTMLDivElement>(null);
    const wavesurfer = useRef<WaveSurfer | null>(null);
    const wsRegions = useRef<RegionsPlugin | null>(null);
    const isDraggingRef = useRef(false);
    const [zoom, setZoom] = useState(80);  // 初始缩放 80，让色块宽度足够

    const [isReady, setIsReady] = useState(false);

    // Initialize WaveSurfer
    useEffect(() => {
        if (!containerRef.current || !videoRef.current) return;
        
        setIsReady(false); // Reset ready state on new media init

        const options: any = {
            container: containerRef.current,
            waveColor: '#4F46E5',
            progressColor: '#818cf8',
            cursorColor: '#38bdf8', // Cyan Playhead
            cursorWidth: 2,
            height: 128,
            minPxPerSec: zoom,
            media: videoRef.current,
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
        
        // Region Events
        regionsPlugin.on('region-update', () => {
             if (!isDraggingRef.current) {
                 isDraggingRef.current = true;
                 onInteractStart?.();
             }
             // REMOVED: onRegionUpdate(region.id, region.start, region.end); 
             // updating parent state here causes re-render -> clearRegions -> breaks drag lifecycle?
        });

        regionsPlugin.on('region-updated', (region) => {
             isDraggingRef.current = false;
             // Final sync
             onRegionUpdate(region.id, region.start, region.end);
        });

        regionsPlugin.on('region-clicked', (region, e) => {
            onRegionClick(region.id, e);
        });
        
        regionsPlugin.on('region-created', (region) => {
             if(region.element) {
                 region.element.addEventListener('contextmenu', (e) => {
                     e.preventDefault();
                     onContextMenu(e, region.id);
                 });
             }
        });

        ws.on('ready', () => {
             setIsReady(true);
             if (!peaks && onPeaksGenerated) {
                 const exported = ws.exportPeaks();
                 if (exported && exported.length > 0) onPeaksGenerated(exported);
             }
        });
        
        ws.on('decode', () => {
             if (!peaks && onPeaksGenerated) {
                 const exported = ws.exportPeaks();
                 if (exported && exported.length > 0) onPeaksGenerated(exported);
             }
        });
        
        ws.on('error', (e) => {
             console.error("Waveform error", e);
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
        
        // --- DIFF LOGIC ---
        // 1. Calculate overlaps first (for color logic)
        const overlappingIds = new Set<string>();
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
        
        // 2. Identify current regions in WaveSurfer
        const existingRegions = wsRegions.current.getRegions();
        // const existingIds = new Set(existingRegions.map(r => r.id)); // Unused
        const incomingIds = new Set(regions.map(r => String(r.id)));

        // 3. Remove deleted regions
        existingRegions.forEach(r => {
            if (!incomingIds.has(r.id)) {
                r.remove();
            }
        });

        // 4. Add or Update regions
        regions.forEach(seg => {
            const strId = String(seg.id);
            const isSelected = selectedIds.includes(strId);
            const isOverlapping = overlappingIds.has(strId);
            
            // Color Logic
            let color = 'rgba(79, 70, 229, 0.2)'; // Default
            if (isOverlapping) {
                color = 'rgba(239, 68, 68, 0.5)'; // Red for overlap
            }
            if (isSelected) {
                if (isOverlapping) {
                    color = 'rgba(239, 68, 68, 0.7)'; // Darker Red if selected overlap
                } else {
                    color = 'rgba(234, 179, 8, 0.5)'; // Normal Yellow selection
                }
            }

            const existing = existingRegions.find(r => r.id === strId);
            if (existing) {
                // UPDATE: Only if changed to prevent unnecessary re-renders
                // Check if meaningful properties changed
                const startChanged = Math.abs(existing.start - seg.start) > 0.001;
                const endChanged = Math.abs(existing.end - seg.end) > 0.001;
                const colorChanged = existing.color !== color;
                
                if (startChanged || endChanged || colorChanged) {
                    existing.setOptions({
                        start: seg.start,
                        end: seg.end,
                        color: color
                    });
                }
            } else {
                // CREATE
                wsRegions.current?.addRegion({
                    id: strId,
                    start: seg.start,
                    end: seg.end,
                    color: color,
                    drag: true,
                    resize: true
                });
            }
        });

    }, [regions, selectedIds, isReady, zoom]);

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
        <div className="w-full h-full flex flex-col relative bg-slate-900">
            {/* Toolbar */}
            <div className="absolute top-2 right-2 z-10 flex gap-2">
                <button onClick={handleZoomOut} className="bg-slate-800 p-1 rounded hover:bg-slate-700 text-slate-300 pointer-events-auto">
                     -
                </button>
                <button onClick={handleZoomIn} className="bg-slate-800 p-1 rounded hover:bg-slate-700 text-slate-300 pointer-events-auto">
                     +
                </button>
            </div>

            <div className="relative w-full h-full overflow-x-auto wavesurfer-wrapper" ref={containerRef} onContextMenu={(e) => e.preventDefault()}>
               {/* Timeline container */}
               <div id="waveform-timeline" className="absolute top-0 left-0 w-full h-4 z-10 pointer-events-none"></div>
            </div>
            
            {/* Loading Overlay */}
            {!isReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 z-20 backdrop-blur-sm">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                </div>
            )}
        </div>
    );
};

export const WaveformPlayer = React.memo(WaveformPlayerComponent);
