import { FileUploader } from './FileUploader';
import type { SubtitleSegment } from '../../types/task';

interface SegmentsTableProps {
    sourceSegments: SubtitleSegment[];
    targetSegments: SubtitleSegment[];
    onUpdateTarget: (index: number, text: string) => void;
    onFileSelect: (path: string) => void;
}

export const SegmentsTable = ({ sourceSegments, targetSegments, onUpdateTarget, onFileSelect }: SegmentsTableProps) => {
    return (
        <div className="flex-1 overflow-y-auto min-h-0 relative scrollbar-thin scrollbar-track-slate-900 scrollbar-thumb-slate-700 bg-slate-900/30">
            {sourceSegments.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full p-10">
                    <div className="max-w-md w-full">
                        <FileUploader onFileSelect={onFileSelect} currentFile={null} />
                    </div>
                </div>
            ) : (
                sourceSegments.map((srcSeg, index) => {
                    // Optimized for index alignment as IDs might match
                    const tgtSeg = targetSegments[index];
                    
                    return (
                        <div key={srcSeg.id} className="flex border-b border-slate-800 hover:bg-slate-800/50 transition-colors group">
                            {/* Source Column */}
                            <div className="flex-1 p-2 border-r border-slate-800 min-w-0">
                                <div className="flex justify-between text-[10px] text-slate-500 font-mono mb-1 select-none">
                                    <span className="opacity-50">#{srcSeg.id}</span>
                                    <span className="bg-slate-800/50 px-1 rounded">{srcSeg.start.toFixed(2)} - {srcSeg.end.toFixed(2)}</span>
                                </div>
                                <div className="text-sm text-slate-300 leading-snug whitespace-pre-wrap break-words">
                                    {srcSeg.text}
                                </div>
                            </div>

                            {/* Target Column */}
                            <div className="flex-1 p-2 min-w-0 bg-slate-950/30 relative">
                                {tgtSeg ? (
                                    <>
                                         <div className="flex justify-between text-[10px] text-slate-500 font-mono mb-1 opacity-0 group-hover:opacity-100 transition-opacity select-none">
                                             <span className="opacity-50">#{tgtSeg.id}</span>
                                         </div>
                                         <textarea 
                                             className="w-full bg-transparent text-sm text-indigo-100 placeholder-slate-700 focus:outline-none resize-none leading-snug whitespace-pre-wrap break-words overflow-hidden"
                                             value={tgtSeg.text}
                                             onChange={(e) => onUpdateTarget(index, e.target.value)}
                                             rows={1}
                                             style={{ minHeight: '1.5em', height: 'auto', fieldSizing: 'content' } as any}
                                             spellCheck={false}
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
                })
            )}
        </div>
    );
};
