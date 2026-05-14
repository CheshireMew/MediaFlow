
import { useTranslation } from 'react-i18next';
import { TaskMonitor } from '../components/TaskMonitor';
import { Activity, Server } from 'lucide-react';
import { TaskMonitorOverviewCards } from '../components/task-monitor/TaskMonitorOverviewCards';
import { PageContent, PageHeader, PageShell } from '../components/ui/PageChrome';
import {
    OverviewCardHeader,
    overviewCardClassName,
    overviewInnerPanelClassName,
} from '../components/task-monitor/overviewCardPrimitives';

export const DashboardPage = () => {
    const { t } = useTranslation('dashboard');
    return (
        <PageShell padded={false} className="flex flex-col">
            <PageHeader
                icon={Activity}
                title={t('title')}
                subtitle={t('subtitle')}
            />

            <PageContent className="flex flex-col">
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
            </PageContent>
        </PageShell>
    );
};
