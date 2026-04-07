import type { LucideIcon } from 'lucide-react';

export const overviewCardClassName =
  'bg-[#1a1a1a] p-4 rounded-xl border border-white/5 shadow-xl hover:bg-[#222] transition-colors group';

export const overviewInnerPanelClassName =
  'rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2';

type OverviewCardHeaderProps = {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  iconAccentClassName: string;
  iconClassName: string;
};

export function OverviewCardHeader({
  icon: Icon,
  title,
  subtitle,
  iconAccentClassName,
  iconClassName,
}: OverviewCardHeaderProps) {
  return (
    <div className="flex items-start gap-3 mb-3 min-h-[52px]">
      <div className={`p-1.5 rounded-lg transition-colors ${iconAccentClassName}`}>
        <Icon className={`w-4 h-4 ${iconClassName}`} />
      </div>
      <div className="min-w-0 pt-0.5">
        <h3 className="font-semibold text-slate-200 text-sm">{title}</h3>
        <div className="mt-0.5 h-4 text-[11px] leading-4 text-slate-500">
          {subtitle ? subtitle : <span className="invisible">.</span>}
        </div>
      </div>
    </div>
  );
}
