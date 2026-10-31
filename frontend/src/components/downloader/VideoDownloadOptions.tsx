import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Download, ChevronDown } from "lucide-react";

interface VideoDownloadOptionsProps {
  mediaKind: "video" | "audio";
  resolution: string;
  setResolution: (res: string) => void;
  codec: string;
  setCodec: (codec: string) => void;
  downloadSubs: boolean;
  setDownloadSubs: (subs: boolean) => void;
  loading: boolean;
  analyzing: boolean;
  url: string;
  onAction: () => void;
}

export function VideoDownloadOptions({
  mediaKind,
  resolution,
  setResolution,
  codec,
  setCodec,
  downloadSubs,
  setDownloadSubs,
  loading,
  analyzing,
  url,
  onAction,
}: VideoDownloadOptionsProps) {
  const { t } = useTranslation('downloader');
  const resolutionId = useId();
  const isSourceAudio = mediaKind === "audio";
  const isAudio = isSourceAudio || resolution === "audio";

  return (
    <div className="flex flex-col gap-4">
      
      {/* Settings Grid */}
      <div className="grid grid-cols-1 gap-4">
          {/* Quality Card */}
          <div className="flex min-w-0 flex-col gap-2">
            <label htmlFor={resolutionId} className="text-xs font-medium text-slate-400 flex items-center justify-between gap-2">
              {isAudio ? t('options.format') : t('options.quality')}
              <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-slate-800 text-indigo-300 border border-indigo-500/20">
                {isAudio ? t('options.audioFile') : t('options.mp4')}
              </span>
            </label>
            <div className="relative">
              <select
                id={resolutionId}
                value={isSourceAudio ? "audio" : resolution}
                onChange={(e) => {
                  const nextResolution = e.target.value;
                  setResolution(nextResolution);
                  if (nextResolution === "audio") setDownloadSubs(false);
                }}
                disabled={isSourceAudio}
                className="w-full h-10 bg-[var(--surface-input)] border border-[var(--border-subtle)] rounded-lg pl-3 pr-9 text-sm text-white focus:border-indigo-400 appearance-none cursor-pointer hover:border-slate-500 transition-colors"
              >
                {isSourceAudio ? (
                  <option value="audio" className="bg-[#1a1a1a] text-white">{t('options.originalAudio')}</option>
                ) : (
                  <>
                    <option value="best" className="bg-[#1a1a1a] text-white">{t('options.bestQuality')}</option>
                    <option value="4k" className="bg-[#1a1a1a] text-white">{t('options.4k')}</option>
                    <option value="2k" className="bg-[#1a1a1a] text-white">{t('options.2k')}</option>
                    <option value="1080p" className="bg-[#1a1a1a] text-white">{t('options.1080p')}</option>
                    <option value="720p" className="bg-[#1a1a1a] text-white">{t('options.720p')}</option>
                    <option value="480p" className="bg-[#1a1a1a] text-white">{t('options.480p')}</option>
                    <option value="audio" className="bg-[#1a1a1a] text-white">{t('options.audioOnly')}</option>
                  </>
                )}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <ChevronDown size={14} />
              </div>
            </div>
          </div>

          {/* Subtitles Card */}
          {!isAudio && <label
              className="flex cursor-pointer select-none items-center justify-between gap-3 py-2 text-sm text-slate-300"
            >
              <span>
                  <span className="sr-only">{t('options.subtitles')}: </span>
                  {t('options.includeCaptions')}
              </span>
              
              <input 
                type="checkbox" 
                checked={downloadSubs} 
                onChange={e => setDownloadSubs(e.target.checked)}
                className="h-4 w-4 shrink-0 accent-indigo-500"
              />
          </label>}
      </div>

      {/* Codec Strategy */}
      {!isAudio && <div className="bg-[var(--surface-input)] rounded-lg p-1 border border-[var(--border-subtle)] flex gap-1">
        
        <button
          type="button"
          aria-pressed={codec === 'avc'}
          onClick={() => setCodec('avc')}
          className={`min-w-0 flex-1 px-2 py-2.5 text-xs font-medium transition-colors rounded-md ${
            codec === 'avc' ? 'bg-[var(--accent-muted)] text-indigo-200' : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          {t('options.codecCompatible')}
        </button>
        <button
          type="button"
          aria-pressed={codec === 'best'}
          onClick={() => setCodec('best')}
          className={`min-w-0 flex-1 px-2 py-2.5 text-xs font-medium transition-colors rounded-md ${
            codec === 'best' ? 'bg-[var(--accent-muted)] text-indigo-200' : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          {t('options.codecEfficient')}
        </button>
      </div>}

      {/* Download Button */}
      <button
        type="button"
        onClick={onAction}
        disabled={loading || analyzing || !url.trim()}
        aria-busy={loading || analyzing}
        className={`h-12 shrink-0 rounded-lg font-semibold text-sm flex items-center justify-center gap-3 transition-colors
          ${loading || analyzing || !url.trim()
            ? "bg-slate-800/50 border border-white/5 text-slate-400 cursor-not-allowed shadow-none"
            : "bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500/30"
          }
        `}
      >
        {/* Content */}
        {loading || analyzing ? (
             <>
                <div className="w-5 h-5 border-2 border-slate-500 border-t-white rounded-full animate-spin" />
                <span>
                   {analyzing
                     ? t('options.analyzingStream')
                     : t(isAudio ? 'options.downloadingAudio' : 'options.downloadingMedia')}
                </span>
             </>
        ) : (
             <>
                <span>{t(isAudio ? 'options.downloadAudio' : 'options.downloadMedia')}</span>
                <Download size={20} className="stroke-[2.5]" />
             </>
        )}
      </button>

    </div>
  );
}
