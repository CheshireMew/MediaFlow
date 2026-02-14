import React, { useEffect, useRef, useMemo } from 'react';
import type { SubtitleSegment } from '../../types/task';
import { Trash2, Wand2 } from 'lucide-react';
import { validateSegment, fixOverlaps } from '../../utils/validation';
// [FIX] REMOVED BROKEN react-window
// Implementing custom lightweight virtualization
// [FIX] REMOVED BROKEN react-virtualized-auto-sizer
// Implementing custom ResizeObserver for dimensions
const ITEM_HEIGHT = 44;
const OVERSCAN = 5;

// Custom hook for element size
function useElementSize() {
    const ref = React.useRef<HTMLDivElement>(null);
    const [size, setSize] = React.useState({ width: 0, height: 0 });

    React.useEffect(() => {
        if (!ref.current) return;
        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry) {
                // Use contentRect for precise content box size
                const { width, height } = entry.contentRect;
                // Simple debounce/check to avoid excessive updates? 
                // React 18 handles this well, but let's check exactness
                setSize({ width, height });
            }
        });
        observer.observe(ref.current);
        return () => observer.disconnect();
    }, []);

    return { ref, size };
}

interface SubtitleListProps {
    segments: SubtitleSegment[];
    activeSegmentId: string | null;
    autoScroll: boolean;
    selectedIds: string[];
    onSegmentClick: (id: string, multi: boolean, shift?: boolean) => void;
    onSegmentDelete: (id: string) => void;
    onSegmentMerge: (ids: string[]) => void;
    onSegmentDoubleClick: (id: string) => void;
    onContextMenu: (e: React.MouseEvent, id: string) => void;
    onAutoFix?: (newSegments: SubtitleSegment[]) => void;
}

const SubtitleListComponent: React.FC<SubtitleListProps> = (props) => {
    const {
        segments,
        activeSegmentId,
        autoScroll,
        selectedIds,
        onSegmentClick,
        onSegmentDelete,
        onSegmentMerge,
        onSegmentDoubleClick,
        onContextMenu,
        onAutoFix
    } = props;

    const [scrollTop, setScrollTop] = React.useState(0);
    const listRef = useRef<HTMLDivElement>(null);
    const { ref: containerRef, size } = useElementSize();

    // Scroll handler for virtualization
    const handleScroll = React.useCallback((e: React.UIEvent<HTMLDivElement>) => {
        setScrollTop(e.currentTarget.scrollTop);
    }, []);

    // Scroll to active segment logic
    useEffect(() => {
        if (!autoScroll || !activeSegmentId || !listRef.current) return;
        const index = segments.findIndex(s => String(s.id) === activeSegmentId);
        if (index !== -1) {
            const itemTop = index * ITEM_HEIGHT;
            const containerHeight = listRef.current.clientHeight;
            // Center the item
            listRef.current.scrollTop = itemTop - containerHeight / 2 + ITEM_HEIGHT / 2;
        }
    }, [activeSegmentId, autoScroll, segments]);

    // Check continuity for merge
    const activeIndices = selectedIds.map(id => segments.findIndex(s => String(s.id) === id)).sort((a,b) => a-b);
    let isContinuous = selectedIds.length >= 2;
    for(let i=0; i < activeIndices.length - 1; i++) {
        if(activeIndices[i+1] !== activeIndices[i] + 1) isContinuous = false;
    }

    const handleMerge = () => {
        if (selectedIds.length < 2 || !isContinuous) return;
        onSegmentMerge(selectedIds);
    };

    // Check for global overlaps to enable Auto-fix button
    const hasOverlaps = useMemo(() => {
        for (let i = 1; i < segments.length; i++) {
             // Tolerance 0.05s
             if (segments[i].start < segments[i - 1].end - 0.05) return true;
        }
        return false;
    }, [segments]);

    const handleAutoFix = () => {
        if (!onAutoFix) return;
        const fixed = fixOverlaps(segments);
        onAutoFix(fixed);
    };

    // Row Renderer
    const renderRow = (index: number) => {
        const seg = segments[index];
        const idStr = String(seg.id);
        const isActive = activeSegmentId === idStr;
        const isSelected = selectedIds.includes(idStr);
        
        // Validation
        const issues = validateSegment(seg);
        
        // Overlap Check (using previous segment if sorted)
        if (index > 0) {
            const prev = segments[index - 1];
            if (seg.start < prev.end - 0.05) { // 0.05s tolerance
                issues.push({
                    type: "error",
                    message: `Overlap with #${prev.id} (${(prev.end - seg.start).toFixed(2)}s)`,
                    code: "overlap"
                });
            }
        }
        const hasError = issues.some(i => i.type === 'error');
        const hasWarning = issues.some(i => i.type === 'warning');
        const validationTooltip = issues.map(i => `[${i.type.toUpperCase()}] ${i.message}`).join('\n');

        return (
            <div 
                key={idStr}
                style={{ height: ITEM_HEIGHT, position: 'absolute', top: index * ITEM_HEIGHT, width: '100%' }}
                onClick={(e) => onSegmentClick(idStr, e.ctrlKey || e.metaKey, e.shiftKey)}
                onDoubleClick={() => onSegmentDoubleClick(idStr)}
                onContextMenu={(e) => onContextMenu(e, idStr)}
                className={`
                    group flex items-center border-b border-white/5 transition-colors cursor-pointer
                    ${isActive ? 'bg-indigo-500/10' : 'hover:bg-white/[0.02]'}
                    ${isSelected && !isActive ? 'bg-indigo-900/40 border-l-2 border-indigo-500/50' : ''}
                    ${(hasError || hasWarning) && !isActive && !isSelected ? 'bg-yellow-500/5' : ''}
                `}
            >
                {/* Active Indicator Bar */}
                {isActive && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]" />}

                {/* Timestamp & Status */}
                <div 
                    className={`w-14 text-center py-2 font-mono text-[10px] select-none flex flex-col items-center justify-center shrink-0 border-r border-white/5 h-full min-h-[2rem]
                        ${isActive ? 'text-indigo-300' : 'text-slate-500'}
                        ${(hasError || hasWarning) ? 'bg-amber-500/10 text-amber-500' : ''}
                    `}
                    title={validationTooltip}
                >
                    {(() => {
                        const mins = Math.floor(seg.start / 60);
                        const secs = Math.floor(seg.start % 60);
                        const ms = Math.floor((seg.start % 1) * 100);
                        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
                    })()}
                </div>
                
                {/* Text */}
                <div className="flex-1 py-1 px-3 select-none min-w-0 flex items-center h-full">
                    <div className={`text-sm truncate w-full ${!seg.text ? 'text-slate-600 italic' : isActive ? 'text-white font-medium' : 'text-slate-300'}`}>
                        {seg.text || "Empty segment"}
                    </div>
                </div>
                
                {/* Actions */}
                <div className="w-8 pr-1 flex justify-end shrink-0 opacity-0 group-hover:opacity-100 transition-all">
                    <button 
                        onClick={(e) => { e.stopPropagation(); onSegmentDelete(idStr); }}
                        className="p-1 hover:bg-red-500/10 rounded-md text-slate-600 hover:text-red-400 transition-colors"
                        title="Delete Segment"
                    >
                        <Trash2 size={12} />
                    </button>
                </div>
            </div>
        );
    };

    // Virtualization Logic (extracted from JSX)
    const { width, height } = size;
    const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
    const endIndex = Math.min(segments.length, Math.ceil((scrollTop + height) / ITEM_HEIGHT) + OVERSCAN);
    
    const visibleItems = [];
    if (width > 0 && height > 0) {
        // Safe loop bounds
        const start = Math.max(0, startIndex);
        const end = Math.min(segments.length, endIndex);
        for (let i = start; i < end; i++) {
            visibleItems.push(renderRow(i));
        }
    }

    return (
        <div className="flex flex-col h-full bg-[#1a1a1a] border-r border-white/5 relative">
             {/* Toolbar */}
             <div className="p-2 border-b border-white/5 flex gap-2 bg-[#1a1a1a] shrink-0 z-20">
                <button 
                  disabled={selectedIds.length < 2 || !isContinuous}
                  title={!isContinuous && selectedIds.length >= 2 ? "Can only merge adjacent segments" : "Merge selected subtitles"}
                  onClick={handleMerge}
                  className="px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-indigo-300 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5"
                >
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    Merge Selected ({selectedIds.length})
                </button>
                
                {onAutoFix && hasOverlaps && (
                    <button
                        onClick={handleAutoFix}
                        className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-300 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 animate-pulse"
                        title="Auto-fix overlapping subtitles"
                    >
                        <Wand2 size={12} /> Auto-fix Overlaps
                    </button>
                )}
             </div>

             {/* Header */}
             <div className="flex bg-[#161616] border-b border-white/5 text-[10px] uppercase tracking-wider text-slate-500 font-bold shadow-sm shrink-0 sticky top-0 z-10">
                  <div className="w-14 text-center py-1.5 border-r border-white/5">Start</div>
                  <div className="flex-1 py-1.5 px-3">Subtitle Text</div>
                  <div className="w-8 py-1.5"></div>
             </div>

            {/* Native List Container -> Virtualized */}
            <div className="flex-1 min-h-0 w-full bg-[#0a0a0a]">
                {segments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-600/50 text-sm gap-2">
                         <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
                            <span className="text-2xl opacity-20">T</span>
                         </div>
                        <p>No subtitles</p>
                    </div>
                ) : (
                    <div className="w-full h-full relative">
                        {/* Sizing Container */}
                        <div ref={containerRef} className="absolute inset-0 w-full h-full">
                           {width > 0 && height > 0 && (
                                <div
                                    ref={listRef}
                                    style={{ width, height, overflowY: 'auto', position: 'relative' }}
                                    className="custom-scrollbar"
                                    onScroll={handleScroll}
                                >
                                    <div style={{ height: segments.length * ITEM_HEIGHT, width: '100%', position: 'relative' }}>
                                        {visibleItems}
                                    </div>
                                </div>
                           )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export const SubtitleList = React.memo(SubtitleListComponent);
