import type { ComponentType, ReactNode } from "react";

type IconComponent = ComponentType<{ className?: string; size?: number }>;

type Accent = "indigo" | "purple" | "emerald" | "amber" | "slate";

const accentClasses: Record<Accent, { iconBox: string; icon: string; dot: string }> = {
  indigo: {
    iconBox: "bg-indigo-500/10 border-indigo-500/20 shadow-indigo-500/10",
    icon: "text-indigo-400",
    dot: "bg-indigo-500",
  },
  purple: {
    iconBox: "bg-purple-500/10 border-purple-500/20 shadow-purple-500/10",
    icon: "text-purple-400",
    dot: "bg-purple-500",
  },
  emerald: {
    iconBox: "bg-emerald-500/10 border-emerald-500/20 shadow-emerald-500/10",
    icon: "text-emerald-400",
    dot: "bg-emerald-500",
  },
  amber: {
    iconBox: "bg-amber-500/10 border-amber-500/20 shadow-amber-500/10",
    icon: "text-amber-400",
    dot: "bg-amber-500",
  },
  slate: {
    iconBox: "bg-white/5 border-white/10 shadow-black/20",
    icon: "text-slate-300",
    dot: "bg-slate-500",
  },
};

export function PageShell({
  children,
  className = "",
  padded = true,
  scroll = false,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  scroll?: boolean;
}) {
  return (
    <div
      className={[
        "w-full h-full bg-[#0a0a0a] text-slate-200",
        padded ? "px-6 pb-6 pt-5" : "",
        scroll ? "overflow-y-auto overflow-x-hidden" : "overflow-hidden",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export function PageContent({
  children,
  className = "",
  scroll = false,
}: {
  children: ReactNode;
  className?: string;
  scroll?: boolean;
}) {
  return (
    <div
      className={[
        "flex-1 min-h-0 p-4",
        scroll ? "overflow-y-auto overflow-x-hidden" : "overflow-hidden",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  icon: Icon,
  iconNode,
  title,
  subtitle,
  accent = "indigo",
  actions,
  titleMeta,
  className = "",
}: {
  icon?: IconComponent;
  iconNode?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  accent?: Accent;
  actions?: ReactNode;
  titleMeta?: ReactNode;
  className?: string;
}) {
  const accentClass = accentClasses[accent];

  return (
    <header
      className={[
        "drag-region flex h-[76px] flex-none items-center justify-between gap-4 border-b border-white/5 bg-[#1a1a1a] px-6 pr-36",
        className,
      ].join(" ")}
    >
      <div className="flex min-w-0 items-center gap-4 no-drag">
        <div
          className={[
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border shadow-lg",
            accentClass.iconBox,
          ].join(" ")}
        >
          {iconNode ?? (Icon ? <Icon className={accentClass.icon} size={24} /> : null)}
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-[26px] font-bold leading-tight tracking-tight text-white">
              {title}
            </h1>
            {titleMeta}
          </div>
          {subtitle && (
            <p className="truncate text-[15px] font-medium leading-snug text-slate-400">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="no-drag flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function WorkPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={[
        "bg-[#1a1a1a] border border-white/5 rounded-lg shadow-2xl overflow-hidden",
        className,
      ].join(" ")}
    >
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  icon: Icon,
  accent = "indigo",
  actions,
  className = "",
}: {
  title: ReactNode;
  icon?: IconComponent;
  accent?: Accent;
  actions?: ReactNode;
  className?: string;
}) {
  const accentClass = accentClasses[accent];

  return (
    <div
      className={[
        "flex flex-none items-center justify-between border-b border-white/5 bg-white/[0.02] p-4",
        className,
      ].join(" ")}
    >
      <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold text-white">
        {Icon ? (
          <span
            className={[
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
              accentClass.iconBox,
            ].join(" ")}
          >
            <Icon className={accentClass.icon} size={16} />
          </span>
        ) : (
          <span className={`h-2 w-2 shrink-0 rounded-full ${accentClass.dot}`} />
        )}
        <span className="truncate">{title}</span>
      </h2>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

const buttonVariantClasses = {
  primary:
    "bg-indigo-600 hover:bg-indigo-500 border-indigo-500/30 text-white shadow-indigo-500/20",
  subtle:
    "bg-white/5 hover:bg-white/10 border-white/10 text-slate-300 hover:text-white shadow-black/10",
  accent:
    "bg-indigo-500/10 hover:bg-indigo-500/20 border-indigo-500/20 text-indigo-300 hover:text-indigo-200 shadow-indigo-500/10",
  success:
    "bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20 text-emerald-300 hover:text-emerald-200 shadow-emerald-500/10",
  warning:
    "bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/20 text-amber-300 hover:text-amber-200 shadow-amber-500/10",
  danger:
    "bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/20 text-rose-400 hover:text-rose-300 shadow-rose-500/10",
};

export function ToolbarButton({
  children,
  icon: Icon,
  variant = "subtle",
  className = "",
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: IconComponent;
  variant?: keyof typeof buttonVariantClasses;
}) {
  return (
    <button
      type={type}
      {...props}
      className={[
        "no-drag inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium shadow-lg transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
        buttonVariantClasses[variant],
        className,
      ].join(" ")}
    >
      {Icon && <Icon size={16} />}
      {children}
    </button>
  );
}

export function IconButton({
  icon: Icon,
  variant = "subtle",
  className = "",
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: IconComponent;
  variant?: keyof typeof buttonVariantClasses;
}) {
  return (
    <button
      type={type}
      {...props}
      className={[
        "no-drag inline-flex h-10 w-10 items-center justify-center rounded-lg border shadow-lg transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
        buttonVariantClasses[variant],
        className,
      ].join(" ")}
    >
      <Icon size={16} />
    </button>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  className = "",
}: {
  icon: IconComponent;
  title: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-slate-500",
        className,
      ].join(" ")}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-white/5 bg-white/[0.03]">
        <Icon size={28} className="text-slate-500" />
      </div>
      <div>
        <p className="text-sm font-medium text-slate-400">{title}</p>
        {description && <p className="mt-1 text-xs text-slate-600">{description}</p>}
      </div>
    </div>
  );
}
