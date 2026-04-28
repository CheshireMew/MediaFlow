import type { ReactNode } from "react";

type SettingCardProps = {
  icon: ReactNode;
  title: string;
  description: string;
  children?: ReactNode;
  actions?: ReactNode;
  contentClassName?: string;
};

export function SettingCard({
  icon,
  title,
  description,
  children,
  actions,
  contentClassName = "",
}: SettingCardProps) {
  return (
    <div className="bg-[#1a1a1a] p-6 rounded-xl border border-white/5 flex items-start justify-between group hover:border-white/10 transition-colors gap-6">
      <div className={`space-y-1 min-w-0 ${contentClassName}`}>
        <h4 className="text-base font-medium text-white flex items-center gap-2">
          {icon}
          {title}
        </h4>
        <p className="text-sm text-slate-500">{description}</p>
        {children}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0 self-end">{actions}</div>}
    </div>
  );
}
