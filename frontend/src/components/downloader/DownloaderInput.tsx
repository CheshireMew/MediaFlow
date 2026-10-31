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
      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-400 transition-colors z-10">
          <Link size={20} />
        </div>
        
        <input
          type="text"
          inputMode="url"
          autoCapitalize="none"
          spellCheck={false}
          aria-label={t('input.placeholder')}
          placeholder={t('input.placeholder')}
          value={url}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-[var(--surface-input)] border border-[var(--border-subtle)] rounded-lg py-3.5 pl-12 pr-14 text-sm text-white placeholder-slate-400 focus:border-indigo-400 transition-colors"
        />
        
        <button
          type="button"
          aria-label={t('input.pasteTooltip')}
          onClick={onPaste}
          title={t('input.pasteTooltip')}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 rounded-md hover:bg-white/10 text-slate-400 hover:text-white transition-colors z-10"
        >
          <Clipboard size={18} />
        </button>
      </div>
    </div>
  );
}
