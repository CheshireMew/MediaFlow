import type { DragEventHandler } from "react";
import type { LucideIcon } from "lucide-react";
import { Upload } from "lucide-react";

import { DropZone } from "./DropZone";
import { FileNameLabel } from "./FileNameLabel";

const THEMES = {
  indigo: {
    selectedBorder: "border-indigo-500/50 bg-indigo-500/5 shadow-[0_0_20px_-5px_rgba(99,102,241,0.15)]",
    hover: "hover:border-indigo-500/30",
    icon: "bg-indigo-500/10 border-indigo-500/20 text-indigo-400",
    emptyIcon: "group-hover:bg-indigo-500/10 group-hover:border-indigo-500/20 group-hover:text-indigo-400",
    badge: "bg-indigo-500/10 text-indigo-300 border-indigo-500/20",
  },
  purple: {
    selectedBorder: "border-purple-500/50 bg-purple-500/5 shadow-[0_0_20px_-5px_rgba(168,85,247,0.15)]",
    hover: "hover:border-purple-500/30",
    icon: "bg-purple-500/10 border-purple-500/20 text-purple-400",
    emptyIcon: "group-hover:bg-purple-500/10 group-hover:border-purple-500/20 group-hover:text-purple-400",
    badge: "bg-purple-500/10 text-purple-300 border-purple-500/20",
  },
} as const;

export function FileUploadCard({
  fileName,
  selectedDetail,
  emptyTitle,
  emptyDetail,
  replaceLabel,
  ariaLabel,
  icon: SelectedIcon,
  theme = "indigo",
  className = "",
  onActivate,
  onDrop,
}: {
  fileName: string | null;
  selectedDetail: string;
  emptyTitle: string;
  emptyDetail: string;
  replaceLabel: string;
  ariaLabel: string;
  icon: LucideIcon;
  theme?: keyof typeof THEMES;
  className?: string;
  onActivate: () => void;
  onDrop: DragEventHandler<HTMLDivElement>;
}) {
  const styles = THEMES[theme];
  return (
    <DropZone
      onActivate={onActivate}
      onDrop={onDrop}
      ariaLabel={ariaLabel}
      className={`group relative border border-dashed rounded-lg p-8 flex flex-col items-center justify-center gap-4 transition-all duration-300 cursor-pointer overflow-hidden ${className} ${
        fileName ? styles.selectedBorder : `border-white/10 bg-black/20 ${styles.hover} hover:bg-black/30`
      }`}
    >
      <div
        className={`absolute inset-0 pointer-events-none transition-opacity duration-500 ${fileName ? "opacity-[0.08]" : "opacity-[0.03] group-hover:opacity-[0.06]"}`}
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
          backgroundSize: "16px 16px",
        }}
      />
      {fileName ? (
        <>
          <div className={`w-16 h-16 rounded-lg flex items-center justify-center border shadow-inner group-hover:scale-105 transition-transform duration-300 ${styles.icon}`}>
            <SelectedIcon className="w-8 h-8" />
          </div>
          <div className="z-10 flex w-full min-w-0 flex-col items-center text-center">
            <FileNameLabel name={fileName} className="mb-1.5" />
            <div className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${styles.badge}`}>
              {selectedDetail}
            </div>
          </div>
          <span aria-hidden="true" className="px-4 py-2 text-xs font-medium bg-white/5 group-hover:bg-white/10 border border-white/5 rounded-lg text-slate-300 group-hover:text-white transition-all z-10">
            {replaceLabel}
          </span>
        </>
      ) : (
        <>
          <div className={`w-16 h-16 rounded-lg bg-white/5 flex items-center justify-center border border-white/5 text-slate-400 transition-colors duration-300 ${styles.emptyIcon}`}>
            <Upload className="w-8 h-8" />
          </div>
          <div className="text-center z-10">
            <p className="text-slate-300 font-medium mb-1 group-hover:text-white transition-colors">{emptyTitle}</p>
            <p className="text-xs text-slate-400">{emptyDetail}</p>
          </div>
        </>
      )}
    </DropZone>
  );
}
