
import { TaskMonitor } from '../components/TaskMonitor';
import { Activity, Server } from 'lucide-react';

export const DashboardPage = () => {
    return (
        <div className="w-full h-full px-6 pb-6 pt-5 flex flex-col overflow-hidden">
            <header className="flex-none mb-6 flex items-center gap-4">
                <div className="p-2 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-2xl border border-white/5 shadow-lg shadow-indigo-500/10">
                    <Activity className="w-6 h-6 text-indigo-400" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">Dashboard</h1>
                    <p className="text-slate-400 text-sm mt-0.5">System overview and active tasks</p>
                </div>
            </header>

            <div className="flex-none grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {/* System Stats */}
                <div className="bg-[#1a1a1a] p-4 rounded-xl border border-white/5 shadow-xl hover:bg-[#222] transition-colors group">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="p-1.5 bg-emerald-500/10 rounded-lg group-hover:bg-emerald-500/20 transition-colors">
                            <Server className="w-4 h-4 text-emerald-400" />
                        </div>
                        <h3 className="font-semibold text-slate-200 text-sm">System Status</h3>
                    </div>
                    <div className="space-y-2">
                         <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                             <span className="text-xs text-slate-400">Backend Connection</span>
                             <span className="text-[10px] font-medium px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20">Online</span>
                         </div>
                         <div className="flex justify-between items-center py-1.5">
                             <span className="text-xs text-slate-400">Compute Resources</span>
                             <span className="text-xs font-medium text-slate-300">Auto-Scaling</span>
                         </div>
                    </div>
                </div>
                
                {/* Placeholder Widget 1 */}
                <div className="bg-[#1a1a1a] p-4 rounded-xl border border-white/5 shadow-xl opacity-40 border-dashed">
                     <div className="h-full flex items-center justify-center text-slate-600 text-xs">
                        Additional Metrics (Coming Soon)
                     </div>
                </div>
                 {/* Placeholder Widget 2 */}
                 <div className="bg-[#1a1a1a] p-4 rounded-xl border border-white/5 shadow-xl opacity-40 border-dashed">
                     <div className="h-full flex items-center justify-center text-slate-600 text-xs">
                        Storage Stats (Coming Soon)
                     </div>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                {/* Global Monitor - Shows all tasks */}
                <TaskMonitor />
            </div>
        </div>
    );
};
