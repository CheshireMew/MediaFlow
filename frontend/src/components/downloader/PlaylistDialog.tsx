import React from "react";
import { useTranslation } from "react-i18next";
import { List, X, CheckSquare, Square } from "lucide-react";
import type { AnalyzeResult } from "../../api/client";

interface PlaylistDialogProps {
  playlistInfo: AnalyzeResult;
  selectedItems: number[];
  canDownloadCurrent: boolean;
  onClose: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onDownloadCurrent: () => void;
  onDownloadSelected: () => void;
  onToggleItem: (index: number) => void;
}

export function PlaylistDialog({
  playlistInfo,
  selectedItems,
  canDownloadCurrent,
  onClose,
  onSelectAll,
  onClearSelection,
  onDownloadCurrent,
  onDownloadSelected,
  onToggleItem,
}: PlaylistDialogProps) {
  const { t } = useTranslation('downloader');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-2xl bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex-none p-5 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
          <h2 className="text-lg font-semibold text-white flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 rounded-lg">
              <List size={20} className="text-indigo-400" />
            </div>
            {t('playlist.detected')}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <div className="p-5 flex-none">
            <p className="text-slate-400 text-sm mb-4">
              <strong className="text-white">{playlistInfo.title}</strong> {t('playlist.containsVideos', { count: playlistInfo.count })}
            </p>

            <div className="flex gap-2">
              <button
                onClick={onSelectAll}
                className="px-3 py-1.5 bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 rounded-lg text-xs font-medium text-slate-300 hover:text-white transition-colors"
              >
                {t('playlist.selectAll')}
              </button>
              <button
                onClick={onClearSelection}
                className="px-3 py-1.5 bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 rounded-lg text-xs font-medium text-slate-300 hover:text-white transition-colors"
              >
                {t('playlist.clearSelection')}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar px-5 pb-5">
            <div className="border border-white/5 rounded-xl bg-black/20 divide-y divide-white/5">
              {playlistInfo.items?.map((item, index) => {
                const isSelected = selectedItems.includes(index);
                return (
                  <div
                    key={index}
                    onClick={() => onToggleItem(index)}
                    className={`flex items-start gap-3 p-3 transition-colors cursor-pointer group
                      ${isSelected ? "bg-indigo-500/5 hover:bg-indigo-500/10" : "hover:bg-white/5"}
                    `}
                  >
                    <div className={`mt-0.5 shrink-0 ${isSelected ? "text-indigo-400" : "text-slate-600 group-hover:text-slate-500"}`}>
                        {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                    </div>
                    <div>
                        <span className="text-xs font-mono text-slate-500 mr-2">#{item.index}</span>
                        <span className={`text-sm ${isSelected ? "text-indigo-100" : "text-slate-300"}`}>
                            {item.title}
                        </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-none p-5 border-t border-white/5 bg-white/[0.02] flex justify-end gap-3 rounded-b-2xl">
          <button
            onClick={onDownloadCurrent}
            disabled={!canDownloadCurrent}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-sm font-medium text-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('playlist.downloadThisOnly')}
          </button>
          <button
            onClick={onDownloadSelected}
            disabled={selectedItems.length === 0}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {t('playlist.downloadSelected')} ({selectedItems.length})
          </button>
        </div>
      </div>
    </div>
  );
}
