import { Upload, FileText } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { isDesktopRuntime } from '../../services/domain';
import { fileService } from '../../services/fileService';
import { FileNameLabel } from '../ui/FileNameLabel';
import { DropZone } from '../ui/DropZone';
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
            <DropZone
            onActivate={handleClick}
            onDrop={handleDrop}
            ariaLabel={currentFile ? t('uploader.replaceButton') : t('uploader.dragText')}
            className={`group relative border border-dashed rounded-lg p-8 flex flex-col items-center justify-center gap-4 transition-all duration-300 cursor-pointer overflow-hidden
                ${currentFile 
                ? 'border-indigo-500/50 bg-indigo-500/5 shadow-[0_0_20px_-5px_rgba(99,102,241,0.15)]' 
                : 'border-white/10 bg-black/20 hover:border-indigo-500/30 hover:bg-black/30'
                }
            `}
        >
             {/* Background Pattern */}
            <div className={`absolute inset-0 opacity-[0.03] pointer-events-none transition-opacity duration-500 ${currentFile ? 'opacity-[0.08]' : 'group-hover:opacity-[0.06]'}`}
                style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '16px 16px' }}
            />

            {currentFile ? (
                <>
                    <div className="w-16 h-16 rounded-lg bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 shadow-inner group-hover:scale-105 transition-transform duration-300">
                        <FileText className="w-8 h-8 text-indigo-400" />
                    </div>
                    <div className="z-10 flex w-full min-w-0 flex-col items-center text-center">
                        <FileNameLabel name={currentFile.name} className="mb-1.5" />
                        <div className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                            {t('uploader.readyStatus')}
                        </div>
                    </div>
                    <span
                        aria-hidden="true"
                        className="px-4 py-2 text-xs font-medium bg-white/5 group-hover:bg-white/10 border border-white/5 rounded-lg text-slate-300 group-hover:text-white transition-all z-10"
                    >
                        {t('uploader.replaceButton')}
                    </span>
                </>
            ) : (
                <>
                    <div className="w-16 h-16 rounded-lg bg-white/5 flex items-center justify-center border border-white/5 group-hover:bg-indigo-500/10 group-hover:border-indigo-500/20 transition-colors duration-300">
                        <Upload className="w-8 h-8 text-slate-400 group-hover:text-indigo-400 transition-colors duration-300" />
                    </div>
                    <div className="text-center z-10">
                        <p className="text-slate-300 font-medium mb-1 group-hover:text-white transition-colors">{t('uploader.dragText')}</p>
                        <p className="text-xs text-slate-400">{t('uploader.supportedFormats')}</p>
                    </div>
                </>
            )}
            </DropZone>
        </>
    );
};
