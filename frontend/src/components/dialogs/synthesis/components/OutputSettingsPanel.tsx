// ── Output Settings Panel (Left sidebar section) ──
import React, { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { MonitorPlay, Zap, Cpu } from 'lucide-react';
import type { OutputSettingsState, SynthesisTargetResolution } from '../hooks/useOutputSettings';

interface Props {
    output: OutputSettingsState;
    batchMode?: boolean;
    batchCount?: number;
}

export const OutputSettingsPanel: React.FC<Props> = ({ output, batchMode = false, batchCount = 0 }) => {
    const { t } = useTranslation('synthesis');
    const {
        outputFilename, setOutputFilename,
        outputDir,
        handleSelectOutputFolder,
        useGpu, setUseGpu,
    } = output;
    const filenameId = useId();
    const outputFolderId = useId();

    const resolutionOptions: Array<{ id: SynthesisTargetResolution; label: string }> = [
        { id: "original", label: t('output.original') },
        { id: "720p", label: "720p (HD)" },
        { id: "1080p", label: "1080p" },
    ];

    return (
        <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <MonitorPlay size={12}/> {t('output.sectionTitle')}
            </h3>
            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4 space-y-4 hover:border-white/10 transition-colors">

                {/* GPU / CPU Toggle */}
                <div className="space-y-2">
                    <label className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                        <Zap size={12} className="text-indigo-400"/> {t('output.encoderSelection')}
                    </label>
                    <div role="group" aria-label={t('output.encoderSelection')} className="flex gap-1.5">
                        <button
                            type="button"
                            aria-pressed={useGpu}
                            onClick={() => setUseGpu(true)}
                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                                useGpu
                                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                                    : 'bg-black/20 border-white/5 text-slate-400 hover:text-slate-300'
                            }`}
                        >
                            <Zap size={12}/> {t('output.gpuFast')}
                        </button>
                        <button
                            type="button"
                            aria-pressed={!useGpu}
                            onClick={() => setUseGpu(false)}
                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                                !useGpu
                                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                                    : 'bg-black/20 border-white/5 text-slate-400 hover:text-slate-300'
                            }`}
                        >
                            <Cpu size={12}/> {t('output.cpuQuality')}
                        </button>
                    </div>
                </div>

                {/* Resolution Selection */}
                <div className="space-y-2">
                    <label className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                        <MonitorPlay size={12} className="text-indigo-400"/> {t('output.resolution')}
                    </label>
                    <div role="group" aria-label={t('output.resolution')} className="grid grid-cols-3 gap-1.5">
                        {resolutionOptions.map((opt) => (
                            <button
                                key={opt.id}
                                type="button"
                                aria-pressed={output.targetResolution === opt.id}
                                onClick={() => output.setTargetResolution(opt.id)}
                                className={`flex items-center justify-center px-2 py-2 rounded-lg text-xs font-medium border transition-all ${
                                    output.targetResolution === opt.id
                                        ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-400'
                                        : 'bg-black/20 border-white/5 text-slate-400 hover:text-slate-300'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                {batchMode ? (
                    <div className="rounded-lg border border-amber-500/10 bg-amber-500/[0.05] p-3 text-xs leading-relaxed text-slate-400">
                        <span className="font-semibold text-amber-300">
                            {t('output.batchFiles', { count: batchCount })}
                        </span>
                        <br />
                        {t('output.batchNaming')}
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        <label htmlFor={filenameId} className="text-xs font-medium text-slate-400 uppercase tracking-wider">{t('output.filename')}</label>
                        <input
                            id={filenameId}
                            type="text"
                            value={outputFilename}
                            onChange={e => setOutputFilename(e.target.value)}
                            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all"
                            placeholder={t('output.filenamePlaceholder')}
                        />
                    </div>
                )}

                {/* Folder Selection */}
                <div className="space-y-1.5">
                    <label htmlFor={outputFolderId} className="text-xs font-medium text-slate-400 uppercase tracking-wider">{t('output.saveFolder')}</label>
                    <div className="flex gap-2">
                        <input 
                            id={outputFolderId}
                            type="text" 
                            readOnly
                            value={outputDir || ""}
                            className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-400 cursor-not-allowed truncate"
                        />
                        <button 
                            type="button"
                            onClick={handleSelectOutputFolder}
                            className="bg-white/5 hover:bg-white/10 hover:text-white text-slate-400 px-3 py-2 rounded-lg text-xs font-medium border border-white/5 transition-all"
                        >
                            {t('output.changeFolder')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
