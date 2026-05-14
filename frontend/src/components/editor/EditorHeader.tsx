
import { Clapperboard, Save, SaveAll, Download, FolderOpen, Languages, FileType2 } from "lucide-react";
import { useTranslation } from 'react-i18next';
import { IconButton, PageHeader, ToolbarButton } from "../ui/PageChrome";

interface EditorHeaderProps {
    onOpenFile: () => void;
    onOpenSubtitle: () => void;
    onSave: () => void;
    onSaveAs: () => void;
    onSynthesize: () => void;
    onTranslate: () => void;
}

export function EditorHeader({
    onOpenFile,
    onOpenSubtitle,
    onSave,
    onSaveAs,
    onSynthesize,
    onTranslate
}: EditorHeaderProps) {
    const { t } = useTranslation('editor');
    return (
        <PageHeader
            icon={Clapperboard}
            title={t('header.title')}
            subtitle={t('header.subtitle')}
            actions={(
                <>
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
                    icon={Languages}
                    variant="subtle"
                    className="h-8 px-2.5 text-xs text-purple-300 hover:text-purple-200"
                    title={t('header.translateTooltip')}
                >
                    <span className="hidden 2xl:inline">{t('header.translateButton')}</span>
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
