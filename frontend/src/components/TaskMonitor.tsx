import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTaskContext } from '../context/taskContext';
import type { Task, TaskResult } from '../types/task';
import { fileService } from '../services/fileService';
import { CheckCircle, AlertCircle, Loader, Clock, Pause, Play, Trash2, FolderOpen, ChevronDown, ChevronUp, Activity, Download, FileAudio, Languages, Video } from 'lucide-react';
import { TaskTraceView } from './TaskTraceView';
import { NavigationService } from '../services/ui/navigation';
import {
    hasTaskSubtitleMedia,
    hasTaskVideoMedia,
    resolveTaskMediaPaths,
    resolveTaskNavigationPayload,
} from '../services/ui/taskMedia';
import { createTaskDiagnostic } from '../services/debug/runtimeDiagnostics';
import { useTaskMonitorOverview } from './task-monitor/useTaskMonitorOverview';

type TaskWithDetails = Task & { result?: TaskResult };

export const TaskMonitor: React.FC<{ filterTypes?: string[]; showHeaderOverview?: boolean }> = ({
    filterTypes,
    showHeaderOverview = true,
}) => {
    const { t } = useTranslation('taskmonitor');
    const {
        pauseLocalTasks,
        pauseRemoteTasks,
        pauseAllTasks,
        pauseTask,
        resumeTask,
        deleteTask,
        clearTasks,
    } = useTaskContext();
    const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
    const {
        connected,
        desktopRuntime,
        executionBadges,
        executionSummary,
        filteredTasks,
        remoteTasksReady,
        summary,
        taskFeedDiagnostics,
        taskOwnerMode,
    } = useTaskMonitorOverview(filterTypes);

    const toggleExpand = (taskId: string) => {
        setExpandedTasks(prev => {
            const next = new Set(prev);
            if (next.has(taskId)) next.delete(taskId);
            else next.add(taskId);
            return next;
        });
    };

    const resolveTaskPaths = React.useCallback(async (task: TaskWithDetails) => {
        return await resolveTaskMediaPaths(task);
    }, []);

    const renderCompatUsageSummary = (task: TaskWithDetails) => {
        const diagnostic = createTaskDiagnostic(task, executionSummary);

        if (
            !diagnostic.task_contract_normalized_from_legacy
        ) {
            return null;
        }

        return (
            <div className="mt-2 flex flex-wrap gap-1.5">
                {diagnostic.task_contract_normalized_from_legacy && (
                    <span
                        className="px-1.5 py-0.5 rounded border border-rose-400/20 bg-rose-400/10 text-[10px] text-rose-200 font-mono"
                    >
                        contract: legacy-normalized
                    </span>
                )}
            </div>
        );
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
            case 'paused': return <Pause size={18} color="#f59e0b" />;
            case 'cancelled': return <Pause size={18} color="#ef4444" />;
            default: return null;
        }
    };

    const getTaskTypeInfo = (task: TaskWithDetails) => {
        const { type, name, request_params } = task;
        
        // Fix: "pipeline" tasks can be downloads. Check name if type is generic.
        // Also check request_params.steps for a "download" step
        const isDownloadPipeline = type === 'pipeline' && (
            name?.toLowerCase().includes('download') || 
            request_params?.steps?.some((s) => s.step_name === 'download' || s.action === 'download')
        );

        if (type === 'download' || isDownloadPipeline) {
             return { icon: <Download size={16} />, label: t('taskTypes.download'), color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/20' };
        }

        switch (type) {
            case 'transcribe': return { icon: <FileAudio size={16} />, label: t('taskTypes.transcribe'), color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/20' };
            case 'translate': return { icon: <Languages size={16} />, label: t('taskTypes.translate'), color: 'text-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-400/20' };
            case 'pipeline':
            case 'synthesize':
            case 'synthesis': return { icon: <Video size={16} />, label: t('taskTypes.synthesize'), color: 'text-pink-400', bg: 'bg-pink-400/10', border: 'border-pink-400/20' };
            default: return { icon: <Activity size={16} />, label: t('taskTypes.generic'), color: 'text-slate-400', bg: 'bg-slate-400/10', border: 'border-slate-400/20' };
        }
    };

    const renderQueueBadge = (task: TaskWithDetails) => {
        if (task.persistence_scope === 'history') {
            return (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-medium border bg-emerald-400/10 text-emerald-300 border-emerald-400/20">
                    {t('badges.history')}
                </span>
            );
        }
        if (task.queue_state === 'queued' || task.status === 'pending') {
            return (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-medium border bg-amber-400/10 text-amber-300 border-amber-400/20">
                    {task.queue_position ? `Queue #${task.queue_position}` : 'Queued'}
                </span>
            );
        }
        if (task.queue_state === 'running' || task.status === 'running') {
            return (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-medium border bg-indigo-400/10 text-indigo-300 border-indigo-400/20">
                    Running
                </span>
            );
        }
        if (task.queue_state === 'paused' || task.status === 'paused') {
            return (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-medium border bg-slate-400/10 text-slate-300 border-slate-400/20">
                    Paused
                </span>
            );
        }
        return null;
    };

    return (
        <div className="bg-[#1a1a1a] border border-white/5 rounded-2xl shadow-2xl overflow-hidden h-full flex flex-col">
            {/* ... Header ... */}
            <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02] flex-none">
                 {/* ... header content ... */}
                 {/* Re-implementing Header for context match, but simplified since I use ReplaceFileContent with strict blocks */}
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-indigo-400" />
                    {t('title')}
                </h3>
                {/* ... existing header controls ... */}
                <div className="flex items-center gap-4">
                    {showHeaderOverview && (
                        <>
                    <div className="hidden md:flex items-center gap-2 text-[10px] text-slate-400">
                        <span className="px-2 py-1 rounded-md bg-amber-400/10 text-amber-300 border border-amber-400/20">
                            Queue {summary.pending}
                        </span>
                        <span className="px-2 py-1 rounded-md bg-indigo-400/10 text-indigo-300 border border-indigo-400/20">
                            Running {summary.running}
                        </span>
                        <span className="px-2 py-1 rounded-md bg-slate-400/10 text-slate-300 border border-slate-400/20">
                            Paused {summary.paused}
                        </span>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="px-2 py-1 rounded-md bg-cyan-400/10 text-cyan-300 border border-cyan-400/20 text-[10px] font-mono">
                            owner {taskOwnerMode}
                        </span>
                        <span className={`text-[10px] font-medium flex items-center gap-1.5 ${connected ? 'text-emerald-400' : 'text-rose-400'}`}>
                            <span className="relative flex h-2 w-2">
                                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${connected ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                                <span className={`relative inline-flex rounded-full h-2 w-2 ${connected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                            </span>
                            {t('status.localTasks')}: {connected ? t('status.ready') : t('status.waiting')}
                        </span>
                        {!desktopRuntime && (
                            <span className={`text-[10px] font-medium flex items-center gap-1.5 ${remoteTasksReady ? 'text-emerald-400' : 'text-rose-400'}`}>
                                <span className="relative flex h-2 w-2">
                                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${remoteTasksReady ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                                    <span className={`relative inline-flex rounded-full h-2 w-2 ${remoteTasksReady ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                                </span>
                                {t('status.backendTasks')}: {remoteTasksReady ? t('status.ready') : t('status.waiting')}
                            </span>
                        )}
                    </div>
                    {executionBadges.length > 0 && (
                        <div className="hidden lg:flex items-center gap-2 text-[10px]">
                            {executionBadges.map((badge) => (
                                <span key={badge.key} className={`px-2 py-1 rounded-md border font-mono ${badge.className}`}>
                                    {badge.label} {badge.count}
                                </span>
                            ))}
                        </div>
                    )}
                        </>
                    )}
                    
                    <div className="flex gap-2">
                        <button
                            onClick={() => {
                                if (confirm(t('buttons.pauseLocal.tooltip'))) {
                                    pauseLocalTasks().catch(err => console.error(err));
                                }
                            }}
                            disabled={!connected}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-slate-300 text-[10px] transition-all hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                            title={t('buttons.pauseLocal.tooltip')}
                        >
                            <Pause size={12} />
                            {t('buttons.pauseLocal.label')}
                        </button>

                        {!desktopRuntime && (
                            <button
                                onClick={() => {
                                    if (confirm(t('buttons.pauseBackend.tooltip'))) {
                                        pauseRemoteTasks().catch(err => console.error(err));
                                    }
                                }}
                                disabled={!remoteTasksReady}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-slate-300 text-[10px] transition-all hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                                title={t('buttons.pauseBackend.tooltip')}
                            >
                                <Pause size={12} />
                                {t('buttons.pauseBackend.label')}
                            </button>
                        )}

                        {/* Pause All */}
                        <button 
                            onClick={() => {
                                if (confirm(t('buttons.pauseAll.tooltip'))) {
                                    pauseAllTasks().catch(err => console.error(err));
                                }
                            }}
                            disabled={desktopRuntime ? !connected : (!connected && !remoteTasksReady)}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-slate-300 text-[10px] transition-all hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                            title={t('buttons.pauseAll.tooltip')}
                        >
                            <Pause size={12} />
                            {t('buttons.pauseAll.label')}
                        </button>

                        {/* Clear All */}
                        <button 
                            onClick={() => {
                                if (confirm(t('confirm.deleteAllTasks'))) {
                                    clearTasks().catch(err => console.error(err));
                                }
                            }}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-[10px] transition-all hover:text-rose-300"
                            title={t('buttons.clearAll.tooltip')}
                        >
                            <Trash2 size={12} />
                            {t('buttons.clearAll.label')}
                        </button>
                    </div>
                </div>
            </div>
            {taskFeedDiagnostics.lastIssue && (
                <div className="px-4 py-2 border-b border-amber-500/10 bg-amber-500/10 text-[11px] text-amber-200">
                    Ignored incompatible task feed item.
                    {` reason=${taskFeedDiagnostics.lastIssue.reason}, expected=${taskFeedDiagnostics.lastIssue.expected}, received=${taskFeedDiagnostics.lastIssue.received}, ignored=${taskFeedDiagnostics.ignoredTaskCount}`}
                </div>
            )}
            
            {/* Task List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                {filteredTasks.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-600 p-8">
                        <FolderOpen className="w-8 h-8 mb-2 opacity-20" />
                        <p className="text-sm">{t('emptyState.message')}</p>
                    </div>
                ) : (
                    filteredTasks.map(task => {
                        return (
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
                                            {renderQueueBadge(task)}
                                            <span className="text-[10px] text-slate-600 font-mono tracking-wide">
                                                #{task.id.slice(0, 8)}
                                            </span>
                                        </div>
                                        
                                        {/* Action Buttons - Visible on Hover (Absolute positioning handled by flex justify-between if space allows, usually safe here) */}
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {task.status === 'running' || task.status === 'pending' ? (
                                                <button 
                                                    onClick={() => {
                                                        void pauseTask(task.id);
                                                    }}
                                                    className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                                                    title={t('actions.pause.tooltip')}
                                                >
                                                    <Pause size={14} />
                                                </button>
                                            ) : null}

                                            {task.status === 'paused' && (
                                                <button 
                                                    onClick={() => {
                                                        void Promise.resolve(resumeTask(task.id)).catch(err => console.error(err));
                                                    }}
                                                    className="p-1.5 rounded-lg hover:bg-emerald-500/20 text-emerald-500 transition-colors"
                                                    title={t('actions.resume.tooltip')}
                                                >
                                                    <Play size={14} />
                                                </button>
                                            )}

                                             <button
                                                onClick={() => {
                                                    if (confirm(t('confirm.deleteTask'))) {
                                                        void Promise.resolve(deleteTask(task.id)).catch(err => console.error(err));
                                                    }
                                                }}
                                                className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-500 transition-colors"
                                                title={t('actions.delete.tooltip')}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                            
                                            {/* Unified Actions based on available data */}
                                            {task.status === 'completed' && (() => {
                                                const hasTaskVideoPath = hasTaskVideoMedia(task);
                                                const hasTaskSubtitlePath = hasTaskSubtitleMedia(task);

                                                return (
                                                    <div className="flex items-center gap-1 ml-2">
                                                        <div className="w-px h-3 bg-white/10 mx-1" />
                                                        
                                                        {/* Show in Folder */}
                                                        {(hasTaskVideoPath || hasTaskSubtitlePath) && (
                                                            <button
                                                                onClick={() => {
                                                                     void resolveTaskPaths(task).then(({ contextPath }) => {
                                                                        if (!contextPath) {
                                                                            return;
                                                                        }
                                                                        return fileService.showInExplorer(contextPath);
                                                                     });
                                                                }}
                                                                className="p-1.5 rounded-lg hover:bg-blue-500/20 text-slate-400 hover:text-blue-400 transition-colors"
                                                                title={t('actions.showFolder.tooltip')}
                                                            >
                                                                <FolderOpen size={14} />
                                                            </button>
                                                        )}

                                                        {/* Send to Transcribe (Needs Video/Audio) */}
                                                        {hasTaskVideoPath && task.type !== 'transcribe' && (
                                                            <button
                                                                onClick={() => {
                                                                    void resolveTaskNavigationPayload(task).then((payload) => {
                                                                        if (!payload.video_ref?.path) {
                                                                            return;
                                                                        }
                                                                        NavigationService.navigate(
                                                                            'transcriber',
                                                                            payload,
                                                                        );
                                                                    });
                                                                }}
                                                                className="p-1.5 rounded-lg hover:bg-purple-500/20 text-slate-400 hover:text-purple-400 transition-colors"
                                                                title="Transcribe"
                                                            >
                                                                <FileAudio size={14} />
                                                            </button>
                                                        )}

                                                        {/* Send to Translate (Needs SRT) */}
                                                        {hasTaskSubtitlePath && task.type !== 'translate' && (
                                                            <button
                                                                onClick={() => {
                                                                    void resolveTaskNavigationPayload(task).then((payload) => {
                                                                        if (!payload.subtitle_ref?.path) {
                                                                            return;
                                                                        }
                                                                        NavigationService.navigate(
                                                                            'translator',
                                                                            payload,
                                                                        );
                                                                    });
                                                                }}
                                                                className="p-1.5 rounded-lg hover:bg-indigo-500/20 text-slate-400 hover:text-indigo-400 transition-colors"
                                                                title="Translate"
                                                            >
                                                                <Languages size={14} />
                                                            </button>
                                                        )}
                                                        
                                                        {/* Send to Editor (Edit Video) - Needs Video */}
                                                        {hasTaskVideoPath && (
                                                             <button
                                                                onClick={() => {
                                                                    void resolveTaskNavigationPayload(task).then((payload) => {
                                                                        if (!payload.video_ref?.path) {
                                                                            return;
                                                                        }
                                                                        NavigationService.navigate(
                                                                            'editor',
                                                                            payload,
                                                                        );
                                                                    });
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
                                        {task.name || (task.type === 'download' ? t('messages.downloading') : t('taskTypes.generic'))} 
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
                                                    task.message || t('messages.initializing')
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
                                            {renderCompatUsageSummary(task)}
                                            <pre className="mt-1 p-2 bg-black/50 rounded overflow-auto max-h-40 whitespace-pre-wrap">
                                                {JSON.stringify(
                                                    createTaskDiagnostic(task, executionSummary),
                                                    null,
                                                    2,
                                                )}
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
                    )})
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
