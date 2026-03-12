import { Film, Image as ImageIcon, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// ─── Types ──────────────────────────────────────────────────────
interface PreprocessingFile {
    path: string;
    name: string;
    size: number;
    resolution?: string;
}

interface ProjectFileListProps {
    files: PreprocessingFile[];
    selectedPath: string | null;
    onSelect: (path: string) => void;
    onRemove: (path: string) => void;
}

// ─── Helpers ────────────────────────────────────────────────────
function formatBytes(bytes: number, decimals = 1): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// ─── Component ──────────────────────────────────────────────────
export function ProjectFileList({ files, selectedPath, onSelect, onRemove }: ProjectFileListProps) {
    const { t } = useTranslation('preprocessing');
    return (
        <div className="w-64 bg-[#141414] border-r border-white/5 flex flex-col">
            <div className="p-4 border-b border-white/5 pb-2">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('projectFiles.title')}</h3>
            </div>
            <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                {files.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-600 italic">
                        {t('projectFiles.emptyState')}
                    </div>
                ) : (
                    files.map((file) => (
                        <div
                            key={file.path}
                            onClick={() => onSelect(file.path)}
                            className={`p-3 rounded-xl border cursor-pointer flex gap-3 transition-all group/file
                                ${selectedPath === file.path
                                    ? 'bg-indigo-500/10 border-indigo-500/30 shadow-sm'
                                    : 'bg-[#1a1a1a] border-white/5 hover:bg-white/5 hover:border-white/10'
                                }`}
                        >
                            <div className="w-12 h-12 rounded-lg bg-black/40 flex items-center justify-center flex-shrink-0">
                                {file.name.endsWith('.mp4') || file.name.endsWith('.mov') || file.name.endsWith('.mkv')
                                    ? <Film size={18} className={selectedPath === file.path ? "text-indigo-400" : "text-slate-500"} />
                                    : <ImageIcon size={18} className="text-slate-500" />
                                }
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                                <div className={`text-sm font-medium truncate ${selectedPath === file.path ? 'text-indigo-200' : 'text-slate-300'}`}>
                                    {file.name}
                                </div>
                                <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-2">
                                    <span>{formatBytes(file.size)}</span>
                                    {file.resolution && (
                                        <>
                                            <span className="w-0.5 h-0.5 bg-slate-600 rounded-full"></span>
                                            <span>{file.resolution}</span>
                                        </>
                                    )}
                                </div>
                            </div>
                            {/* Delete Button */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onRemove(file.path);
                                }}
                                className="self-center p-1 rounded-md opacity-0 group-hover/file:opacity-100 hover:bg-rose-500/20 text-slate-600 hover:text-rose-400 transition-all"
                                title={t('projectFiles.removeTooltip')}
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
