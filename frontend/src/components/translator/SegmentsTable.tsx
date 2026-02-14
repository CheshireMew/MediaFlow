import { FileUploader } from './FileUploader';
import type { SubtitleSegment } from '../../types/task';
import { Clock } from 'lucide-react';

interface SegmentsTableProps {
    sourceSegments: SubtitleSegment[];
    targetSegments: SubtitleSegment[];
    onUpdateTarget: (index: number, text: string) => void;
    onFileSelect: (path: string) => void;
}

const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    
    if (h > 0) {
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export const SegmentsTable = ({ sourceSegments, targetSegments, onUpdateTarget, onFileSelect }: SegmentsTableProps) => {
    return (
        <div className="flex-1 overflow-y-auto min-h-0 relative scroll-smooth custom-scrollbar bg-black/20">
            {sourceSegments.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full p-10">
                    <div className="max-w-md w-full">
                        <FileUploader onFileSelect={onFileSelect} currentFile={null} />
                    </div>
                </div>
            ) : (
                <div className="divide-y divide-white/5">
                    {sourceSegments.map((srcSeg, index) => {
                        // Optimized for index alignment as IDs might match
                        const tgtSeg = targetSegments[index];
                        
                        return (
                            <div key={srcSeg.id} className="grid grid-cols-2 group hover:bg-white/[0.02] transition-colors">
                                {/* Source Column */}
                                <div className="p-4 border-r border-white/5 min-w-0 flex flex-col gap-2">
                                    <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono select-none">
                                        <span className="opacity-50">#{srcSeg.id}</span>
                                        <div className="flex items-center gap-1 bg-white/5 px-1.5 py-0.5 rounded text-slate-400">
                                            <Clock size={10} />
                                            {formatTime(srcSeg.start)} - {formatTime(srcSeg.end)}
                                        </div>
                                    </div>
                                    <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
                                        {srcSeg.text}
                                    </div>
                                </div>

                                {/* Target Column */}
                                <div className="p-4 min-w-0 bg-indigo-500/[0.01] relative group/edit">
                                    {tgtSeg ? (
                                        <>
                                            <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono mb-2 opacity-0 group-hover/edit:opacity-100 transition-opacity select-none absolute top-4 right-4">
                                                 <span className="bg-indigo-500/10 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/20">Target</span>
                                            </div>
                                             <textarea 
                                                 className="w-full h-full bg-transparent text-sm text-indigo-100 placeholder-slate-600 focus:outline-none resize-none leading-relaxed whitespace-pre-wrap break-words overflow-hidden min-h-[min-content]"
                                                 value={tgtSeg.text}
                                                 onChange={(e) => {
                                                     // Auto-grow
                                                     e.target.style.height = 'auto';
                                                     e.target.style.height = e.target.scrollHeight + 'px';
                                                     onUpdateTarget(index, e.target.value);
                                                 }}
                                                 placeholder=""
                                                 spellCheck={false}
                                                 style={{ fieldSizing: 'content' } as any}
                                             />
                                        </>
                                    ) : (
                                        <div className="h-full flex items-center justify-center opacity-10">
                                            <span className="text-xs text-slate-600">...</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
