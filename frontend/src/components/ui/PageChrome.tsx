import type { ComponentType, ReactNode } from "react";

type IconComponent = ComponentType<{ className?: string; size?: number }>;

type Accent = "indigo" | "purple" | "emerald" | "amber" | "slate";

const accentClasses: Record<Accent, string> = {
  indigo: "text-indigo-400",
  purple: "text-purple-400",
  emerald: "text-emerald-400",
  amber: "text-amber-400",
  slate: "text-slate-300",
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
        "w-full h-full min-w-0 min-h-0 bg-[var(--surface-canvas)] text-slate-200",
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
        "flex-1 min-h-0 min-w-0 p-4",
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
        "page-header drag-region flex-none items-center gap-4 border-b border-[var(--border-subtle)] bg-[var(--surface-panel)]",
        actions ? "page-header--with-actions" : "",
        className,
      ].join(" ")}
    >
      <div className="page-header-heading flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5">
          {iconNode ?? (Icon ? <Icon className={accentClass} size={21} /> : null)}
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-xl font-semibold leading-tight tracking-tight text-white">
              {title}
            </h1>
            {titleMeta}
          </div>
          {subtitle && (
            <p className="mt-1 truncate text-xs leading-snug text-slate-400">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="page-header-actions no-drag">{actions}</div>}
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
        "min-w-0 bg-[var(--surface-panel)] border border-[var(--border-subtle)] rounded-lg overflow-hidden",
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
        "flex flex-none flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-3.5",
        className,
      ].join(" ")}
    >
      <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold text-white">
        {Icon && (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center">
            <Icon className={accentClass} size={16} />
          </span>
        )}
        <span className="truncate">{title}</span>
      </h2>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

const buttonVariantClasses = {
  primary:
    "bg-indigo-600 hover:bg-indigo-500 border-indigo-500/30 text-white",
  subtle:
    "bg-white/5 hover:bg-white/10 border-white/10 text-slate-300 hover:text-white",
  accent:
    "bg-indigo-500/10 hover:bg-indigo-500/20 border-indigo-500/20 text-indigo-300 hover:text-indigo-200",
  success:
    "bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20 text-emerald-300 hover:text-emerald-200",
  warning:
    "bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/20 text-amber-300 hover:text-amber-200",
  danger:
    "bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/20 text-rose-300 hover:text-rose-200",
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
      aria-label={props['aria-label'] ?? props.title}
      className={[
        "no-drag inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50",
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
      aria-label={props['aria-label'] ?? props.title}
      className={[
        "no-drag inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50",
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
        "flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-slate-400",
        className,
      ].join(" ")}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-white/5 bg-white/[0.03]">
        <Icon size={28} className="text-slate-400" />
      </div>
      <div>
        <p className="text-sm font-medium text-slate-400">{title}</p>
        {description && <p className="mt-1 text-xs text-slate-400">{description}</p>}
      </div>
    </div>
  );
}
