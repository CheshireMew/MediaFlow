// ── Watermark Settings Panel (Left sidebar section) ──
import React from 'react';
import { Image as ImageIcon } from 'lucide-react';
import type { WatermarkState } from '../hooks/useWatermark';

interface Props {
    watermark: WatermarkState;
}

export const WatermarkPanel: React.FC<Props> = ({ watermark }) => {
    const {
        watermarkPreviewUrl,
        wmScale, wmOpacity,
        setWmScale, setWmOpacity,
        handleWatermarkSelect,
        applyWmPositionPreset,
    } = watermark;

    return (
        <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <ImageIcon size={12}/> Watermark
            </h3>
            
            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4 space-y-4 hover:border-white/10 transition-colors">
                <label className="flex flex-col items-center justify-center w-full h-16 border-2 border-dashed border-white/10 rounded-lg cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all group">
                    <div className="flex flex-col items-center justify-center pt-2 pb-3">
                        <p className="text-xs text-slate-400 group-hover:text-indigo-300">
                            {watermarkPreviewUrl ? "Replace watermark" : "Upload image"}
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
                            Active
                        </div>
                        
                        {/* Position Grid */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Position Preset</label>
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
                                    <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Scale</label>
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
                                    <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Opacity</label>
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
        </div>
    );
};
