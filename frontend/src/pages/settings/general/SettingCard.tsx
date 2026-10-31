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
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 border-b border-[var(--border-subtle)] py-5 last:border-b-0">
      <div className={`min-w-0 basis-80 grow space-y-2 ${contentClassName}`}>
        <h4 className="text-base font-medium text-white flex items-center gap-2">
          {icon}
          {title}
        </h4>
        <p className="max-w-[72ch] text-sm leading-relaxed text-slate-400">{description}</p>
        {children}
      </div>
      {actions && <div className="flex max-w-full flex-wrap items-center gap-2 self-center">{actions}</div>}
    </div>
  );
}
