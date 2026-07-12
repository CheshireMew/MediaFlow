import { Film, Image as ImageIcon, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ProjectFile } from '../../stores/preprocessingStore';

interface ProjectFileListProps {
    files: ProjectFile[];
    selectedPath: string | null;
    onSelect: (file: ProjectFile) => void;
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
        <div className="flex w-64 flex-col border-r border-white/5 bg-[#141414] max-lg:h-36 max-lg:w-full max-lg:shrink-0 max-lg:border-r-0 max-lg:border-b">
            <div className="p-4 border-b border-white/5 pb-2">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t('projectFiles.title')}</h3>
            </div>
            <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                {files.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400 italic">
                        {t('projectFiles.emptyState')}
                    </div>
                ) : (
                    files.map((file) => (
                        <div
                            key={file.path}
                            className={`p-3 rounded-xl border flex gap-3 transition-all group/file
                                ${selectedPath === file.path
                                    ? 'bg-indigo-500/10 border-indigo-500/30 shadow-sm'
                                    : 'bg-[#1a1a1a] border-white/5 hover:bg-white/5 hover:border-white/10'
                                }`}
                        >
                            <button
                                type="button"
                                onClick={() => onSelect(file)}
                                aria-pressed={selectedPath === file.path}
                                className="flex min-w-0 flex-1 gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                            >
                                <div className="w-12 h-12 rounded-lg bg-black/40 flex items-center justify-center flex-shrink-0">
                                    {file.name.endsWith('.mp4') || file.name.endsWith('.mov') || file.name.endsWith('.mkv')
                                        ? <Film size={18} className={selectedPath === file.path ? "text-indigo-400" : "text-slate-400"} />
                                        : <ImageIcon size={18} className="text-slate-400" />
                                    }
                                </div>
                                <div className="flex min-w-0 flex-1 flex-col justify-center">
                                    <div className={`text-sm font-medium truncate ${selectedPath === file.path ? 'text-indigo-200' : 'text-slate-300'}`}>
                                        {file.name}
                                    </div>
                                    <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                                        <span>{formatBytes(file.size)}</span>
                                        {file.resolution && (
                                            <>
                                                <span className="w-0.5 h-0.5 bg-slate-500 rounded-full"></span>
                                                <span>{file.resolution}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </button>
                            {/* Delete Button */}
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onRemove(file.path);
                                }}
                                className="self-center rounded-md p-1 text-slate-400 opacity-100 transition-all hover:bg-rose-500/20 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 md:opacity-0 md:group-hover/file:opacity-100 md:group-focus-within/file:opacity-100"
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
