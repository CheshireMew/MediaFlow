import React from "react";
import { Link, Clipboard } from "lucide-react";
import { useTranslation } from 'react-i18next';

interface DownloaderInputProps {
  url: string;
  onChange: (url: string) => void;
  onPaste: () => void;
}

export function DownloaderInput({ url, onChange, onPaste }: DownloaderInputProps) {
  const { t } = useTranslation('downloader');
  return (
    <div className="relative group">
      {/* Glow Effect */}
      <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl opacity-0 group-focus-within:opacity-20 transition-opacity duration-500 blur-lg" />
      
      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors z-10">
          <Link size={20} />
        </div>
        
        <input
          type="text"
          placeholder={t('input.placeholder')}
          value={url}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-black/40 backdrop-blur-xl border border-white/10 rounded-xl py-5 pl-12 pr-14 text-white placeholder-slate-500/50 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all shadow-inner font-medium text-lg"
        />
        
        <button
          onClick={onPaste}
          title={t('input.pasteTooltip')}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 text-slate-400 hover:text-white transition-all z-10 active:scale-95"
        >
          <Clipboard size={18} />
        </button>
      </div>
    </div>
  );
}
