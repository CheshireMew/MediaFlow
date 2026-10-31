import { ActivitySquare, HardDrive } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTaskMonitorOverview } from './useTaskMonitorOverview';
import {
    OverviewCardHeader,
    overviewCardClassName,
    overviewInnerPanelClassName,
} from './overviewCardPrimitives';

const statBadgeClassNames = {
    pending: 'text-amber-300',
    running: 'text-indigo-300',
    paused: 'text-slate-300',
} as const;

const statusClassNames = {
    ready: {
        dot: 'bg-emerald-500',
        text: 'text-emerald-400',
    },
    waiting: {
        dot: 'bg-rose-500',
        text: 'text-rose-400',
    },
} as const;

export const TaskMonitorOverviewCards = () => {
    const { t } = useTranslation(['dashboard', 'taskmonitor']);
    const {
        connected,
        executionBadges,
        remoteTasksReady,
        summary,
    } = useTaskMonitorOverview();
    const taskFeedReady = connected && remoteTasksReady;

    const taskStats = [
        { key: 'pending', label: t('dashboard:taskOverview.queue'), value: summary.pending },
        { key: 'running', label: t('dashboard:taskOverview.running'), value: summary.running },
        { key: 'paused', label: t('dashboard:taskOverview.paused'), value: summary.paused },
    ] as const;

    return (
        <>
            <section className={overviewCardClassName}>
                <OverviewCardHeader
                    icon={ActivitySquare}
                    title={t('dashboard:taskOverview.title')}
                    subtitle={t('dashboard:taskOverview.subtitle')}
                    iconAccentClassName="bg-indigo-500/10 group-hover:bg-indigo-500/20"
                    iconClassName="text-indigo-300"
                />
                <div className="grid grid-cols-3 gap-2">
                    {taskStats.map((item) => (
                        <div key={item.key} className={`min-w-0 py-2 flex flex-col gap-2 ${statBadgeClassNames[item.key]}`}>
                            <div className="text-xs break-words">{item.label}</div>
                            <div className="text-xl font-semibold text-white leading-none tabular-nums">{item.value}</div>
                        </div>
                    ))}
                </div>
                <div className={`mt-3 min-h-[60px] ${overviewInnerPanelClassName}`}>
                    <div className="text-xs text-slate-400 mb-2">{t('dashboard:taskOverview.execution')}</div>
                    <div className="flex flex-wrap gap-2">
                        {executionBadges.length > 0 ? (
                            executionBadges.map((badge) => (
                                <span key={badge.key} className={`px-2 py-1 rounded-md border text-xs font-mono ${badge.className}`}>
                                    {badge.label} {badge.count}
                                </span>
                            ))
                        ) : (
                            <span className="text-xs text-slate-400">{t('dashboard:taskOverview.executionIdle')}</span>
                        )}
                    </div>
                </div>
            </section>

            <section className={overviewCardClassName}>
                <OverviewCardHeader
                    icon={HardDrive}
                    title={t('dashboard:runtimeOverview.title')}
                    subtitle={t('dashboard:runtimeOverview.subtitle')}
                    iconAccentClassName="bg-cyan-500/10 group-hover:bg-cyan-500/20"
                    iconClassName="text-cyan-300"
                />
                <div className="space-y-2">
                    <div className={`${overviewInnerPanelClassName} min-h-[60px]`}>
                        <div className="flex items-center gap-2 mb-2 text-xs text-slate-400">
                            <HardDrive className="w-3.5 h-3.5" />
                            {t('dashboard:runtimeOverview.sources')}
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <span className={`text-xs font-medium flex items-center gap-1.5 ${taskFeedReady ? statusClassNames.ready.text : statusClassNames.waiting.text}`}>
                                <span className="relative flex h-2 w-2">
                                    <span className={`relative inline-flex rounded-full h-2 w-2 ${taskFeedReady ? statusClassNames.ready.dot : statusClassNames.waiting.dot}`}></span>
                                </span>
                                {t('taskmonitor:status.tasks')}: {taskFeedReady ? t('taskmonitor:status.ready') : t('taskmonitor:status.waiting')}
                            </span>
                        </div>
                    </div>
                </div>
            </section>
        </>
    );
};
