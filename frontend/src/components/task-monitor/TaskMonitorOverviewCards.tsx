import { ActivitySquare, HardDrive, ServerCog } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTaskMonitorOverview } from './useTaskMonitorOverview';

const statBadgeClassNames = {
    pending: 'bg-amber-400/10 text-amber-300 border-amber-400/20',
    running: 'bg-indigo-400/10 text-indigo-300 border-indigo-400/20',
    paused: 'bg-slate-400/10 text-slate-300 border-slate-400/20',
} as const;

const statusClassNames = {
    ready: {
        dot: 'bg-emerald-500',
        ping: 'bg-emerald-400',
        text: 'text-emerald-400',
    },
    waiting: {
        dot: 'bg-rose-500',
        ping: 'bg-rose-400',
        text: 'text-rose-400',
    },
} as const;

const panelClassName = 'bg-[#1a1a1a] p-4 rounded-xl border border-white/5 shadow-xl hover:bg-[#222] transition-colors group';

export const TaskMonitorOverviewCards = () => {
    const { t } = useTranslation(['dashboard', 'taskmonitor']);
    const {
        connected,
        desktopRuntime,
        executionBadges,
        remoteTasksReady,
        summary,
        taskOwnerMode,
    } = useTaskMonitorOverview();

    const taskStats = [
        { key: 'pending', label: t('dashboard:taskOverview.queue'), value: summary.pending },
        { key: 'running', label: t('dashboard:taskOverview.running'), value: summary.running },
        { key: 'paused', label: t('dashboard:taskOverview.paused'), value: summary.paused },
    ] as const;

    const sources = [
        {
            key: 'local',
            label: t('taskmonitor:status.localTasks'),
            ready: connected,
        },
        ...(!desktopRuntime
            ? [{
                key: 'backend',
                label: t('taskmonitor:status.backendTasks'),
                ready: remoteTasksReady,
            }]
            : []),
    ];

    return (
        <>
            <section className={panelClassName}>
                <div className="flex items-center gap-3 mb-3">
                    <div className="p-1.5 bg-indigo-500/10 rounded-lg group-hover:bg-indigo-500/20 transition-colors">
                        <ActivitySquare className="w-4 h-4 text-indigo-300" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-200 text-sm">{t('dashboard:taskOverview.title')}</h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">{t('dashboard:taskOverview.subtitle')}</p>
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {taskStats.map((item) => (
                        <div key={item.key} className={`rounded-xl border px-3 py-3 ${statBadgeClassNames[item.key]}`}>
                            <div className="text-[10px] uppercase tracking-[0.18em] opacity-80">{item.label}</div>
                            <div className="mt-2 text-xl font-semibold text-white">{item.value}</div>
                        </div>
                    ))}
                </div>
            </section>

            <section className={panelClassName}>
                <div className="flex items-center gap-3 mb-3">
                    <div className="p-1.5 bg-cyan-500/10 rounded-lg group-hover:bg-cyan-500/20 transition-colors">
                        <ServerCog className="w-4 h-4 text-cyan-300" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-200 text-sm">{t('dashboard:runtimeOverview.title')}</h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">{t('dashboard:runtimeOverview.subtitle')}</p>
                    </div>
                </div>
                <div className="space-y-2">
                    <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                        <span className="text-xs text-slate-400">{t('dashboard:runtimeOverview.owner')}</span>
                        <span className="px-2 py-1 rounded-md bg-cyan-400/10 text-cyan-300 border border-cyan-400/20 text-[10px] font-mono">
                            owner {taskOwnerMode}
                        </span>
                    </div>
                    <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                        <div className="flex items-center gap-2 mb-2 text-xs text-slate-400">
                            <HardDrive className="w-3.5 h-3.5" />
                            {t('dashboard:runtimeOverview.sources')}
                        </div>
                        <div className="flex flex-wrap gap-3">
                            {sources.map((source) => (
                                <span key={source.key} className={`text-[10px] font-medium flex items-center gap-1.5 ${source.ready ? statusClassNames.ready.text : statusClassNames.waiting.text}`}>
                                    <span className="relative flex h-2 w-2">
                                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${source.ready ? statusClassNames.ready.ping : statusClassNames.waiting.ping}`}></span>
                                        <span className={`relative inline-flex rounded-full h-2 w-2 ${source.ready ? statusClassNames.ready.dot : statusClassNames.waiting.dot}`}></span>
                                    </span>
                                    {source.label}: {source.ready ? t('taskmonitor:status.ready') : t('taskmonitor:status.waiting')}
                                </span>
                            ))}
                        </div>
                    </div>
                    {executionBadges.length > 0 && (
                        <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                            <div className="text-xs text-slate-400 mb-2">{t('dashboard:runtimeOverview.execution')}</div>
                            <div className="flex flex-wrap gap-2">
                                {executionBadges.map((badge) => (
                                    <span key={badge.key} className={`px-2 py-1 rounded-md border text-[10px] font-mono ${badge.className}`}>
                                        {badge.label} {badge.count}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </section>
        </>
    );
};
