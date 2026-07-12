import React from "react";
import { Upload, FileAudio } from "lucide-react";
import { useTranslation } from 'react-i18next';
import { FileNameLabel } from "../ui/FileNameLabel";
import { DropZone } from "../ui/DropZone";

interface AudioFileUploaderProps {
  file: File | null;
  onFileSelect: () => void;
  onFileDrop: (e: React.DragEvent) => void;
  className?: string; // Removed onClearFile
}

export function AudioFileUploader({ file, onFileSelect, onFileDrop, className = "" }: AudioFileUploaderProps) {
  const { t } = useTranslation('transcriber');
  return (
    <DropZone
      onActivate={onFileSelect}
      onDrop={onFileDrop}
      ariaLabel={file ? t('uploader.replaceButton') : t('uploader.dragText')}
      className={`group relative border border-dashed rounded-lg p-8 flex flex-col items-center justify-center gap-4 transition-all duration-300 cursor-pointer overflow-hidden ${className}
        ${file 
          ? 'border-purple-500/50 bg-purple-500/5 shadow-[0_0_20px_-5px_rgba(168,85,247,0.15)]' 
          : 'border-white/10 bg-black/20 hover:border-purple-500/30 hover:bg-black/30'
        }
      `}
    >
      {/* Background Pattern */}
      <div className={`absolute inset-0 opacity-[0.03] pointer-events-none transition-opacity duration-500 ${file ? 'opacity-[0.08]' : 'group-hover:opacity-[0.06]'}`}
         style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '16px 16px' }}
      />

      {file ? (
        <>
          <div className="w-16 h-16 rounded-lg bg-purple-500/10 flex items-center justify-center border border-purple-500/20 shadow-inner group-hover:scale-105 transition-transform duration-300">
            <FileAudio className="w-8 h-8 text-purple-400" />
          </div>
          <div className="z-10 flex w-full min-w-0 flex-col items-center text-center">
            <FileNameLabel name={file.name} className="mb-1.5" />
            <div className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-500/10 text-purple-300 border border-purple-500/20">
              {(file.size / 1024 / 1024).toFixed(2)} MB
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
          <div className="w-16 h-16 rounded-lg bg-white/5 flex items-center justify-center border border-white/5 group-hover:bg-purple-500/10 group-hover:border-purple-500/20 transition-colors duration-300">
             <Upload className="w-8 h-8 text-slate-400 group-hover:text-purple-400 transition-colors duration-300" />
          </div>
          <div className="text-center z-10">
            <p className="text-slate-300 font-medium mb-1 group-hover:text-white transition-colors">{t('uploader.dragText')}</p>
            <p className="text-xs text-slate-400">{t('uploader.supportedFormats')}</p>
          </div>
        </>
      )}
    </DropZone>
  );
}
