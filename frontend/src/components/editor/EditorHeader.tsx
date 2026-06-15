
import { Clapperboard, Save, SaveAll, Download, FolderOpen, Languages, FileType2, Captions, Scissors, Sparkles } from "lucide-react";
import { useTranslation } from 'react-i18next';
import { IconButton, PageHeader, ToolbarButton } from "../ui/PageChrome";

export type EditorWorkspaceMode = "subtitles" | "clips";

interface EditorHeaderProps {
    mode: EditorWorkspaceMode;
    onModeChange: (mode: EditorWorkspaceMode) => void;
    onOpenFile: () => void;
    onOpenSubtitle: () => void;
    onSave: () => void;
    onSaveAs: () => void;
    onSynthesize: () => void;
    onTranslate: () => void;
    onDetectHighlights: () => void;
    isDetectingHighlights?: boolean;
    canDetectHighlights?: boolean;
}

export function EditorHeader({
    mode,
    onModeChange,
    onOpenFile,
    onOpenSubtitle,
    onSave,
    onSaveAs,
    onSynthesize,
    onTranslate,
    onDetectHighlights,
    isDetectingHighlights = false,
    canDetectHighlights = false,
}: EditorHeaderProps) {
    const { t } = useTranslation('editor');
    return (
        <PageHeader
            icon={Clapperboard}
            title={t('header.title')}
            subtitle={t('header.subtitle')}
            actions={(
                <>
                <div className="flex items-center rounded-lg border border-white/10 bg-black/20 p-1">
                    <button
                        onClick={() => onModeChange("subtitles")}
                        className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors ${mode === "subtitles" ? "bg-indigo-500 text-white" : "text-slate-400 hover:text-white"}`}
                        title={t('header.subtitleModeTooltip')}
                    >
                        <Captions size={14} />
                        <span className="hidden 2xl:inline">{t('header.subtitleMode')}</span>
                    </button>
                    <button
                        onClick={() => onModeChange("clips")}
                        className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors ${mode === "clips" ? "bg-amber-500 text-black" : "text-slate-400 hover:text-white"}`}
                        title={t('header.clipModeTooltip')}
                    >
                        <Scissors size={14} />
                        <span className="hidden 2xl:inline">{t('header.clipMode')}</span>
                    </button>
                </div>

                <div className="hidden items-center gap-2 2xl:flex">
                    <ToolbarButton
                        onClick={onOpenFile}
                        icon={FolderOpen}
                        variant="accent"
                        className="h-8 px-3 text-xs"
                        title={t('header.openFileTooltip')}
                    >
                        {t('header.openButton')}
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={onOpenSubtitle}
                        icon={FileType2}
                        variant="subtle"
                        className="h-8 px-3 text-xs"
                        title={t('header.openSubtitleTooltip')}
                    >
                        {t('header.openSubtitleButton')}
                    </ToolbarButton>
                </div>

                <div className="hidden h-6 w-px bg-white/10 2xl:block" />
                <ToolbarButton
                    onClick={onTranslate}
                    disabled={mode !== "subtitles"}
                    icon={Languages}
                    variant="subtle"
                    className="h-8 px-2.5 text-xs text-purple-300 hover:text-purple-200"
                    title={t('header.translateTooltip')}
                >
                    <span className="hidden 2xl:inline">{t('header.translateButton')}</span>
                </ToolbarButton>
                <ToolbarButton
                    onClick={onDetectHighlights}
                    disabled={isDetectingHighlights || !canDetectHighlights}
                    icon={Sparkles}
                    variant="warning"
                    className="h-8 px-2.5 text-xs"
                    title={
                        canDetectHighlights
                            ? t('header.detectHighlightsTooltip')
                            : t('header.detectHighlightsRequiresSubtitlesTooltip')
                    }
                >
                    <span className="hidden 2xl:inline">
                        {isDetectingHighlights ? t('header.detectingHighlightsButton') : t('header.detectHighlightsButton')}
                    </span>
                </ToolbarButton>
                <ToolbarButton
                    onClick={onSynthesize}
                    icon={Download}
                    variant="success"
                    className="h-8 px-3 text-xs"
                    title={t('header.synthesizeTooltip')}
                >
                    <span>{t('header.synthesizeButton')}</span>
                </ToolbarButton>
                <div className="mx-2 h-6 w-px bg-white/10" />
                <ToolbarButton
                    onClick={onSave}
                    icon={Save}
                    variant="primary"
                    className="h-8 px-3.5 text-xs font-bold"
                >
                    {t('header.saveButton')}
                </ToolbarButton>
                <IconButton
                    onClick={onSaveAs}
                    icon={SaveAll}
                    variant="primary"
                    className="h-8 w-8"
                    title={t('header.saveAsTooltip')}
                />
                </>
            )}
        />
    );
}
