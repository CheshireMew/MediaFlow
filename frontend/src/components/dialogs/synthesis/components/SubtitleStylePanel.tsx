// ── Subtitle Style Settings Panel (Left sidebar section) ──
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Type, Bold, Italic, AlignLeft, AlignCenter, AlignRight, Save, Trash2, X, MonitorPlay, AlignStartVertical, AlignCenterVertical, AlignEndVertical, RotateCcw } from 'lucide-react';
import { FONT_PRESETS, DEFAULT_PRESETS } from '../../../../services/domain';
import type { SubtitleStyleState } from '../hooks/useSubtitleStyle';
import { isKeyboardEventComposing } from '../../../../utils/keyboardShortcuts';
import { PanelToggle } from './PanelToggle';

interface Props {
    style: SubtitleStyleState;
    enabled: boolean;
    available?: boolean;
    onToggle: (enabled: boolean) => void;
}

export const SubtitleStylePanel: React.FC<Props> = ({ style, enabled, available = true, onToggle }) => {
    const { t } = useTranslation('synthesis');
    const {
        fontSize, fontColor, fontName, isBold, isItalic,
        outlineSize, shadowSize, outlineColor,
        bgEnabled, bgColor, bgOpacity, bgPadding, alignment, multilineAlign,
        isFontAvailable, fontAvailabilityMessage,
        setFontSize, setFontColor, setFontName, setIsBold, setIsItalic,
        setOutlineSize, setShadowSize, setOutlineColor,
        setBgEnabled, setBgColor, setBgOpacity, setBgPadding, setAlignment, setMultilineAlign,
        customPresets, presetNameInput, setPresetNameInput,
        confirmSavePreset, applyPreset, deletePreset, resetSubPos,
    } = style;

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <Type size={12}/> {t('style.sectionTitle')}
                </h3>
                <PanelToggle
                     enabled={enabled}
                     onToggle={onToggle}
                     disabled={!available}
                    enableTitle={t('common:enable')}
                    disableTitle={t('common:disable')}
                />
            </div>
            {!available && (
                <p className="text-xs text-amber-500/80 bg-amber-500/[0.06] border border-amber-500/10 rounded-lg p-3 text-center">
                    {t('style.subtitleUnavailableHint')}
                </p>
            )}
            {available && !enabled && (
                <p className="text-xs text-slate-400 bg-white/[0.02] border border-white/5 rounded-lg p-3 text-center">
                    {t('style.subtitleDisabledHint')}
                </p>
            )}
            {available && enabled && (
            <>
            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4 space-y-4 hover:border-white/10 transition-colors">
                {/* Style Presets */}
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">{t('style.stylePreset')}</label>
                    <div className="flex flex-wrap gap-1.5">
                        {[...DEFAULT_PRESETS, ...customPresets].map(preset => (
                            <div key={preset.label} className="group/preset inline-flex items-stretch">
                              <button
                                type="button"
                                onClick={() => applyPreset(preset)}
                                className={`relative border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-indigo-300 active:scale-95 ${preset.isDefault ? 'rounded-lg' : 'rounded-l-lg'}`}
                              >
                                {preset.translationKey ? t(preset.translationKey) : preset.label}
                              </button>
                                {!preset.isDefault && (
                                    <button
                                        type="button"
                                        onClick={() => deletePreset(preset.label)}
                                        aria-label={t('style.deletePresetNamed', { name: preset.label })}
                                        className="inline-flex items-center rounded-r-lg border border-l-0 border-white/10 px-1.5 text-slate-400 opacity-100 transition-all hover:bg-rose-500/10 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 md:opacity-0 md:group-hover/preset:opacity-100 md:group-focus-within/preset:opacity-100"
                                        title={t('style.deletePreset')}
                                    >
                                        <Trash2 size={10} />
                                    </button>
                                )}
                            </div>
                        ))}
                        {/* Save Current as Preset */}
                        {presetNameInput === null ? (
                            <button
                                type="button"
                                onClick={() => setPresetNameInput('')}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-dashed transition-all border-white/10 text-slate-400 hover:bg-emerald-500/10 hover:border-emerald-500/30 hover:text-emerald-300 active:scale-95 flex items-center gap-1"
                                title={t('style.savePresetTooltip')}
                            >
                                <Save size={10} /> {t('style.save')}
                            </button>
                        ) : (
                            <div className="flex items-center gap-1 w-full mt-1">
                                <input
                                    autoFocus
                                    type="text"
                                    aria-label={t('style.presetNamePlaceholder')}
                                    value={presetNameInput}
                                    onChange={e => setPresetNameInput(e.target.value)}
                                    onKeyDown={e => {
                                        if (isKeyboardEventComposing(e.nativeEvent)) {
                                            return;
                                        }
                                        if (e.key === 'Escape') { setPresetNameInput(null); return; }
                                        if (e.key === 'Enter') confirmSavePreset();
                                    }}
                                    placeholder={t('style.presetNamePlaceholder')}
                                    className="flex-1 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/50"
                                />
                                <button
                                    type="button"
                                    aria-label={t('style.save')}
                                    onClick={confirmSavePreset}
                                    className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                                    title={t('style.save')}
                                >
                                    <Save size={12} />
                                </button>
                                <button
                                    type="button"
                                    aria-label={t('common:cancel')}
                                    onClick={() => setPresetNameInput(null)}
                                    className="p-1.5 rounded-lg bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
                                    title={t('common:cancel')}
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Font Selection */}
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">{t('style.font')}</label>
                    <select
                        aria-label={t('style.font')}
                        value={fontName}
                        onChange={e => setFontName(e.target.value)}
                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all cursor-pointer appearance-none"
                    >
                        {FONT_PRESETS.map(f => (
                            <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>
                        ))}
                    </select>
                    {!isFontAvailable && (
                        <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2">
                            {fontAvailabilityMessage}
                        </p>
                    )}
                </div>

                {/* Size + Color */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">{t('style.sizePx')}</label>
                        <input 
                            type="number" 
                            aria-label={t('style.sizePx')}
                            value={fontSize} 
                            onChange={e => setFontSize(Number(e.target.value))}
                            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all font-mono"
                        />
                        <p className="text-xs leading-relaxed text-slate-400">
                            {t('style.sizeHint')}
                        </p>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">{t('style.color')}</label>
                        <div className="flex gap-2 items-center h-[38px]">
                            <div className="relative overflow-hidden w-full h-full rounded-lg border border-white/10 cursor-pointer group">
                                <input 
                                    type="color" 
                                    aria-label={t('style.color')}
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
                        type="button"
                        aria-label={t('style.bold')}
                        aria-pressed={isBold}
                        onClick={() => setIsBold(!isBold)}
                        className={`p-2 rounded-lg border transition-all ${
                            isBold ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'bg-black/20 border-white/10 text-slate-400 hover:text-white hover:border-white/20'
                        }`}
                        title={t('style.bold')}
                    >
                        <Bold size={14} />
                    </button>
                    <button
                        type="button"
                        aria-label={t('style.italic')}
                        aria-pressed={isItalic}
                        onClick={() => setIsItalic(!isItalic)}
                        className={`p-2 rounded-lg border transition-all ${
                            isItalic ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'bg-black/20 border-white/10 text-slate-400 hover:text-white hover:border-white/20'
                        }`}
                        title={t('style.italic')}
                    >
                        <Italic size={14} />
                    </button>
                    <div className="w-px h-6 bg-white/10 mx-1" />
                    {/* Alignment */}
                    {([1, 2, 3] as const).map(a => (
                        <button
                            key={a}
                            type="button"
                            aria-label={a === 1 ? t('style.alignLeft') : a === 2 ? t('style.alignCenter') : t('style.alignRight')}
                            aria-pressed={alignment === a}
                            onClick={() => setAlignment(a)}
                            className={`p-2 rounded-lg border transition-all ${
                                alignment === a ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'bg-black/20 border-white/10 text-slate-400 hover:text-white hover:border-white/20'
                            }`}
                            title={a === 1 ? t('style.alignLeft') : a === 2 ? t('style.alignCenter') : t('style.alignRight')}
                        >
                            {a === 1 ? <AlignLeft size={14} /> : a === 2 ? <AlignCenter size={14} /> : <AlignRight size={14} />}
                        </button>
                    ))}
                </div>

                {/* Outline + Shadow Sliders */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <div className="flex justify-between">
                            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">{t('style.outline')}</label>
                            <span className="text-xs font-mono text-indigo-400">{outlineSize}</span>
                        </div>
                        <input
                            aria-label={t('style.outline')}
                            type="range" min="0" max="4" step="1"
                            value={outlineSize}
                            onChange={e => setOutlineSize(Number(e.target.value))}
                            className="w-full accent-indigo-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <div className="flex justify-between">
                            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">{t('style.shadow')}</label>
                            <span className="text-xs font-mono text-indigo-400">{shadowSize}</span>
                        </div>
                        <input
                            aria-label={t('style.shadow')}
                            type="range" min="0" max="4" step="1"
                            value={shadowSize}
                            onChange={e => setShadowSize(Number(e.target.value))}
                            className="w-full accent-indigo-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                </div>

                {/* Outline Color */}
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">{t('style.outlineColor')}</label>
                    <div className="flex gap-2 items-center h-[32px]">
                        <div className="relative overflow-hidden w-12 h-full rounded-lg border border-white/10 cursor-pointer">
                            <input
                                type="color"
                                aria-label={t('style.outlineColor')}
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
                        <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">{t('style.backgroundPanel')}</label>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={bgEnabled}
                            aria-label={t('style.backgroundPanel')}
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
                                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">{t('style.bgColor')}</label>
                                    <div className="flex gap-2 items-center h-[32px]">
                                        <div className="relative overflow-hidden w-12 h-full rounded-lg border border-white/10 cursor-pointer">
                                            <input
                                                type="color"
                                                aria-label={t('style.bgColor')}
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
                                        <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">{t('style.opacity')}</label>
                                        <span className="text-xs font-mono text-indigo-400">{Math.round(bgOpacity * 100)}%</span>
                                    </div>
                                    <input
                                        aria-label={t('style.opacity')}
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
                                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">{t('style.padding')}</label>
                                    <span className="text-xs font-mono text-indigo-400">{bgPadding}px</span>
                                </div>
                                <input
                                    aria-label={t('style.padding')}
                                    type="range" min="0" max="20" step="1"
                                    value={bgPadding}
                                    onChange={e => setBgPadding(parseInt(e.target.value))}
                                    className="w-full accent-indigo-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                            {/* Multi-line Vertical Alignment */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">{t('style.lineAlign')}</label>
                                <div className="flex gap-1.5">
                                    {(['bottom', 'center', 'top'] as const).map(mode => (
                                        <button
                                            key={mode}
                                            type="button"
                                            aria-pressed={multilineAlign === mode}
                                            onClick={() => setMultilineAlign(mode)}
                                            className={`flex-1 flex items-center justify-center gap-1.5 p-2 rounded-lg border text-xs font-medium transition-all ${
                                                multilineAlign === mode
                                                    ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                                                    : 'bg-black/20 border-white/10 text-slate-400 hover:text-white hover:border-white/20'
                                            }`}
                                            title={mode === 'bottom' ? t('style.bottomAligned') : mode === 'center' ? t('style.centerAligned') : t('style.topAligned')}
                                        >
                                            {mode === 'bottom' ? <AlignEndVertical size={12} /> : mode === 'center' ? <AlignCenterVertical size={12} /> : <AlignStartVertical size={12} />}
                                            {mode === 'bottom' ? t('style.alignBottom') : mode === 'center' ? t('style.alignCenter') : t('style.alignTop')}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-2">
                <p className="flex-1 text-xs text-slate-400 flex items-center gap-1.5 bg-indigo-500/5 p-2 rounded-lg border border-indigo-500/10">
                    <MonitorPlay size={10} className="text-indigo-400"/>
                    {t('style.dragHint')}
                </p>
                <button
                    type="button"
                    onClick={resetSubPos}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 bg-black/20 text-xs font-medium text-slate-300 hover:text-white hover:border-white/20 hover:bg-white/5 transition-all"
                    title={t('style.resetPosition')}
                >
                    <RotateCcw size={12} />
                    {t('style.resetPosition')}
                </button>
            </div>
            </>
            )}
        </div>
    );
};
