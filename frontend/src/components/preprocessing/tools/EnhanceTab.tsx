import { MonitorPlay, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePreprocessingStore } from '../../../stores/preprocessingStore';
import { Select } from '../../ui/Select';

export const EnhanceTab = () => {
    const { t } = useTranslation('preprocessing');
    const {
        enhanceModel, setEnhanceModel,
        enhanceScale, setEnhanceScale,
        enhanceMethod, setEnhanceMethod,
    } = usePreprocessingStore();

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
                <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                    <MonitorPlay size={16} className="text-indigo-500" /> {t('tools.enhance.title')}
                </h4>
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                    {t('tools.enhance.description')}
                </p>
            </div>
            <div className="space-y-4">
                <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-400">{t('tools.enhance.method')}</label>
                    <Select
                        value={enhanceMethod}
                        options={[
                            { value: 'realesrgan', label: t('tools.enhance.methods.realesrgan') },
                            { value: 'basicvsr', label: t('tools.enhance.methods.basicvsr') },
                        ]}
                        onChange={(val) => {
                            setEnhanceMethod(val as string);
                            // Reset model based on new method
                            if (val === 'basicvsr') {
                                setEnhanceModel('basicvsr-plusplus');
                            } else {
                                setEnhanceModel('realesrgan-x4plus');
                            }
                        }}
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-400">{t('tools.enhance.model')}</label>
                    <Select
                        value={enhanceModel}
                        onChange={(val) => setEnhanceModel(val as string)}
                        options={enhanceMethod === 'basicvsr' ? [
                            { value: 'basicvsr-plusplus', label: 'BasicVSR++ (True Video AI - Slow but Best)' },
                        ] : [
                            { value: 'realesrgan-x4plus', label: 'RealESRGAN x4 Plus (General - High Quality)' },
                            { value: 'realesrgan-x4plus-anime', label: 'RealESRGAN x4 Plus Anime' },
                            { value: 'realesr-animevideov3', label: 'RealESR AnimeVideo v3 (Fastest for Anime)' },
                            { value: 'realesr-general-x4v3', label: 'RealESR General x4 v3 (Fastest for Real World)' },
                            { value: 'realesr-general-wdn-x4v3', label: 'RealESR General x4 v3 (Denoise)' },
                        ]}
                    />
                    {enhanceMethod === 'basicvsr' && (
                            <div className="text-[10px] text-amber-500 flex items-start gap-2 bg-amber-500/10 p-3 rounded-lg mt-2 border border-amber-500/20">
                                <span className="mt-0.5"><AlertTriangle size={14} /></span>
                                <div className="flex flex-col gap-1">
                                <span className="font-bold uppercase tracking-wider text-[10px]">{t('tools.enhance.performanceTitle')}</span>
                                <span className="opacity-90 leading-relaxed">
                                    {t('tools.enhance.performanceDescription')}
                                </span>
                            </div>
                        </div>
                    )}
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-400">{t('tools.enhance.scale')}</label>
                    <div className="grid grid-cols-3 gap-2">
                        {['2x', '4x'].map(s => (
                            <button
                                key={s}
                                onClick={() => setEnhanceScale(s)}
                                className={`border rounded-lg py-2 text-xs font-bold transition-colors focus:ring-1 ring-indigo-500 ${
                                    enhanceScale === s
                                        ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-400'
                                        : 'bg-white/5 hover:bg-white/10 border-white/5 text-slate-400'
                                }`}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
