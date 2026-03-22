import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, ArrowUp, ArrowDown, X, Replace } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SubtitleSegment } from '../../types/task';
import { findTextMatches, replaceAllLiteral } from './findReplaceUtils';

interface FindReplaceDialogProps {
    isOpen: boolean;
    initialMode: 'find' | 'replace';
    onClose: () => void;
    regions: SubtitleSegment[];
    onSelectSegment: (id: string) => void;
    onUpdateSegment: (id: string, text: string) => void;
    onUpdateSegments: (segments: SubtitleSegment[]) => void;
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    matchCase: boolean;
    setMatchCase: (matchCase: boolean) => void;
}

interface Match {
    id: string; // Region ID
    start: number; // Text index start
    end: number;
}

export const FindReplaceDialog: React.FC<FindReplaceDialogProps> = ({
    isOpen,
    initialMode,
    onClose,
    regions,
    onSelectSegment,
    onUpdateSegment,
    onUpdateSegments,
    searchTerm,
    setSearchTerm,
    matchCase,
    setMatchCase
}) => {
    const { t } = useTranslation('editor');
    const [replaceTerm, setReplaceTerm] = useState("");
    const [currentIndex, setCurrentIndex] = useState(-1);
    
    // Focus management
    const searchInputRef = useRef<HTMLInputElement>(null);
    const replaceInputRef = useRef<HTMLInputElement>(null);
    
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => {
                if (initialMode === 'replace' && replaceInputRef.current) {
                    replaceInputRef.current.focus();
                } else if (searchInputRef.current) {
                    searchInputRef.current.focus();
                }
            }, 50);
        }
    }, [isOpen, initialMode]);

    useEffect(() => {
        if (!isOpen) {
            const timer = setTimeout(() => {
                setReplaceTerm("");
                setCurrentIndex(-1);
            }, 0);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);
    
    const matches = useMemo(() => {
        if (!searchTerm) {
            return [];
        }

        const newMatches: Match[] = [];
        regions.forEach(r => {
            if (!r.text) return;
            const regionMatches = findTextMatches(r.text, searchTerm, matchCase);

            regionMatches.forEach(({ start, end }) => {
                newMatches.push({
                   id: String(r.id),
                   start,
                   end
                });
            });
        });

        return newMatches;
    }, [searchTerm, matchCase, regions]);

    const activeIndex =
        matches.length === 0
            ? -1
            : currentIndex >= 0 && currentIndex < matches.length
              ? currentIndex
              : 0;

    useEffect(() => {
        if (activeIndex >= 0) {
            onSelectSegment(matches[activeIndex].id);
        }
    }, [activeIndex, matches, onSelectSegment]);

    const handleNext = () => {
        if (matches.length === 0) return;
        const next = ((activeIndex >= 0 ? activeIndex : 0) + 1) % matches.length;
        setCurrentIndex(next);
        onSelectSegment(matches[next].id);
    };

    const handlePrev = () => {
        if (matches.length === 0) return;
        const prev = ((activeIndex >= 0 ? activeIndex : 0) - 1 + matches.length) % matches.length;
        setCurrentIndex(prev);
        onSelectSegment(matches[prev].id);
    };

    const handleReplace = () => {
        if (activeIndex === -1 || matches.length === 0) return;
        
        const currentMatch = matches[activeIndex];
        const region = regions.find(r => String(r.id) === currentMatch.id);
        if (!region || !region.text) return;

        // Naive logic: Re-fetch region text just in case? 
        // We rely on 'regions' prop being up to date.
        
        // ISSUE: If multiple matches in same segment, indices shift after replacement.
        // Solution: Only replace ONE, then let useEffect re-calc matches.
        
        // Exact reconstruction
        // Note: 'currentMatch.start' is valid for the text used in the search effect.
        // If user typed elsewhere meanwhile, it might be stale.
        // Ideally we grab the text, verify match is still there.
        
        const text = region.text;
        const prefix = text.substring(0, currentMatch.start);
        const suffix = text.substring(currentMatch.end);
        const newText = prefix + replaceTerm + suffix;
        
        onUpdateSegment(currentMatch.id, newText);
        // Note: This triggers useEffect -> re-search -> matches updated
    };

    const handleReplaceAll = () => {
        if (!searchTerm) return;
        
        // Group matches by region to minimize updates
        const dirtyRegions = new Set<string>();
        matches.forEach(m => dirtyRegions.add(m.id));
        
        const updatedSegments: SubtitleSegment[] = [];
        dirtyRegions.forEach(id => {
             const region = regions.find(r => String(r.id) === id);
             if (region && region.text) {
                 const newText = replaceAllLiteral(region.text, searchTerm, replaceTerm, matchCase);
                 if (newText !== region.text) {
                     updatedSegments.push({
                         ...region,
                         text: newText
                     });
                 }
             }
        });

        if (updatedSegments.length > 0) {
            onUpdateSegments(updatedSegments);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="absolute top-16 right-8 w-80 bg-slate-800/95 backdrop-blur-md border border-slate-700 shadow-2xl rounded-lg z-[100] flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-4 duration-200 pointer-events-auto no-drag">
             {/* Header */}
             <div className="flex items-center justify-between p-2 bg-slate-900/50 border-b border-slate-700 select-none">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-2">{t('findReplace.title')}</span>
                  <button aria-label={t('findReplace.closeButton', 'Close')} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }} className="text-slate-400 hover:text-white hover:bg-slate-700 p-1.5 rounded-md transition-colors z-10 relative">
                      <X size={14} />
                  </button>
             </div>
             
             {/* Body */}
             <div className="p-3 flex flex-col gap-3">
                 {/* Search Input */}
                 <div className="relative">
                     <Search size={14} className="absolute left-2.5 top-2.5 text-slate-500" />
                     <input 
                        ref={searchInputRef}
                        type="text" 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder={t('findReplace.findPlaceholder')}
                        className="w-full bg-slate-900/80 border border-slate-700 rounded-md pl-8 pr-16 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder-slate-500 relative z-10"
                        onKeyDown={e => {
                            if (e.key === 'Enter') {
                                if (e.shiftKey) handlePrev();
                                else handleNext();
                            }
                        }}
                     />
                     <div className="absolute right-1 top-1 flex items-center gap-1">
                          <span className="text-xs text-slate-500 py-1.5 px-2 font-mono">
                             {matches.length > 0 ? `${activeIndex + 1}/${matches.length}` : '0/0'}
                          </span>
                          <div className="flex bg-slate-800 rounded border border-slate-700 overflow-hidden z-20">
                              <button onClick={handlePrev} disabled={matches.length === 0} className="p-1 hover:bg-slate-700 disabled:opacity-50 text-slate-400 hover:text-white transition-colors" title={t('findReplace.previousTooltip', '上一个 (Shift+Enter)')}>
                                  <ArrowUp size={14} />
                              </button>
                              <div className="w-px bg-slate-700" />
                              <button onClick={handleNext} disabled={matches.length === 0} className="p-1 hover:bg-slate-700 disabled:opacity-50 text-slate-400 hover:text-white transition-colors" title={t('findReplace.nextTooltip', '下一个 (Enter)')}>
                                  <ArrowDown size={14} />
                              </button>
                          </div>
                     </div>
                 </div>
                 
                 {/* Replace Input */}
                 <div className="relative flex gap-2">
                     <div className="relative flex-1">
                        <Replace size={14} className="absolute left-2.5 top-2.5 text-slate-500" />
                        <input 
                            ref={replaceInputRef}
                            type="text" 
                            value={replaceTerm}
                            onChange={e => setReplaceTerm(e.target.value)}
                            placeholder={t('findReplace.replacePlaceholder')}
                            className="w-full bg-slate-900/80 border border-slate-700 rounded-md pl-8 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder-slate-500 relative z-10"
                        />
                     </div>
                 </div>

                 {/* Options */}
                 <div className="flex items-center gap-2">
                     <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
                         <input 
                            type="checkbox" 
                            checked={matchCase}
                            onChange={e => setMatchCase(e.target.checked)}
                            className="rounded border-slate-600 bg-slate-700 text-indigo-500 focus:ring-offset-0 focus:ring-1"
                         />
                         {t('findReplace.matchCaseLabel')}
                     </label>
                 </div>

                 {/* Actions */}
                 <div className="flex justify-end mt-1">
                      <div className="flex gap-2">
                          <button onClick={handleReplace} disabled={matches.length === 0} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-xs text-white disabled:opacity-50 transition-colors z-10 relative">
                              {t('findReplace.replaceButton', '替换')}
                          </button>
                          <button onClick={handleReplaceAll} disabled={matches.length === 0} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-xs text-white disabled:opacity-50 transition-colors z-10 relative">
                              {t('findReplace.replaceAllButton', '全部替换')}
                          </button>
                      </div>
                 </div>
             </div>
        </div>
    );
};
