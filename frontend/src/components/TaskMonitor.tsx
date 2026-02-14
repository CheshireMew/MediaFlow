import React, { useState } from 'react';
import { useTaskContext } from '../context/TaskContext';
import { CheckCircle, AlertCircle, Loader, Clock, Pause, Play, Trash2, FolderOpen, ChevronDown, ChevronUp, Activity, Download, FileAudio, Languages, Video } from 'lucide-react';
import { TaskTraceView } from './TaskTraceView';



export const TaskMonitor: React.FC<{ filterTypes?: string[] }> = ({ filterTypes }) => {
    const { tasks, cancelTask, connected } = useTaskContext();
    const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

    const filteredTasks = React.useMemo(() => {
        if (!filterTypes || filterTypes.length === 0) return tasks;
        return tasks.filter(t => {
            if (filterTypes.includes(t.type)) return true;
            
            // Special handling for pipelines: check if they contain relevant steps
            if (t.type === 'pipeline' && filterTypes.includes('download')) {
                const isDownloadPipeline = t.name?.toLowerCase().includes('download') || 
                    t.request_params?.steps?.some((s: any) => s.step_name === 'download' || s.action === 'download');
                if (isDownloadPipeline) return true;
            }
            
            return false;
        });
    }, [tasks, filterTypes]);

    const toggleExpand = (taskId: string) => {
        setExpandedTasks(prev => {
            const next = new Set(prev);
            if (next.has(taskId)) next.delete(taskId);
            else next.add(taskId);
            return next;
        });
    };

    // if (filteredTasks.length === 0) {
    //     return null; // Or show empty state?
    // }

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed': return <CheckCircle size={18} color="#10b981" />;
            case 'failed': return <AlertCircle size={18} color="#ef4444" />;
            case 'running': return <Loader size={18} className="spin" color="#4F46E5" />;
            case 'pending': return <Clock size={18} color="#f59e0b" />;
            case 'cancelled': return <Pause size={18} color="#f59e0b" />; // Use Pause icon for cancelled state
            default: return null;
        }
    };

    const getTaskTypeInfo = (task: any) => {
        const { type, name, request_params } = task;
        
        // Fix: "pipeline" tasks can be downloads. Check name if type is generic.
        // Also check request_params.steps for a "download" step
        const isDownloadPipeline = type === 'pipeline' && (
            name?.toLowerCase().includes('download') || 
            request_params?.steps?.some((s: any) => s.step_name === 'download' || s.action === 'download')
        );

        if (type === 'download' || isDownloadPipeline) {
             return { icon: <Download size={16} />, label: 'Download', color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/20' };
        }
        
        switch (type) {
            case 'transcribe': return { icon: <FileAudio size={16} />, label: 'Transcribe', color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/20' };
            case 'translate': return { icon: <Languages size={16} />, label: 'Translate', color: 'text-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-400/20' };
            case 'pipeline':
            case 'synthesize': 
            case 'synthesis': return { icon: <Video size={16} />, label: 'Synthesize', color: 'text-pink-400', bg: 'bg-pink-400/10', border: 'border-pink-400/20' };
            default: return { icon: <Activity size={16} />, label: 'Task', color: 'text-slate-400', bg: 'bg-slate-400/10', border: 'border-slate-400/20' };
        }
    };

    return (
        <div className="bg-[#1a1a1a] border border-white/5 rounded-2xl shadow-2xl overflow-hidden h-full flex flex-col">
            {/* ... Header ... */}
            <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02] flex-none">
                 {/* ... header content ... */}
                 {/* Re-implementing Header for context match, but simplified since I use ReplaceFileContent with strict blocks */}
                 <h3 className="text-base font-semibold text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-indigo-400" />
                    Task Monitor
                </h3>
                {/* ... existing header controls ... */}
                 <div className="flex items-center gap-4">
                    <span className={`text-[10px] font-medium flex items-center gap-1.5 ${connected ? 'text-emerald-400' : 'text-rose-400'}`}>
                        <span className={`relative flex h-2 w-2`}>
                          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${connected ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                          <span className={`relative inline-flex rounded-full h-2 w-2 ${connected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                        </span>
                        {connected ? 'Connected' : 'Disconnected'}
                    </span>
                    
                    <div className="flex gap-2">
                        {/* Pause All */}
                        <button 
                            onClick={() => {
                                if (confirm('Pause all running tasks?')) {
                                    import('../api/client').then(({ apiClient }) => {
                                        apiClient.cancelAllTasks().catch(err => console.error(err));
                                    });
                                }
                            }}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-slate-300 text-[10px] transition-all hover:text-white"
                            title="Pause all active tasks"
                        >
                            <Pause size={12} />
                            Pause All
                        </button>

                        {/* Clear All */}
                        <button 
                            onClick={() => {
                                if (confirm('Delete ALL tasks? This cannot be undone.')) {
                                    import('../api/client').then(({ apiClient }) => {
                                        apiClient.deleteAllTasks().catch(err => console.error(err));
                                    });
                                }
                            }}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-[10px] transition-all hover:text-rose-300"
                            title="Delete all tasks"
                        >
                            <Trash2 size={12} />
                            Clear All
                        </button>
                    </div>
                </div>
            </div>
            
            {/* Task List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                {filteredTasks.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-600 p-8">
                        <FolderOpen className="w-8 h-8 mb-2 opacity-20" />
                        <p className="text-sm">No active tasks</p>
                    </div>
                ) : (
                    filteredTasks.map(task => (
                        <div key={task.id} className="p-4 border-b border-white/5 hover:bg-white/[0.02] transition-colors group relative">
                            <div className="flex items-start gap-4">
                                {/* Status Icon - Top aligned with slight offset */}
                                <div className="bg-white/5 p-2 rounded-lg shrink-0 mt-0.5">
                                    {getStatusIcon(task.status)}
                                </div>

                                {/* Main Content */}
                                <div className="flex-1 min-w-0">
                                    {/* Row 1: Badge + ID + Actions Spacer */}
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-3">
                                            {(() => {
                                                const typeInfo = getTaskTypeInfo(task);
                                                return (
                                                    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-medium border ${typeInfo.bg} ${typeInfo.color} ${typeInfo.border}`}>
                                                        {typeInfo.icon}
                                                        <span className="uppercase tracking-wider">{typeInfo.label}</span>
                                                    </div>
                                                );
                                            })()}
                                            <span className="text-[10px] text-slate-600 font-mono tracking-wide">
                                                #{task.id.slice(0, 8)}
                                            </span>
                                        </div>
                                        
                                        {/* Action Buttons - Visible on Hover (Absolute positioning handled by flex justify-between if space allows, usually safe here) */}
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {task.status === 'running' || task.status === 'pending' ? (
                                                <button 
                                                    onClick={() => cancelTask(task.id)}
                                                    className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                                                    title="Pause task"
                                                >
                                                    <Pause size={14} />
                                                </button>
                                            ) : null}

                                            {(task.status === 'cancelled' || task.status === 'failed' || task.status === 'paused') && (
                                                <button 
                                                     onClick={() => {
                                                        import('../api/client').then(({ apiClient }) => {
                                                            apiClient.resumeTask(task.id).catch(err => console.error(err));
                                                        });
                                                    }}
                                                    className="p-1.5 rounded-lg hover:bg-emerald-500/20 text-emerald-500 transition-colors"
                                                    title="Resume task"
                                                >
                                                    <Play size={14} />
                                                </button>
                                            )}

                                             <button
                                                onClick={() => {
                                                    if (confirm("Delete this task?")) {
                                                        import('../api/client').then(({ apiClient }) => {
                                                            apiClient.deleteTask(task.id).catch(err => console.error(err));
                                                        });
                                                    }
                                                }}
                                                className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-500 transition-colors"
                                                title="Delete task"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                            
                                            {/* Unified Actions based on available data */}
                                            {task.status === 'completed' && (() => {
                                                const result = task.result;
                                                const params = task.request_params || {};
                                                const meta = result?.meta || {};
                                                
                                                // Helper to find file by type
                                                const findFile = (type: string) => result?.files?.find(f => f.type === type)?.path;

                                                // Resolve paths
                                                // Video: FileRef > Meta > Params
                                                const videoPath = findFile('video') || findFile('audio') || meta.video_path || meta.path || params.video_path || params.audio_path || params.file_path || params.context_path;
                                                
                                                // Subtitle: FileRef > Meta > Params
                                                let srtPath = findFile('subtitle') || meta.srt_path || meta.subtitle_path || params.srt_path || params.subtitle_path;
                                                
                                                // Detailed fallback for Translate: scan params for .srt if srtPath is missing
                                                if (!srtPath && task.type === 'translate') {
                                                     const candidates = Object.values(params).filter((v): v is string => typeof v === 'string' && v.endsWith('.srt'));
                                                     if (candidates.length > 0) srtPath = candidates[0];
                                                }
                                                
                                                // Context for "Show in Folder"
                                                const contextPath = videoPath || srtPath || meta.file_path || params.output_path;

                                                return (
                                                    <div className="flex items-center gap-1 ml-2">
                                                        <div className="w-px h-3 bg-white/10 mx-1" />
                                                        
                                                        {/* Show in Folder */}
                                                        {contextPath && (
                                                            <button
                                                                onClick={() => {
                                                                     if ((window as any).electronAPI) {
                                                                         (window as any).electronAPI.showInExplorer(contextPath);
                                                                     }
                                                                }}
                                                                className="p-1.5 rounded-lg hover:bg-blue-500/20 text-slate-400 hover:text-blue-400 transition-colors"
                                                                title="Show in folder"
                                                            >
                                                                <FolderOpen size={14} />
                                                            </button>
                                                        )}

                                                        {/* Send to Transcribe (Needs Video/Audio) */}
                                                        {videoPath && task.type !== 'transcribe' && (
                                                            <button
                                                                onClick={() => {
                                                                    sessionStorage.setItem('mediaflow:pending_file', JSON.stringify({
                                                                        video_path: videoPath,
                                                                        subtitle_path: srtPath
                                                                    }));
                                                                    window.dispatchEvent(new CustomEvent('mediaflow:navigate', { detail: 'transcriber' }));
                                                                }}
                                                                className="p-1.5 rounded-lg hover:bg-purple-500/20 text-slate-400 hover:text-purple-400 transition-colors"
                                                                title="Transcribe"
                                                            >
                                                                <FileAudio size={14} />
                                                            </button>
                                                        )}

                                                        {/* Send to Translate (Needs SRT) */}
                                                        {srtPath && task.type !== 'translate' && (
                                                            <button
                                                                onClick={() => {
                                                                    sessionStorage.setItem('mediaflow:pending_file', JSON.stringify({
                                                                        video_path: videoPath,
                                                                        subtitle_path: srtPath
                                                                    }));
                                                                    window.dispatchEvent(new CustomEvent('mediaflow:navigate', { detail: 'translator' }));
                                                                }}
                                                                className="p-1.5 rounded-lg hover:bg-indigo-500/20 text-slate-400 hover:text-indigo-400 transition-colors"
                                                                title="Translate"
                                                            >
                                                                <Languages size={14} />
                                                            </button>
                                                        )}
                                                        
                                                        {/* Send to Editor (Edit Video) - Needs Video */}
                                                        {videoPath && (
                                                             <button
                                                                onClick={() => {
                                                                    sessionStorage.setItem('mediaflow:pending_file', JSON.stringify({
                                                                        video_path: videoPath,
                                                                        subtitle_path: srtPath
                                                                    }));
                                                                    window.dispatchEvent(new CustomEvent('mediaflow:navigate', { detail: 'editor' }));
                                                                }}
                                                                className="p-1.5 rounded-lg hover:bg-pink-500/20 text-slate-400 hover:text-pink-400 transition-colors"
                                                                title="Edit Video"
                                                            >
                                                                <Video size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })()}

                                            {task.result?.meta?.execution_trace && (
                                                <button 
                                                    onClick={() => toggleExpand(task.id)}
                                                    className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 transition-colors ml-1"
                                                >
                                                    {expandedTasks.has(task.id) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {/* Row 2: Title */}
                                    <div 
                                        className="font-medium text-slate-200 text-sm leading-relaxed truncate pr-8"
                                        title={task.name || task.type}
                                    >
                                        {task.name || (task.type === 'download' ? 'Downloading' : 'Task')} 
                                    </div>

                                    {/* Row 3: Message & Progress (Inline) */}
                                    <div className="mt-3 flex items-center justify-between gap-6">
                                        {/* Left: Message */}
                                         <div className="flex-1 min-w-0">
                                            <p className="text-xs text-slate-400 truncate flex items-center gap-2">
                                                {task.error ? (
                                                    <span className="text-rose-400 flex items-center gap-1.5">
                                                        <AlertCircle size={12} />
                                                        {task.error}
                                                    </span>
                                                ) : (
                                                    task.message || 'Initializing...'
                                                )}
                                            </p>
                                        </div>

                                        {/* Right: Progress Bar & Percent */}
                                        {(task.status === 'running' || task.progress > 0) && (
                                            <div className="w-48 flex items-center gap-3 shrink-0">
                                                <div className="h-1.5 flex-1 bg-slate-800 rounded-full overflow-hidden">
                                                    <div 
                                                        className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300 ease-out"
                                                        style={{ width: `${Math.max(0, Math.min(100, task.progress))}%` }}
                                                    />
                                                </div>
                                                <div className="text-[10px] font-mono text-slate-400 w-8 text-right">
                                                    {task.progress.toFixed(0)}%
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Debug Info (Only in Dev) */}
                                    {import.meta.env.DEV && (
                                        <details className="mt-2 text-[10px] text-slate-600 cursor-pointer">
                                            <summary className="hover:text-slate-400">Debug Info</summary>
                                            <pre className="mt-1 p-2 bg-black/50 rounded overflow-auto max-h-40 whitespace-pre-wrap">
                                                {JSON.stringify({ 
                                                    type: task.type, 
                                                    status: task.status, 
                                                    params_keys: Object.keys(task.request_params || {}),
                                                    result_files: task.result?.files,
                                                    result_meta: task.result?.meta
                                                }, null, 2)}
                                            </pre>
                                        </details>
                                    )}
                                </div>
                            </div>

                            {/* Execution Trace View */}
                            {expandedTasks.has(task.id) && task.result?.meta?.execution_trace && (
                                <div className="mt-3 pl-[52px]">
                                    <div className="bg-black/30 rounded-lg overflow-hidden border border-white/5">
                                        <TaskTraceView trace={task.result.meta.execution_trace} />
                                    </div>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
            
            <style>{`
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { 100% { transform: rotate(360deg); } }
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { bg: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #444; }
            `}</style>
        </div>
    );
};
