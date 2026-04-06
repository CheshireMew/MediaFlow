import React, { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { SubtitleSegment } from '../../types/task';
import { Scissors, Trash2, Wand2 } from 'lucide-react';
import { validateSegment, fixOverlaps } from '../../utils/validation';
import { highlightSubtitleText } from './subtitleTextHighlight';

const ITEM_HEIGHT = 44;
const OVERSCAN = 5;
const FALLBACK_VISIBLE_ROWS = 12;

function useListViewport() {
    const ref = React.useRef<HTMLDivElement>(null);
    const [size, setSize] = React.useState({ width: 0, height: 0 });

    React.useEffect(() => {
        const element = ref.current;
        if (!element) return;

        const measure = () => {
            if (!ref.current) return;
            setSize({
                width: ref.current.clientWidth,
                height: ref.current.clientHeight,
            });
        };

        measure();

        const observer = new ResizeObserver(() => {
            measure();
        });
        observer.observe(element);
        window.addEventListener('resize', measure);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', measure);
        };
    }, []);

    return { ref, size };
}

function getViewportHeight(height: number, segmentCount: number) {
    if (height > 0) {
        return height;
    }

    return Math.min(
        Math.max(segmentCount, 1),
        FALLBACK_VISIBLE_ROWS,
    ) * ITEM_HEIGHT;
}

function getViewportWidth(width: number) {
    if (width > 0) {
        return width;
    }

    return 1;
}

interface SubtitleListProps {
    segments: SubtitleSegment[];
    activeSegmentId: string | null;
    autoScroll: boolean;
    selectedIds: string[];
    scrollResetKey?: string | null;
    onSegmentClick: (id: string, multi: boolean, shift?: boolean) => void;
    onSegmentDelete: (id: string) => void;
    onSegmentMerge: (ids: string[]) => void;
    onSegmentDoubleClick: (id: string) => void;
    onContextMenu: (e: React.MouseEvent, id: string) => void;
    onSmartSplit: () => void | Promise<void>;
    isSmartSplitting?: boolean;
    onAutoFix?: (newSegments: SubtitleSegment[]) => void;
    searchTerm?: string;
    matchCase?: boolean;
}

const SubtitleListComponent: React.FC<SubtitleListProps> = (props) => {
    const { t } = useTranslation('editor');
    const {
        segments,
        activeSegmentId,
        autoScroll,
        selectedIds,
        scrollResetKey,
        onSegmentClick,
        onSegmentDelete,
        onSegmentMerge,
        onSegmentDoubleClick,
        onContextMenu,
        onSmartSplit,
        isSmartSplitting = false,
        onAutoFix,
        searchTerm,
        matchCase
    } = props;

    const [scrollTop, setScrollTop] = React.useState(0);
    const { ref: listRef, size } = useListViewport();

    const viewportHeight = getViewportHeight(size.height, segments.length);
    const viewportWidth = getViewportWidth(size.width);

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
            const containerHeight = listRef.current.clientHeight || viewportHeight;
            // Center the item
            listRef.current.scrollTop = itemTop - containerHeight / 2 + ITEM_HEIGHT / 2;
        }
    }, [activeSegmentId, autoScroll, segments, listRef, viewportHeight]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setScrollTop(0);
            if (listRef.current) {
                listRef.current.scrollTop = 0;
            }
        }, 0);
        return () => clearTimeout(timer);
    }, [listRef, scrollResetKey]);

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
                    message: `${t('subtitleList.validationOverlap')} #${prev.id} (${(prev.end - seg.start).toFixed(2)}s)`,
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
                    <div
                        title={seg.text || undefined}
                        className={`text-sm w-full font-medium truncate whitespace-nowrap overflow-hidden ${!seg.text ? 'text-slate-600 italic' : isActive ? 'text-white' : 'text-slate-300'} leading-relaxed`}
                    >
                        {!seg.text ? t('subtitleList.emptySegmentLabel') : (
                            searchTerm ? highlightSubtitleText(seg.text, searchTerm, matchCase) : seg.text
                        )}
                    </div>
                </div>
                
                {/* Actions */}
                <div className="w-8 pr-1 flex justify-end shrink-0 opacity-0 group-hover:opacity-100 transition-all">
                    <button 
                        onClick={(e) => { e.stopPropagation(); onSegmentDelete(idStr); }}
                        className="p-1 hover:bg-red-500/10 rounded-md text-slate-600 hover:text-red-400 transition-colors"
                        title={t('subtitleList.deleteTooltip')}
                    >
                        <Trash2 size={12} />
                    </button>
                </div>
            </div>
        );
    };

    // Virtualization Logic (extracted from JSX)
    const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
    const endIndex = Math.min(
        segments.length,
        Math.ceil((scrollTop + viewportHeight) / ITEM_HEIGHT) + OVERSCAN,
    );
    
    const visibleItems = [];
    const start = Math.max(0, startIndex);
    const end = Math.min(segments.length, endIndex);
    for (let i = start; i < end; i++) {
        visibleItems.push(renderRow(i));
    }

    return (
        <div className="flex flex-col h-full bg-[#1a1a1a] border-r border-white/5 relative">
             {/* Toolbar */}
             <div className="p-2 border-b border-white/5 flex flex-wrap items-center gap-2 bg-[#1a1a1a] shrink-0 z-20">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <button 
                      disabled={selectedIds.length < 2 || !isContinuous}
                      title={!isContinuous && selectedIds.length >= 2 ? t('subtitleList.mergeAdjacentError') : t('subtitleList.mergeTooltip')}
                      onClick={handleMerge}
                      className="px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-indigo-300 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap"
                    >
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                        {t('subtitleList.mergeButton')} ({selectedIds.length})
                    </button>
                    
                    {onAutoFix && hasOverlaps && (
                        <button
                            onClick={handleAutoFix}
                            className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-300 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 animate-pulse whitespace-nowrap"
                            title={t('subtitleList.autoFixTooltip')}
                        >
                            <Wand2 size={12} /> {t('subtitleList.autoFixButton')}
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-2 shrink-0 ml-auto">
                    <button
                        onClick={onSmartSplit}
                        disabled={segments.length === 0 || isSmartSplitting}
                        title={t('subtitleList.smartSplitTooltip')}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 disabled:bg-white/5 text-amber-300 disabled:text-slate-500 border border-amber-500/20 disabled:border-white/5 text-xs font-medium transition-colors whitespace-nowrap"
                    >
                        <Scissors className="w-3.5 h-3.5" />
                        {isSmartSplitting
                            ? t('subtitleList.smartSplittingButton')
                            : t('subtitleList.smartSplitButton')}
                    </button>
                </div>
             </div>

             {/* Header */}
             <div className="flex bg-[#161616] border-b border-white/5 text-[10px] uppercase tracking-wider text-slate-500 font-bold shadow-sm shrink-0 sticky top-0 z-10">
                  <div className="w-14 text-center py-1.5 border-r border-white/5">{t('subtitleList.columnStart')}</div>
                  <div className="flex-1 py-1.5 px-3">{t('subtitleList.columnText')}</div>
                  <div className="w-8 py-1.5"></div>
             </div>

            {/* Native List Container -> Virtualized */}
            <div className="flex-1 min-h-0 w-full bg-[#0a0a0a]">
                {segments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-600/50 text-sm gap-2">
                         <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
                            <span className="text-2xl opacity-20">T</span>
                         </div>
                        <p>{t('subtitleList.emptyState')}</p>
                    </div>
                ) : (
                    <div
                        ref={listRef}
                        className="w-full h-full relative overflow-y-auto custom-scrollbar"
                        onScroll={handleScroll}
                    >
                        <div
                            style={{
                                height: segments.length * ITEM_HEIGHT,
                                width: `${viewportWidth}px`,
                                minWidth: '100%',
                                position: 'relative',
                            }}
                        >
                            {visibleItems}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export const SubtitleList = React.memo(SubtitleListComponent);
