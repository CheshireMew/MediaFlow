import type { ButtonHTMLAttributes } from "react";

const VARIANT_STYLES = {
  default: "bg-white/5 text-slate-200 hover:bg-white/10 border border-white/10",
  quiet: "text-slate-400 hover:text-white hover:bg-white/5",
} as const;

export function SettingsActionButton({
  className = "",
  type = "button",
  variant = "default",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANT_STYLES;
}) {
  return (
    <button
      {...props}
      type={type}
      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_STYLES[variant]} ${className}`}
    />
  );
}
