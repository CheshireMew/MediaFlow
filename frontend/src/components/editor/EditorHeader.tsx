
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
    onExport: () => void;
    onTranslate: () => void;
    onDetectHighlights: () => void;
    isDetectingHighlights?: boolean;
    canDetectHighlights?: boolean;
    canExport?: boolean;
    canSave?: boolean;
    canTranslate?: boolean;
}

export function EditorHeader({
    mode,
    onModeChange,
    onOpenFile,
    onOpenSubtitle,
    onSave,
    onSaveAs,
    onExport,
    onTranslate,
    onDetectHighlights,
    isDetectingHighlights = false,
    canDetectHighlights = false,
    canExport = false,
    canSave = false,
    canTranslate = false,
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
                        aria-label={t('header.subtitleMode')}
                        className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors ${mode === "subtitles" ? "bg-indigo-500 text-white" : "text-slate-400 hover:text-white"}`}
                        title={t('header.subtitleModeTooltip')}
                    >
                        <Captions size={14} />
                        <span className="hidden 2xl:inline">{t('header.subtitleMode')}</span>
                    </button>
                    <button
                        onClick={() => onModeChange("clips")}
                        aria-label={t('header.clipMode')}
                        className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors ${mode === "clips" ? "bg-amber-500 text-black" : "text-slate-400 hover:text-white"}`}
                        title={t('header.clipModeTooltip')}
                    >
                        <Scissors size={14} />
                        <span className="hidden 2xl:inline">{t('header.clipMode')}</span>
                    </button>
                </div>

                <div className="flex items-center gap-1.5">
                    <ToolbarButton
                        onClick={onOpenFile}
                        aria-label={t('header.openButton')}
                        icon={FolderOpen}
                        variant="accent"
                        className="h-8 px-2.5 text-xs"
                        title={t('header.openFileTooltip')}
                    >
                        <span className="hidden min-[1100px]:inline">{t('header.openButton')}</span>
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={onOpenSubtitle}
                        aria-label={t('header.openSubtitleButton')}
                        icon={FileType2}
                        variant="subtle"
                        className="h-8 px-2.5 text-xs"
                        title={t('header.openSubtitleTooltip')}
                    >
                        <span className="hidden min-[1100px]:inline">{t('header.openSubtitleButton')}</span>
                    </ToolbarButton>
                </div>

                <div className="hidden h-6 w-px bg-white/10 2xl:block" />
                <ToolbarButton
                    onClick={onTranslate}
                    aria-label={t('header.translateButton')}
                    disabled={mode !== "subtitles" || !canTranslate}
                    icon={Languages}
                    variant="subtle"
                    className="h-8 px-2.5 text-xs text-purple-300 hover:text-purple-200 max-[900px]:hidden"
                    title={canTranslate ? t('header.translateTooltip') : t('header.translateRequiresSubtitlesTooltip')}
                >
                    <span className="hidden 2xl:inline">{t('header.translateButton')}</span>
                </ToolbarButton>
                <ToolbarButton
                    onClick={onDetectHighlights}
                    aria-label={t('header.detectHighlightsButton')}
                    disabled={isDetectingHighlights || !canDetectHighlights}
                    icon={Sparkles}
                    variant="warning"
                    className="h-8 px-2.5 text-xs max-[900px]:hidden"
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
                    onClick={onExport}
                    aria-label={t('header.exportButton')}
                    disabled={!canExport}
                    icon={Download}
                    variant="success"
                    className="h-8 px-3 text-xs"
                    title={canExport ? t('header.exportTooltip') : t('header.exportRequiresVideoTooltip')}
                >
                    <span className="hidden min-[1000px]:inline">{t('header.exportButton')}</span>
                </ToolbarButton>
                <div className="mx-2 hidden h-6 w-px bg-white/10 min-[1000px]:block" />
                <ToolbarButton
                    onClick={onSave}
                    aria-label={t('header.saveButton')}
                    disabled={!canSave}
                    icon={Save}
                    variant="primary"
                    className="h-8 px-2.5 text-xs font-bold min-[1000px]:px-3.5"
                    title={canSave ? t('header.saveButton') : t('header.saveRequiresVideoTooltip')}
                >
                    <span className="hidden min-[1000px]:inline">{t('header.saveButton')}</span>
                </ToolbarButton>
                <IconButton
                    onClick={onSaveAs}
                    aria-label={t('header.saveAsTooltip')}
                    disabled={!canSave}
                    icon={SaveAll}
                    variant="primary"
                    className="h-8 w-8"
                    title={canSave ? t('header.saveAsTooltip') : t('header.saveRequiresVideoTooltip')}
                />
                </>
            )}
        />
    );
}
