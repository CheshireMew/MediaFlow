// ── Subtitle Style Settings Panel (Left sidebar section) ──
import React from 'react';
import { Type, Bold, Italic, AlignLeft, AlignCenter, AlignRight, Save, Trash2, X, MonitorPlay } from 'lucide-react';
import { FONT_PRESETS, DEFAULT_PRESETS } from '../types';
import type { SubtitleStyleState } from '../hooks/useSubtitleStyle';

interface Props {
    style: SubtitleStyleState;
}

export const SubtitleStylePanel: React.FC<Props> = ({ style }) => {
    const {
        fontSize, fontColor, fontName, isBold, isItalic,
        outlineSize, shadowSize, outlineColor,
        bgEnabled, bgColor, bgOpacity, bgPadding, alignment,
        setFontSize, setFontColor, setFontName, setIsBold, setIsItalic,
        setOutlineSize, setShadowSize, setOutlineColor,
        setBgEnabled, setBgColor, setBgOpacity, setBgPadding, setAlignment,
        customPresets, presetNameInput, setPresetNameInput,
        confirmSavePreset, applyPreset, deletePreset,
    } = style;

    return (
        <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <Type size={12}/> Subtitles
            </h3>
            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4 space-y-4 hover:border-white/10 transition-colors">
                {/* Style Presets */}
                <div className="space-y-1.5">
                    <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Style Preset</label>
                    <div className="flex flex-wrap gap-1.5">
                        {[...DEFAULT_PRESETS, ...customPresets].map(preset => (
                            <button
                                key={preset.label}
                                onClick={() => applyPreset(preset)}
                                className="group/preset relative px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all bg-black/20 border-white/10 text-slate-300 hover:bg-indigo-500/10 hover:border-indigo-500/30 hover:text-indigo-300 active:scale-95"
                            >
                                {preset.label}
                                {!preset.isDefault && (
                                    <span
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            deletePreset(preset.label);
                                        }}
                                        className="ml-1 inline-flex items-center opacity-0 group-hover/preset:opacity-100 transition-opacity text-slate-500 hover:text-red-400"
                                        title="Delete preset"
                                    >
                                        <Trash2 size={10} />
                                    </span>
                                )}
                            </button>
                        ))}
                        {/* Save Current as Preset */}
                        {presetNameInput === null ? (
                            <button
                                onClick={() => setPresetNameInput('')}
                                className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-dashed transition-all border-white/10 text-slate-500 hover:bg-emerald-500/10 hover:border-emerald-500/30 hover:text-emerald-300 active:scale-95 flex items-center gap-1"
                                title="Save current settings as preset"
                            >
                                <Save size={10} /> Save
                            </button>
                        ) : (
                            <div className="flex items-center gap-1 w-full mt-1">
                                <input
                                    autoFocus
                                    type="text"
                                    value={presetNameInput}
                                    onChange={e => setPresetNameInput(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Escape') { setPresetNameInput(null); return; }
                                        if (e.key === 'Enter') confirmSavePreset();
                                    }}
                                    placeholder="Preset name..."
                                    className="flex-1 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-indigo-500/50"
                                />
                                <button
                                    onClick={confirmSavePreset}
                                    className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                                    title="Confirm"
                                >
                                    <Save size={12} />
                                </button>
                                <button
                                    onClick={() => setPresetNameInput(null)}
                                    className="p-1.5 rounded-lg bg-white/5 text-slate-500 hover:bg-white/10 hover:text-white transition-colors"
                                    title="Cancel"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Font Selection */}
                <div className="space-y-1.5">
                    <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Font</label>
                    <select
                        value={fontName}
                        onChange={e => setFontName(e.target.value)}
                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all cursor-pointer appearance-none"
                    >
                        {FONT_PRESETS.map(f => (
                            <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>
                        ))}
                    </select>
                </div>

                {/* Size + Color */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Size (px)</label>
                        <input 
                            type="number" 
                            value={fontSize} 
                            onChange={e => setFontSize(Number(e.target.value))}
                            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all font-mono"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Color</label>
                        <div className="flex gap-2 items-center h-[38px]">
                            <div className="relative overflow-hidden w-full h-full rounded-lg border border-white/10 cursor-pointer group">
                                <input 
                                    type="color" 
                                    value={fontColor}
                                    onChange={e => setFontColor(e.target.value)}
                                    className="absolute inset-0 w-[150%] h-[150%] -top-1/4 -left-1/4 cursor-pointer p-0 border-0"
                                />
                            </div>
                            <span className="text-xs font-mono text-slate-400">{fontColor}</span>
                        </div>
                    </div>
                </div>

                {/* Bold / Italic + Alignment */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsBold(!isBold)}
                        className={`p-2 rounded-lg border transition-all ${
                            isBold ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'bg-black/20 border-white/10 text-slate-400 hover:text-white hover:border-white/20'
                        }`}
                        title="Bold"
                    >
                        <Bold size={14} />
                    </button>
                    <button
                        onClick={() => setIsItalic(!isItalic)}
                        className={`p-2 rounded-lg border transition-all ${
                            isItalic ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'bg-black/20 border-white/10 text-slate-400 hover:text-white hover:border-white/20'
                        }`}
                        title="Italic"
                    >
                        <Italic size={14} />
                    </button>
                    <div className="w-px h-6 bg-white/10 mx-1" />
                    {/* Alignment */}
                    {([1, 2, 3] as const).map(a => (
                        <button
                            key={a}
                            onClick={() => setAlignment(a)}
                            className={`p-2 rounded-lg border transition-all ${
                                alignment === a ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'bg-black/20 border-white/10 text-slate-400 hover:text-white hover:border-white/20'
                            }`}
                            title={a === 1 ? 'Left' : a === 2 ? 'Center' : 'Right'}
                        >
                            {a === 1 ? <AlignLeft size={14} /> : a === 2 ? <AlignCenter size={14} /> : <AlignRight size={14} />}
                        </button>
                    ))}
                </div>

                {/* Outline + Shadow Sliders */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <div className="flex justify-between">
                            <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Outline</label>
                            <span className="text-[10px] font-mono text-indigo-400">{outlineSize}</span>
                        </div>
                        <input
                            type="range" min="0" max="4" step="1"
                            value={outlineSize}
                            onChange={e => setOutlineSize(Number(e.target.value))}
                            className="w-full accent-indigo-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <div className="flex justify-between">
                            <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Shadow</label>
                            <span className="text-[10px] font-mono text-indigo-400">{shadowSize}</span>
                        </div>
                        <input
                            type="range" min="0" max="4" step="1"
                            value={shadowSize}
                            onChange={e => setShadowSize(Number(e.target.value))}
                            className="w-full accent-indigo-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                </div>

                {/* Outline Color */}
                <div className="space-y-1.5">
                    <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Outline Color</label>
                    <div className="flex gap-2 items-center h-[32px]">
                        <div className="relative overflow-hidden w-12 h-full rounded-lg border border-white/10 cursor-pointer">
                            <input
                                type="color"
                                value={outlineColor}
                                onChange={e => setOutlineColor(e.target.value)}
                                className="absolute inset-0 w-[150%] h-[150%] -top-1/4 -left-1/4 cursor-pointer p-0 border-0"
                            />
                        </div>
                        <span className="text-xs font-mono text-slate-400">{outlineColor}</span>
                    </div>
                </div>
            </div>

            {/* Background Panel */}
            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4 space-y-3 hover:border-white/10 transition-colors">
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Background Panel</label>
                        <button
                            onClick={() => setBgEnabled(!bgEnabled)}
                            className={`relative w-9 h-5 rounded-full transition-colors ${
                                bgEnabled ? 'bg-indigo-500' : 'bg-white/10'
                            }`}
                        >
                            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                                bgEnabled ? 'translate-x-4' : 'translate-x-0.5'
                            }`} />
                        </button>
                    </div>
                    {bgEnabled && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">BG Color</label>
                                    <div className="flex gap-2 items-center h-[32px]">
                                        <div className="relative overflow-hidden w-12 h-full rounded-lg border border-white/10 cursor-pointer">
                                            <input
                                                type="color"
                                                value={bgColor}
                                                onChange={e => setBgColor(e.target.value)}
                                                className="absolute inset-0 w-[150%] h-[150%] -top-1/4 -left-1/4 cursor-pointer p-0 border-0"
                                            />
                                        </div>
                                        <span className="text-xs font-mono text-slate-400">{bgColor}</span>
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <div className="flex justify-between">
                                        <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Opacity</label>
                                        <span className="text-[10px] font-mono text-indigo-400">{Math.round(bgOpacity * 100)}%</span>
                                    </div>
                                    <input
                                        type="range" min="0.1" max="1.0" step="0.1"
                                        value={bgOpacity}
                                        onChange={e => setBgOpacity(parseFloat(e.target.value))}
                                        className="w-full accent-indigo-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                                    />
                                </div>
                            </div>
                            {/* Padding slider — controls ASS Outline in BorderStyle=3 */}
                            <div className="space-y-1.5">
                                <div className="flex justify-between">
                                    <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Padding</label>
                                    <span className="text-[10px] font-mono text-indigo-400">{bgPadding}px</span>
                                </div>
                                <input
                                    type="range" min="0" max="20" step="1"
                                    value={bgPadding}
                                    onChange={e => setBgPadding(parseInt(e.target.value))}
                                    className="w-full accent-indigo-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <p className="text-[10px] text-slate-600 flex items-center gap-1.5 bg-indigo-500/5 p-2 rounded-lg border border-indigo-500/10">
                <MonitorPlay size={10} className="text-indigo-400"/>
                Drag text in preview to adjust position.
            </p>
        </div>
    );
};
