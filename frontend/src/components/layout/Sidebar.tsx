import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, 
  Download, 
  FileAudio, 
  Languages, 
  Settings, 
  Pencil,
  type LucideIcon
} from 'lucide-react';
import { useTaskSummaryContext } from '../../context/useTaskSummaryContext';
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
    <button
      type="button"
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      className={`
        w-full h-16 shrink-0 rounded-lg cursor-pointer transition-colors duration-150 group relative border
        flex flex-col items-center justify-center gap-1
        ${isActive 
          ? 'bg-[var(--accent-muted)] border-indigo-400/25 text-indigo-200'
          : 'border-transparent text-slate-400 hover:text-white hover:bg-white/5'
        }
      `}
      title={label}
    >
      <div className="p-1">
        <Icon size={20} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'} />
      </div>
      <span className={`max-w-full whitespace-nowrap text-xs font-medium tracking-wide ${isActive ? 'text-indigo-200' : 'text-slate-400 group-hover:text-slate-300'}`}>
        {label}
      </span>
      
      {/* Notification Badge */}
      {badge !== undefined && badge > 0 && (
         <div className="absolute top-1 right-1 flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-indigo-500 px-1 text-xs font-semibold text-white tabular-nums">
            {badge > 9 ? '9+' : badge}
         </div>
      )}
    </button>
  );
}

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation('sidebar');
  const activeTab = location.pathname.substring(1) || 'downloader';

  const taskSummary = useTaskSummaryContext();
  const activeTaskCount = taskSummary?.activeTaskCount ?? 0;

  const menuItems = [
    { id: 'dashboard', labelKey: 'monitor', icon: LayoutDashboard, badge: activeTaskCount},
    { id: 'downloader', labelKey: 'download', icon: Download },
    { id: 'transcriber', labelKey: 'transcribe', icon: FileAudio },
    { id: 'translator', labelKey: 'translate', icon: Languages },
    { id: 'editor', labelKey: 'editor', icon: Pencil },
    { id: 'settings', labelKey: 'settings', icon: Settings },
  ];

  return (
    <aside className="w-24 shrink-0 bg-[var(--surface-panel)] border-r border-[var(--border-subtle)] flex flex-col items-center py-4 h-full select-none z-50">
        {/* App Logo/Brand */}
        <div className="mb-5 cursor-default">
            <img src={mediaflowMark} alt="MediaFlow" className="w-10 h-10 rounded-xl" />
        </div>

        <nav aria-label="MediaFlow" className="flex-1 min-h-0 w-full px-2 space-y-1 overflow-y-auto overflow-x-hidden">
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
        </nav>

    </aside>
  );
}
