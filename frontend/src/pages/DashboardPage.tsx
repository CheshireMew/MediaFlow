
import { useTranslation } from 'react-i18next';
import { TaskMonitor } from '../components/TaskMonitor';
import { Activity, Server } from 'lucide-react';
import { TaskMonitorOverviewCards } from '../components/task-monitor/TaskMonitorOverviewCards';
import {
    OverviewCardHeader,
    overviewCardClassName,
    overviewInnerPanelClassName,
} from '../components/task-monitor/overviewCardPrimitives';

export const DashboardPage = () => {
    const { t } = useTranslation('dashboard');
    return (
        <div className="w-full h-full px-6 pb-6 pt-5 flex flex-col overflow-hidden">
            <header className="flex-none mb-6 flex items-center gap-4">
                <div className="p-2 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-2xl border border-white/5 shadow-lg shadow-indigo-500/10">
                    <Activity className="w-6 h-6 text-indigo-400" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">{t('title')}</h1>
                    <p className="text-slate-400 text-sm mt-0.5">{t('subtitle')}</p>
                </div>
            </header>

            <div className="flex-none grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {/* System Stats */}
                <section className={overviewCardClassName}>
                    <OverviewCardHeader
                        icon={Server}
                        title={t('stats.systemStatus')}
                        iconAccentClassName="bg-emerald-500/10 group-hover:bg-emerald-500/20"
                        iconClassName="text-emerald-400"
                    />
                    <div className="space-y-2">
                        <div className={`${overviewInnerPanelClassName} flex items-center justify-between min-h-[60px]`}>
                            <span className="text-xs text-slate-400">{t('stats.backendConnection')}</span>
                            <span className="text-[10px] font-medium px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20">
                                {t('stats.online')}
                            </span>
                        </div>
                        <div className={`${overviewInnerPanelClassName} flex items-center justify-between min-h-[60px]`}>
                            <span className="text-xs text-slate-400">{t('stats.computeResources')}</span>
                            <span className="text-xs font-medium text-slate-300">{t('stats.autoScaling')}</span>
                        </div>
                    </div>
                </section>
                
                <TaskMonitorOverviewCards />
            </div>

            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                {/* Global Monitor - Shows all tasks */}
                <TaskMonitor showHeaderOverview={false} />
            </div>
        </div>
    );
};
