// ── Watermark Settings Panel (Left sidebar section) ──
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Image as ImageIcon } from 'lucide-react';
import type { WatermarkState } from '../hooks/useWatermark';

interface Props {
    watermark: WatermarkState;
    enabled: boolean;
    onToggle: (enabled: boolean) => void;
}

export const WatermarkPanel: React.FC<Props> = ({ watermark, enabled, onToggle }) => {
    const { t } = useTranslation('synthesis');
    const {
        watermarkPreviewUrl,
        wmScale, wmOpacity,
        setWmScale, setWmOpacity,
        handleWatermarkSelect,
        applyWmPositionPreset,
    } = watermark;

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <ImageIcon size={12}/> {t('watermark.sectionTitle')}
                </h3>
                <button
                    onClick={() => onToggle(!enabled)}
                    className={`relative w-9 h-5 rounded-full transition-colors ${
                        enabled ? 'bg-indigo-500' : 'bg-white/10'
                    }`}
                    title={enabled ? t('common:disable') : t('common:enable')}
                >
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        enabled ? 'translate-x-4' : 'translate-x-0.5'
                    }`} />
                </button>
            </div>
            {!enabled && (
                <p className="text-[10px] text-slate-600 bg-white/[0.02] border border-white/5 rounded-lg p-3 text-center">
                    {t('watermark.watermarkDisabledHint', '水印渲染已关闭，合成时将不会添加水印')}
                </p>
            )}
            {enabled && (
            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4 space-y-4 hover:border-white/10 transition-colors">
                <label className="flex flex-col items-center justify-center w-full h-16 border-2 border-dashed border-white/10 rounded-lg cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all group">
                    <div className="flex flex-col items-center justify-center pt-2 pb-3">
                        <p className="text-xs text-slate-400 group-hover:text-indigo-300">
                            {watermarkPreviewUrl ? t('watermark.replaceWatermark') : t('watermark.uploadImage')}
                        </p>
                    </div>
                    <input 
                        type="file" 
                        accept="image/png,image/jpeg,.psd"
                        onChange={handleWatermarkSelect}
                        className="hidden"
                    />
                </label>

                {watermarkPreviewUrl && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 px-3 py-2 rounded-lg border border-emerald-500/20">
                            <span className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px]">✓</span>
                            {t('watermark.active')}
                        </div>
                        
                        {/* Position Grid */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">{t('watermark.positionPreset')}</label>
                            <div className="grid grid-cols-3 gap-1.5 p-1.5 bg-black/20 rounded-lg border border-white/5">
                                {['TL', 'TC', 'TR', 'LC', 'C', 'RC', 'BL', 'BC', 'BR'].map(p => (
                                    <button 
                                        key={p}
                                        onClick={() => applyWmPositionPreset(p as any)}
                                        className="p-2 rounded hover:bg-white/10 flex justify-center items-center bg-white/5 aspect-square transition-all active:scale-95 group"
                                        title={p}
                                    >
                                        <div className={`w-1.5 h-1.5 bg-slate-500 group-hover:bg-white rounded-sm transition-colors ${
                                            p.includes('C') && p.length===1 ? 'scale-150' : ''
                                        }`} />
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <div className="flex justify-between">
                                    <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">{t('watermark.scale')}</label>
                                    <span className="text-[10px] font-mono text-indigo-400">{Math.round(wmScale * 100)}%</span>
                                </div>
                                <input 
                                    type="range" min="0.05" max="1.0" step="0.05"
                                    value={wmScale}
                                    onChange={e => setWmScale(parseFloat(e.target.value))}
                                    className="w-full accent-indigo-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <div className="flex justify-between">
                                    <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">{t('watermark.opacity')}</label>
                                    <span className="text-[10px] font-mono text-indigo-400">{Math.round(wmOpacity * 100)}%</span>
                                </div>
                                <input 
                                    type="range" min="0.1" max="1.0" step="0.1"
                                    value={wmOpacity}
                                    onChange={e => setWmOpacity(parseFloat(e.target.value))}
                                    className="w-full accent-indigo-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
            )}
        </div>
    );
};
