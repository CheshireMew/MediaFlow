import { Eraser, Move } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePreprocessingStore } from '../../../stores/preprocessingStore';
import { Select } from '../../ui/Select';

export const CleanTab = () => {
    const { t } = useTranslation('preprocessing');
    const { cleanMethod, setCleanMethod } = usePreprocessingStore();

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
                <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                    <Eraser size={16} className="text-rose-500" /> {t('tools.clean.title')}
                </h4>
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                    {t('tools.clean.description')}
                </p>
            </div>
            <button className="w-full py-3 border border-dashed border-white/20 rounded-lg flex items-center justify-center gap-2 text-xs font-bold text-slate-400 hover:text-white hover:border-white/40 hover:bg-white/5 transition-all">
                <Move size={14} /> {t('tools.clean.drawSelection')}
            </button>
            <div className="space-y-2">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('tools.clean.regions')}</div>
                <div className="bg-black/20 rounded-lg p-3 border border-white/5 flex justify-between items-center group">
                    <span className="text-xs">{t('tools.clean.regionLabel', { index: 1 })}</span>
                    <button className="text-slate-600 hover:text-rose-500"><Eraser size={14} /></button>
                </div>
            </div>
            <div className="space-y-2">
                <label className="text-xs font-medium text-slate-400">{t('tools.clean.method')}</label>
                <Select
                    value={cleanMethod}
                    onChange={(val) => setCleanMethod(val as string)}
                    options={[
                        { value: 'telea', label: t('tools.clean.methods.telea') },
                        { value: 'navier', label: t('tools.clean.methods.navier') },
                        { value: 'propainter', label: t('tools.clean.methods.propainter') },
                    ]}
                />
                {cleanMethod === 'propainter' && (
                    <div className="text-[10px] text-amber-500 flex items-start gap-1 bg-amber-500/10 p-2 rounded">
                        <span>⚠️</span>
                        <span>{t('tools.clean.cpuWarning')}</span>
                    </div>
                )}
            </div>
        </div>
    );
};
