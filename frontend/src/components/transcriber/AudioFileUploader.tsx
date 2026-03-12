import React from "react";
import { Upload, FileAudio } from "lucide-react";
import { useTranslation } from 'react-i18next';

interface AudioFileUploaderProps {
  file: File | null;
  onFileSelect: () => void;
  onFileDrop: (e: React.DragEvent) => void;
  className?: string; // Removed onClearFile
}

export function AudioFileUploader({ file, onFileSelect, onFileDrop, className = "" }: AudioFileUploaderProps) {
  const { t } = useTranslation('transcriber');
  return (
    <div 
      onClick={onFileSelect}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onFileDrop}
      className={`group relative border border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-4 transition-all duration-300 cursor-pointer overflow-hidden ${className}
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
          <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20 shadow-inner group-hover:scale-105 transition-transform duration-300">
            <FileAudio className="w-8 h-8 text-purple-400" />
          </div>
          <div className="text-center z-10">
            <p className="font-semibold text-white mb-1.5">{file.name}</p>
            <div className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 text-purple-300 border border-purple-500/20">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </div>
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); onFileSelect(); }}
            className="px-4 py-2 text-xs font-medium bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-slate-300 hover:text-white transition-all z-10"
          >
            {t('uploader.replaceButton')}
          </button>
        </>
      ) : (
        <>
          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center border border-white/5 group-hover:bg-purple-500/10 group-hover:border-purple-500/20 transition-colors duration-300">
             <Upload className="w-8 h-8 text-slate-500 group-hover:text-purple-400 transition-colors duration-300" />
          </div>
          <div className="text-center z-10">
            <p className="text-slate-300 font-medium mb-1 group-hover:text-white transition-colors">{t('uploader.dragText')}</p>
            <p className="text-xs text-slate-500">{t('uploader.supportedFormats')}</p>
          </div>
        </>
      )}
    </div>
  );
}
