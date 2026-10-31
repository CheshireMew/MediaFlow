import type { LucideIcon } from 'lucide-react';

export const overviewCardClassName =
  'min-w-0 bg-[var(--surface-panel)] p-4 rounded-lg border border-[var(--border-subtle)]';

export const overviewInnerPanelClassName =
  'border-t border-[var(--border-subtle)] py-3';

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
    <div className="flex items-start gap-2 mb-4 min-h-[40px]">
      <div className={`p-1.5 rounded-lg transition-colors ${iconAccentClassName}`}>
        <Icon className={`w-4 h-4 ${iconClassName}`} />
      </div>
      <div className="min-w-0 pt-0.5">
        <h3 className="font-semibold text-slate-200 text-sm">{title}</h3>
        <div className="mt-0.5 h-4 text-xs leading-4 text-slate-400">
          {subtitle ? subtitle : <span className="invisible">.</span>}
        </div>
      </div>
    </div>
  );
}
