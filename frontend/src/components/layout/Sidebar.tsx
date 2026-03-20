import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, 
  Download, 
  FileAudio, 
  Languages, 
  Settings, 
  Pencil,
  type LucideIcon,
  Wand2
} from 'lucide-react';
import { useTaskContext } from '../../context/taskContext';
import { ENABLE_EXPERIMENTAL_PREPROCESSING } from '../../config/features';
import mediaflowMark from '../../assets/mediaflow-mark.svg';

interface SidebarItemProps {
  icon: LucideIcon;
  label: string;
  isActive: boolean;
  onClick: () => void;
  badge?: number;
}

function SidebarItem({ icon: Icon, label, isActive, onClick, badge }: SidebarItemProps) {
  return (
    <div 
      onClick={onClick}
      className={`
        w-full p-3 mb-2 rounded-xl cursor-pointer transition-all duration-200 group relative
        flex flex-col items-center justify-center gap-1
        ${isActive 
          ? 'bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]' 
          : 'text-slate-400 hover:text-white hover:bg-white/5'
        }
      `}
      title={label}
    >
      <div className={`p-2 rounded-lg transition-transform duration-300 group-hover:scale-110 ${isActive ? 'bg-indigo-500 shadow-lg shadow-indigo-500/30' : ''}`}>
        <Icon size={22} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'} />
      </div>
      <span className={`text-[10px] font-medium tracking-wide ${isActive ? 'text-indigo-200' : 'text-slate-500 group-hover:text-slate-300'}`}>
        {label}
      </span>
      
      {/* Active Indicator Strip */}
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-indigo-400 rounded-r-full shadow-[0_0_10px_rgba(129,140,248,0.5)]" />
      )}
      
      {/* Notification Badge */}
      {badge !== undefined && badge > 0 && (
         <div className="absolute top-2 right-2 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-sm ring-1 ring-slate-900/10 animate-pulse">
            {badge > 9 ? '9+' : badge}
         </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation('sidebar');
  const activeTab = location.pathname.substring(1) || 'editor'; // default to editor if root

  const { tasks } = useTaskContext();
  const activeTaskCount = tasks.filter(t => t.status === 'running' || t.status === 'pending').length;

  const menuItems = [
    { id: 'dashboard', labelKey: 'monitor', icon: LayoutDashboard, badge: activeTaskCount},
    { id: 'editor', labelKey: 'editor', icon: Pencil },
    { id: 'downloader', labelKey: 'download', icon: Download },
    { id: 'transcriber', labelKey: 'transcribe', icon: FileAudio },
    { id: 'translator', labelKey: 'translate', icon: Languages },
    { id: 'settings', labelKey: 'settings', icon: Settings },
  ];

  if (ENABLE_EXPERIMENTAL_PREPROCESSING) {
    menuItems.splice(2, 0, {
      id: 'preprocessing',
      labelKey: 'preprocess',
      icon: Wand2,
    });
  }

  return (
    <div className="w-20 bg-[#1a1a1a] border-r border-[#333] flex flex-col items-center py-6 h-full select-none z-50 shadow-2xl">
        {/* App Logo/Brand */}
        <div className="mb-8 cursor-default">
            <img src={mediaflowMark} alt="MediaFlow" className="w-12 h-12 rounded-2xl shadow-lg shadow-indigo-500/20" />
        </div>

        <div className="flex-1 w-full px-2 space-y-1 overflow-y-auto no-scrollbar">
            {menuItems.map((item) => (
                <SidebarItem
                    key={item.id}
                    icon={item.icon}
                    label={t(item.labelKey)}
                    isActive={activeTab === item.id}
                    onClick={() => navigate(`/${item.id}`)}
                    badge={item.badge}
                />
            ))}
        </div>

         {/* Bottom Actions - Exit Button Removed */}
         <div className="mt-auto px-2 w-full pt-4 border-t border-white/5 space-y-2">
            
         </div>
    </div>
  );
}
