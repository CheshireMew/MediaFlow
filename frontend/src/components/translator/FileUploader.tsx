import { FileText } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { isDesktopRuntime } from '../../services/domain';
import { fileService } from '../../services/fileService';
import { FileUploadCard } from '../ui/FileUploadCard';
import {
    isSupportedTranslatorSubtitlePath,
    TRANSLATOR_SUBTITLE_EXTENSIONS,
} from '../../hooks/translator/translatorFileHelpers';
import {
    mediaReferenceFromPath,
    type MediaReference,
} from '../../services/ui/mediaReference';

type DragFileWithPath = File & { path?: string };

interface FileUploaderProps {
    onFileSelect: (reference: MediaReference) => void;
    currentFile: MediaReference | null;
}

export const FileUploader = ({ onFileSelect, currentFile }: FileUploaderProps) => {
    const { t } = useTranslation('translator');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const acceptedSubtitleTypes = TRANSLATOR_SUBTITLE_EXTENSIONS.join(",");

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0] as DragFileWithPath | undefined;
        if (file && isDesktopRuntime() && isSupportedTranslatorSubtitlePath(file.name)) {
            const filePath = file.path ?? fileService.getPathForFile(file);
            const reference = filePath
                ? mediaReferenceFromPath(filePath, {
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    origin: 'file-selection',
                })
                : null;
            if (reference) onFileSelect(reference);
        }
    };

    const handleClick = () => {
        fileInputRef.current?.click();
    };

    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] as DragFileWithPath | undefined;
        if (file && isSupportedTranslatorSubtitlePath(file.name)) {
             const filePath = file.path ?? (isDesktopRuntime() ? fileService.getPathForFile(file) : undefined);
             const reference = filePath
                ? mediaReferenceFromPath(filePath, {
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    origin: 'file-selection',
                })
                : null;
             if (reference) onFileSelect(reference);
        }
    };

    return (
        <>
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept={acceptedSubtitleTypes}
                onChange={handleInput}
            />
            <FileUploadCard
                fileName={currentFile?.name ?? null}
                selectedDetail={t('uploader.readyStatus')}
                emptyTitle={t('uploader.dragText')}
                emptyDetail={t('uploader.supportedFormats')}
                replaceLabel={t('uploader.replaceButton')}
                ariaLabel={currentFile ? t('uploader.replaceButton') : t('uploader.dragText')}
                icon={FileText}
                onActivate={handleClick}
                onDrop={handleDrop}
            />
        </>
    );
};
