
import { useTranslation } from 'react-i18next';
import { TaskMonitor } from '../components/TaskMonitor';
import { Activity, Server } from 'lucide-react';
import { TaskMonitorOverviewCards } from '../components/task-monitor/TaskMonitorOverviewCards';

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
                <div className="bg-[#1a1a1a] p-4 rounded-xl border border-white/5 shadow-xl hover:bg-[#222] transition-colors group">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="p-1.5 bg-emerald-500/10 rounded-lg group-hover:bg-emerald-500/20 transition-colors">
                            <Server className="w-4 h-4 text-emerald-400" />
                        </div>
                        <h3 className="font-semibold text-slate-200 text-sm">{t('stats.systemStatus')}</h3>
                    </div>
                    <div className="space-y-2">
                         <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                             <span className="text-xs text-slate-400">{t('stats.backendConnection')}</span>
                             <span className="text-[10px] font-medium px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20">{t('stats.online')}</span>
                         </div>
                         <div className="flex justify-between items-center py-1.5">
                             <span className="text-xs text-slate-400">{t('stats.computeResources')}</span>
                             <span className="text-xs font-medium text-slate-300">{t('stats.autoScaling')}</span>
                         </div>
                    </div>
                </div>
                
                <TaskMonitorOverviewCards />
            </div>

            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                {/* Global Monitor - Shows all tasks */}
                <TaskMonitor showHeaderOverview={false} />
            </div>
        </div>
    );
};
