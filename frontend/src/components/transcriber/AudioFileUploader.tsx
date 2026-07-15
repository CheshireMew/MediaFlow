import React from "react";
import { FileAudio } from "lucide-react";
import { useTranslation } from 'react-i18next';
import { FileUploadCard } from "../ui/FileUploadCard";

interface AudioFileUploaderProps {
  file: File | null;
  onFileSelect: () => void;
  onFileDrop: (e: React.DragEvent) => void;
  className?: string; // Removed onClearFile
}

export function AudioFileUploader({ file, onFileSelect, onFileDrop, className = "" }: AudioFileUploaderProps) {
  const { t } = useTranslation('transcriber');
  return (
    <FileUploadCard
      fileName={file?.name ?? null}
      selectedDetail={file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : ""}
      emptyTitle={t('uploader.dragText')}
      emptyDetail={t('uploader.supportedFormats')}
      replaceLabel={t('uploader.replaceButton')}
      icon={FileAudio}
      theme="purple"
      onActivate={onFileSelect}
      onDrop={onFileDrop}
      ariaLabel={file ? t('uploader.replaceButton') : t('uploader.dragText')}
      className={className}
    />
  );
}
