
import { Clapperboard, Save, Download, FolderOpen, Languages, FileType2 } from "lucide-react";
import React from "react";
import { useTranslation } from 'react-i18next';

type AppRegionStyle = React.CSSProperties & {
    WebkitAppRegion: "drag" | "no-drag";
};

interface EditorHeaderProps {
    autoScroll: boolean;
    setAutoScroll: (enabled: boolean) => void;
    onOpenFile: () => void;
    onOpenSubtitle: () => void;
    onSave: () => void;
    onSaveAs: () => void;
    onSynthesize: () => void;
    onTranslate: () => void;
}

export function EditorHeader({
    autoScroll: _autoScroll,
    setAutoScroll: _setAutoScroll,
    onOpenFile,
    onOpenSubtitle,
    onSave,
    onSaveAs,
    onSynthesize,
    onTranslate
}: EditorHeaderProps) {
    const { t } = useTranslation('editor');
    const dragRegionStyle: AppRegionStyle = { WebkitAppRegion: 'drag' };
    const noDragRegionStyle: AppRegionStyle = { WebkitAppRegion: 'no-drag' };
    return (
        <header 
            className="flex-none pt-6 pb-6 pl-6 pr-32 flex items-center justify-between select-none relative z-50 transition-all"
            style={dragRegionStyle}
        >
            {/* Window Controls Safe Zone (Absolute Top Right) */}
            <div className="absolute top-0 right-0 w-32 h-10 z-50 no-drag" style={noDragRegionStyle} />
            {/* Left: Brand & File */}
            <div className="flex items-center gap-5 no-drag" style={noDragRegionStyle}>
                <div className="flex items-center gap-4">
                    <div className="p-2 bg-gradient-to-br from-indigo-500/20 to-violet-500/20 rounded-2xl border border-white/5 shadow-lg shadow-indigo-500/10">
                        <Clapperboard className="w-6 h-6 text-indigo-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white tracking-tight leading-none">{t('header.title')}</h1>
                        <p className="text-slate-400 text-sm font-medium tracking-wide mt-1">{t('header.subtitle')}</p>
                    </div>
                </div>
                
                <div className="h-8 w-[1px] bg-white/5 mx-2" />
                
                <button 
                  onClick={onOpenFile} 
                  className="flex items-center gap-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 hover:border-indigo-500/30 text-indigo-300 px-4 py-2 rounded-lg text-xs font-medium transition-all shadow-sm active:scale-95 group"
                  title={t('header.openFileTooltip')}
                >
                    <FolderOpen size={16} className="group-hover:text-indigo-200 transition-colors" />
                    <span>{t('header.openButton')}</span>
                </button>

                <button
                  onClick={onOpenSubtitle}
                  className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 text-slate-300 px-4 py-2 rounded-lg text-xs font-medium transition-all shadow-sm active:scale-95 group"
                  title={t('header.openSubtitleTooltip')}
                >
                    <FileType2 size={16} className="group-hover:text-white transition-colors" />
                    <span>{t('header.openSubtitleButton')}</span>
                </button>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-4 no-drag" style={noDragRegionStyle}>
                 <div className="flex items-center gap-2">
                     <button 
                        onClick={onTranslate}
                        className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 text-purple-300 px-4 py-2 rounded-lg text-xs font-medium transition-all shadow-sm active:scale-95 group"
                        title={t('header.translateTooltip')}
                     >
                         <Languages size={16} className="group-hover:text-purple-200 transition-colors" />
                         <span className="hidden xl:inline">{t('header.translateButton')}</span>
                     </button>

                     <button 
                        onClick={onSynthesize}
                        className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 text-emerald-300 px-4 py-2 rounded-lg text-xs font-medium transition-all shadow-sm active:scale-95 group"
                        title={t('header.synthesizeTooltip')}
                     >
                         <Download size={16} className="group-hover:text-emerald-200 transition-colors" />
                         <span>{t('header.synthesizeButton')}</span>
                     </button>
                 </div>

                 <div className="h-6 w-[1px] bg-white/10 mx-1" />

                 <button 
                     onClick={onSave}
                     className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-l-lg text-xs font-bold transition-all shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 active:scale-95 ml-1"
                 >
                     <Save size={16} /> {t('header.saveButton')}
                 </button>
                 <button 
                     onClick={onSaveAs}
                     className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-r-lg border-l border-indigo-700 text-xs font-bold transition-all shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 active:scale-95"
                     title={t('header.saveAsTooltip')}
                 >
                    <FolderOpen size={14} />
                 </button>

            </div>
        </header>
    );
}
